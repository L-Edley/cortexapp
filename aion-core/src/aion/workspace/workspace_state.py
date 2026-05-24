import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.workspace.state")


class WorkspaceState(BaseModel):
    active_goal: Optional[str] = None
    active_modes: List[str] = Field(default_factory=list)
    current_provider: Optional[str] = None
    orchestrator_status: str = "idle"
    cognitive_load: float = Field(default=0.0, ge=0.0, le=1.0)
    active_jobs: int = 0
    recent_events: List[Dict[str, Any]] = Field(default_factory=list)
    last_reflection: Optional[Dict[str, Any]] = None
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class WorkspaceStateEngine:
    def __init__(self):
        self._state = WorkspaceState()

    def get_state(self) -> WorkspaceState:
        return self._state

    def set_active_goal(self, goal: Optional[str]) -> None:
        self._state.active_goal = goal
        self._touch()

    def add_active_mode(self, mode: str) -> None:
        if mode not in self._state.active_modes:
            self._state.active_modes.append(mode)
        self._touch()

    def remove_active_mode(self, mode: str) -> None:
        self._state.active_modes = [m for m in self._state.active_modes if m != mode]
        self._touch()

    def set_provider(self, provider: Optional[str]) -> None:
        self._state.current_provider = provider
        self._touch()

    def set_orchestrator_status(self, status: str) -> None:
        self._state.orchestrator_status = status
        self._touch()

    def set_cognitive_load(self, load: float) -> None:
        self._state.cognitive_load = max(0.0, min(1.0, load))
        self._touch()

    def increment_jobs(self) -> None:
        self._state.active_jobs += 1
        self._touch()

    def decrement_jobs(self) -> None:
        self._state.active_jobs = max(0, self._state.active_jobs - 1)
        self._touch()

    def push_event(self, event: Dict[str, Any]) -> None:
        events = self._state.recent_events
        events.append(event)
        if len(events) > 50:
            events.pop(0)
        self._touch()

    def set_last_reflection(self, reflection: Dict[str, Any]) -> None:
        self._state.last_reflection = reflection
        self._touch()

    def _touch(self) -> None:
        self._state.updated_at = datetime.datetime.utcnow().isoformat()


_workspace_state_instance: Optional[WorkspaceStateEngine] = None


def get_workspace_state() -> WorkspaceStateEngine:
    global _workspace_state_instance
    if _workspace_state_instance is None:
        _workspace_state_instance = WorkspaceStateEngine()
    return _workspace_state_instance
