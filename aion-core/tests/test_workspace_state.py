import pytest
import datetime
from typing import List, Dict, Any


class TestWorkspaceState:
    def test_default_state(self):
        from aion.workspace.workspace_state import WorkspaceState
        state = WorkspaceState()
        assert state.active_goal is None
        assert state.active_modes == []
        assert state.current_provider is None
        assert state.orchestrator_status == "idle"
        assert state.cognitive_load == 0.0
        assert state.active_jobs == 0
        assert state.recent_events == []
        assert state.last_reflection is None
        assert state.updated_at != ""

    def test_state_with_values(self):
        from aion.workspace.workspace_state import WorkspaceState
        state = WorkspaceState(
            active_goal="monetizar cortex",
            active_modes=["dev", "research"],
            current_provider="openrouter/deepseek",
            orchestrator_status="active",
            cognitive_load=0.7,
            active_jobs=2,
            recent_events=[{"type": "test"}],
            last_reflection={"summary": "ok"},
        )
        assert state.active_goal == "monetizar cortex"
        assert "dev" in state.active_modes
        assert state.cognitive_load == 0.7
        assert state.active_jobs == 2

    def test_cognitive_load_bounds(self):
        from aion.workspace.workspace_state import WorkspaceState
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            WorkspaceState(cognitive_load=1.5)
        with pytest.raises(ValidationError):
            WorkspaceState(cognitive_load=-0.1)


class TestWorkspaceStateEngine:
    def test_set_active_goal(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_active_goal("criar app")
        assert engine.get_state().active_goal == "criar app"

    def test_add_remove_active_modes(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.add_active_mode("dev")
        engine.add_active_mode("research")
        assert "dev" in engine.get_state().active_modes
        assert "research" in engine.get_state().active_modes
        engine.remove_active_mode("dev")
        assert "dev" not in engine.get_state().active_modes
        assert "research" in engine.get_state().active_modes

    def test_add_mode_deduplicates(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.add_active_mode("dev")
        engine.add_active_mode("dev")
        assert engine.get_state().active_modes == ["dev"]

    def test_set_provider(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_provider("openrouter/deepseek")
        assert engine.get_state().current_provider == "openrouter/deepseek"

    def test_set_orchestrator_status(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_orchestrator_status("active")
        assert engine.get_state().orchestrator_status == "active"

    def test_set_cognitive_load(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_cognitive_load(0.85)
        assert engine.get_state().cognitive_load == 0.85

    def test_cognitive_load_clamps(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_cognitive_load(2.0)
        assert engine.get_state().cognitive_load == 1.0
        engine.set_cognitive_load(-1.0)
        assert engine.get_state().cognitive_load == 0.0

    def test_increment_decrement_jobs(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        assert engine.get_state().active_jobs == 0
        engine.increment_jobs()
        assert engine.get_state().active_jobs == 1
        engine.decrement_jobs()
        assert engine.get_state().active_jobs == 0
        engine.decrement_jobs()
        assert engine.get_state().active_jobs == 0

    def test_push_event(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.push_event({"type": "goal_detected", "goal": "test"})
        assert len(engine.get_state().recent_events) == 1

    def test_push_event_caps_at_50(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        for i in range(60):
            engine.push_event({"type": f"event_{i}"})
        assert len(engine.get_state().recent_events) == 50

    def test_set_last_reflection(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        engine.set_last_reflection({"summary": "good"})
        assert engine.get_state().last_reflection == {"summary": "good"}

    def test_updated_at_changes(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        t1 = engine.get_state().updated_at
        engine.set_active_goal("new goal")
        t2 = engine.get_state().updated_at
        assert t2 >= t1

    def test_singleton(self):
        from aion.workspace.workspace_state import get_workspace_state, WorkspaceStateEngine
        s1 = get_workspace_state()
        s2 = get_workspace_state()
        assert s1 is s2
        assert isinstance(s1, WorkspaceStateEngine)


class TestSafety:
    def test_state_has_no_execute_methods(self):
        from aion.workspace.workspace_state import WorkspaceStateEngine
        engine = WorkspaceStateEngine()
        assert not hasattr(engine, "execute")
        assert not hasattr(engine, "shell")
        assert not hasattr(engine, "run_command")
        assert not hasattr(engine, "delete")
