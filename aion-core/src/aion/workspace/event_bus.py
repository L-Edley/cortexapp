import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field

logger = logging.getLogger("aion.workspace.event_bus")

EVENT_CATEGORIES = {
    "goal_detected", "orchestrator_activated", "execution_recorded",
    "reflection_generated", "study_completed", "dev_completed",
    "sync_completed", "memory_saved", "provider_switched",
    "strategy_updated", "plan_created", "step_completed",
    "lesson_learned", "cache_hit", "cache_miss",
}


@dataclass
class ActivityEvent:
    type: str
    payload: Dict[str, Any]
    timestamp: str = ""
    event_id: str = ""

    def __post_init__(self):
        if not self.event_id:
            self.event_id = str(uuid.uuid4())[:12]
        if not self.timestamp:
            self.timestamp = datetime.datetime.utcnow().isoformat()


class EventBus:
    def __init__(self, max_events: int = 200):
        self._events: List[ActivityEvent] = []
        self._listeners: Dict[str, List[Callable]] = {}
        self._max_events = max_events

    def emit(self, event_type: str, payload: Dict[str, Any]) -> ActivityEvent:
        event = ActivityEvent(type=event_type, payload=payload)
        self._events.append(event)
        if len(self._events) > self._max_events:
            self._events.pop(0)

        from aion.workspace.workspace_state import get_workspace_state
        try:
            state = get_workspace_state()
            state.push_event({"type": event_type, "timestamp": event.timestamp, **payload})
        except Exception:
            pass

        listeners = self._listeners.get(event_type, [])
        for listener in listeners:
            try:
                listener(event)
            except Exception as e:
                logger.debug("Listener error for %s: %s", event_type, e)

        return event

    def subscribe(self, event_type: str, callback: Callable) -> None:
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable) -> None:
        listeners = self._listeners.get(event_type, [])
        if callback in listeners:
            listeners.remove(callback)

    def get_recent(self, limit: int = 50) -> List[ActivityEvent]:
        return self._events[-limit:]

    def get_by_type(self, event_type: str, limit: int = 20) -> List[ActivityEvent]:
        filtered = [e for e in self._events if e.type == event_type]
        return filtered[-limit:]

    def clear(self) -> None:
        self._events.clear()


_event_bus_instance: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    global _event_bus_instance
    if _event_bus_instance is None:
        _event_bus_instance = EventBus()
    return _event_bus_instance
