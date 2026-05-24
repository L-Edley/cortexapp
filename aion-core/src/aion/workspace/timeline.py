import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.workspace.timeline")

TIMELINE_CATEGORIES = {
    "execution", "study", "reflection", "dev", "sync",
    "memory", "planning", "provider", "orchestration",
}


class TimelineEvent(BaseModel):
    id: str = ""
    event_type: str = ""
    title: str = ""
    description: str = ""
    category: str = "orchestration"
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


_CATEGORY_MAP: Dict[str, str] = {
    "goal_detected": "orchestration",
    "orchestrator_activated": "orchestration",
    "execution_recorded": "execution",
    "reflection_generated": "reflection",
    "study_completed": "study",
    "dev_completed": "dev",
    "sync_completed": "sync",
    "memory_saved": "memory",
    "provider_switched": "provider",
    "strategy_updated": "planning",
    "plan_created": "planning",
    "step_completed": "execution",
    "lesson_learned": "reflection",
    "cache_hit": "execution",
    "cache_miss": "execution",
}

_TITLE_TEMPLATES: Dict[str, str] = {
    "goal_detected": "Goal detected: {goal}",
    "orchestrator_activated": "Orchestrator activated",
    "execution_recorded": "Execução registrada: {goal_type}",
    "reflection_generated": "Reflection generated",
    "study_completed": "Study session completed",
    "dev_completed": "Dev session completed",
    "sync_completed": "Sync completed",
    "memory_saved": "Memory saved: {type}",
    "provider_switched": "Provider switched to {provider}",
    "strategy_updated": "Strategy updated: {goal_type}",
    "plan_created": "Plan created for {goal}",
    "step_completed": "Step {step_number} completed",
    "lesson_learned": "Lesson learned: {goal_type}",
    "cache_hit": "Cache hit for {input}",
    "cache_miss": "Cache miss for {input}",
}


class TimelineEngine:
    def __init__(self):
        self._events: List[TimelineEvent] = []

    def add_event(self, event_type: str, payload: Dict[str, Any]) -> TimelineEvent:
        category = _CATEGORY_MAP.get(event_type, "orchestration")
        title_template = _TITLE_TEMPLATES.get(event_type, event_type)
        try:
            title = title_template.format(**payload)
        except Exception:
            title = event_type

        description = payload.get("description", payload.get("summary", ""))
        if isinstance(description, str):
            description = description[:200]

        event = TimelineEvent(
            id=str(uuid.uuid4())[:12],
            event_type=event_type,
            title=title,
            description=description,
            category=category,
            metadata=payload,
        )
        self._events.append(event)

        try:
            from aion.workspace.live_feed import get_live_feed
            get_live_feed().push(event)
        except Exception:
            pass

        return event

    def get_events(self, limit: int = 50, category: Optional[str] = None) -> List[TimelineEvent]:
        events = self._events
        if category and category in TIMELINE_CATEGORIES:
            events = [e for e in events if e.category == category]
        return events[-limit:]

    def get_by_id(self, event_id: str) -> Optional[TimelineEvent]:
        for e in self._events:
            if e.id == event_id:
                return e
        return None

    def get_categories(self) -> List[str]:
        return sorted(TIMELINE_CATEGORIES)

    def clear(self) -> None:
        self._events.clear()

    def get_recent_summary(self, limit: int = 10) -> List[Dict[str, Any]]:
        events = self.get_events(limit=limit)
        return [
            {
                "id": e.id,
                "time": e.created_at[11:19] if len(e.created_at) > 19 else e.created_at,
                "title": e.title,
                "category": e.category,
            }
            for e in events
        ]


_timeline_instance: Optional[TimelineEngine] = None


def get_timeline() -> TimelineEngine:
    global _timeline_instance
    if _timeline_instance is None:
        _timeline_instance = TimelineEngine()
    return _timeline_instance
