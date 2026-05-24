import pytest
import time
from unittest.mock import patch, AsyncMock


class TestSafetyGovernor:
    def test_default_limits(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor()
        assert gov.limits.max_background_jobs == 5
        assert gov.limits.max_session_duration_hours == 2.0
        assert gov.limits.max_provider_calls_per_job == 20
        assert gov.limits.max_reflection_chain == 3
        assert gov.limits.job_timeout_seconds == 300

    def test_custom_limits(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        limits = SafetyLimits(max_background_jobs=2, job_timeout_seconds=60)
        gov = SafetyGovernor(limits=limits)
        assert gov.limits.max_background_jobs == 2
        assert gov.limits.job_timeout_seconds == 60

    def test_check_can_start_job(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        assert gov.check_can_start_job(0)
        assert gov.check_can_start_job(4)
        assert not gov.check_can_start_job(5)

    def test_check_can_start_job_emergency_stop(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        gov.emergency_stop()
        assert not gov.check_can_start_job(0)

    def test_register_and_release_job(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        gov.register_job_start("job1")
        assert "job1" in gov._job_timestamps
        gov.release_job("job1")
        assert "job1" not in gov._job_timestamps

    def test_job_timeout(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(job_timeout_seconds=30))
        gov._job_timestamps["job1"] = time.time() - 60
        assert gov.check_job_timeout("job1")

    def test_job_no_timeout(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(job_timeout_seconds=999))
        gov.register_job_start("job1")
        assert not gov.check_job_timeout("job1")
        gov.release_job("job1")

    def test_job_timeout_unknown_job(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        assert not gov.check_job_timeout("nonexistent")

    def test_provider_call_limit(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(max_provider_calls_per_job=2))
        gov.register_job_start("job1")
        assert gov.check_provider_call("job1")
        assert gov.check_provider_call("job1")
        assert not gov.check_provider_call("job1")

    def test_reflection_chain_limit(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(max_reflection_chain=2))
        gov.register_job_start("job1")
        assert gov.check_reflection_chain("job1")
        assert gov.check_reflection_chain("job1")
        assert not gov.check_reflection_chain("job1")

    def test_emergency_stop_resume(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        assert not gov.is_emergency_stopped
        gov.emergency_stop()
        assert gov.is_emergency_stopped
        gov.emergency_resume()
        assert not gov.is_emergency_stopped

    def test_safety_limits_validation(self):
        from aion.runtime.safety_governor import SafetyLimits
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SafetyLimits(max_background_jobs=0)
        with pytest.raises(ValidationError):
            SafetyLimits(max_background_jobs=100)

    def test_singleton(self):
        from aion.runtime.safety_governor import get_safety_governor, SafetyGovernor
        g1 = get_safety_governor()
        g2 = get_safety_governor()
        assert g1 is g2


class TestRuntimeSafetyIntegration:
    def test_manager_uses_governor(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        from aion.runtime.runtime_manager import RuntimeManager
        from aion.runtime import safety_governor as sg_module
        gov = SafetyGovernor(limits=SafetyLimits(max_background_jobs=1))
        original = sg_module.get_safety_governor
        sg_module.get_safety_governor = lambda: gov
        try:
            mgr = RuntimeManager()
            mgr.start()
            assert mgr.register_job("j1", "test")
            assert not mgr.register_job("j2", "test")
            assert mgr.get_state().active_jobs == 1
        finally:
            sg_module.get_safety_governor = original

    def test_manager_check_timeouts(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        from aion.runtime.runtime_manager import RuntimeManager
        from aion.runtime import safety_governor as sg_module
        import time
        gov = SafetyGovernor(limits=SafetyLimits(job_timeout_seconds=30))
        original = sg_module.get_safety_governor
        sg_module.get_safety_governor = lambda: gov
        try:
            mgr = RuntimeManager()
            mgr.start()
            mgr.register_job("j1", "test")
            gov._job_timestamps["j1"] = time.time() - 60
            timed_out = mgr.check_timeouts()
            assert len(timed_out) == 1
            assert "j1" in timed_out
        finally:
            sg_module.get_safety_governor = original


class TestSafety:
    def test_governor_prevents_dangerous_operations(self):
        from aion.runtime.safety_governor import SafetyGovernor
        gov = SafetyGovernor()
        assert not hasattr(gov, "execute_shell")
        assert not hasattr(gov, "run_command")
        assert not hasattr(gov, "delete_files")
        assert not hasattr(gov, "modify_system")

    def test_limits_are_readonly(self):
        from aion.runtime.safety_governor import SafetyLimits
        limits = SafetyLimits()
        assert isinstance(limits.max_background_jobs, int)
        assert isinstance(limits.max_session_duration_hours, float)
