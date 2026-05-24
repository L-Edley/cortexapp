import pytest
from typing import List, Dict, Any


class TestRuntimeState:
    def test_default_state(self):
        from aion.runtime.runtime_manager import RuntimeState
        s = RuntimeState()
        assert not s.running
        assert s.active_sessions == 0
        assert s.active_jobs == 0
        assert s.runtime_mode == "idle"
        assert s.uptime_seconds == 0.0


class TestRuntimeManager:
    def test_start_stop(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        assert not mgr.get_state().running
        mgr.start()
        assert mgr.get_state().running
        assert mgr.get_state().runtime_mode == "active"
        mgr.stop()
        assert not mgr.get_state().running

    def test_pause_resume(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.pause()
        assert mgr.get_state().runtime_mode == "paused"
        mgr.resume()
        assert mgr.get_state().runtime_mode == "active"

    def test_register_job(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        ok = mgr.register_job("job1", "study", "test study")
        assert ok
        assert mgr.get_state().active_jobs == 1

    def test_register_job_max_limit(self):
        from aion.runtime.runtime_manager import RuntimeManager
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        from aion.runtime import safety_governor as sg_module
        gov = SafetyGovernor(limits=SafetyLimits(max_background_jobs=2))
        original = sg_module.get_safety_governor
        sg_module.get_safety_governor = lambda: gov
        try:
            mgr = RuntimeManager()
            mgr.start()
            assert mgr.register_job("j1", "study")
            assert mgr.register_job("j2", "study")
            assert not mgr.register_job("j3", "study")
            assert mgr.get_state().active_jobs == 2
        finally:
            sg_module.get_safety_governor = original

    def test_complete_job(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.register_job("job1", "study")
        mgr.complete_job("job1")
        assert mgr.get_state().active_jobs == 0
        assert mgr.get_state().total_jobs_completed == 1

    def test_complete_job_with_error(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.register_job("job1", "study")
        mgr.complete_job("job1", error="test error")
        assert mgr.get_state().total_errors == 1
        assert mgr.get_state().last_error == "test error"

    def test_session_tracking(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.register_session()
        assert mgr.get_state().active_sessions == 1
        assert mgr.get_state().total_sessions_created == 1
        mgr.unregister_session()
        assert mgr.get_state().active_sessions == 0

    def test_unregister_session_min_zero(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.unregister_session()
        assert mgr.get_state().active_sessions == 0

    def test_get_active_jobs(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.register_job("j1", "study", "test")
        jobs = mgr.get_active_jobs()
        assert len(jobs) == 1
        assert jobs[0]["id"] == "j1"

    def test_set_mode(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.set_mode("paused")
        assert mgr.get_state().runtime_mode == "paused"
        mgr.set_mode("active")
        assert mgr.get_state().runtime_mode == "active"

    def test_invalid_mode_ignored(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        mgr.start()
        mgr.set_mode("invalid_mode")
        assert mgr.get_state().runtime_mode == "active"

    def test_singleton(self):
        from aion.runtime.runtime_manager import get_runtime_manager, RuntimeManager
        m1 = get_runtime_manager()
        m2 = get_runtime_manager()
        assert m1 is m2


class TestSafety:
    def test_no_execute_methods(self):
        from aion.runtime.runtime_manager import RuntimeManager
        mgr = RuntimeManager()
        assert not hasattr(mgr, "execute")
        assert not hasattr(mgr, "shell")
        assert not hasattr(mgr, "delete_data")
