import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from aion.workspace.timeline import TimelineEvent

logger = logging.getLogger("aion.workspace.live_feed")


class LiveFeedEntry(BaseModel):
    id: str = ""
    event_type: str = ""
    title: str = ""
    category: str = "orchestration"
    icon: str = ""
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


_ICON_MAP: Dict[str, str] = {
    "goal_detected": "🎯",
    "orchestrator_activated": "⚡",
    "execution_recorded": "▶",
    "reflection_generated": "🪞",
    "study_completed": "📚",
    "dev_completed": "💻",
    "sync_completed": "🔄",
    "memory_saved": "🧠",
    "provider_switched": "🔌",
    "strategy_updated": "📊",
    "plan_created": "📋",
    "step_completed": "✅",
    "lesson_learned": "💡",
    "cache_hit": "⚡",
    "cache_miss": "❌",
}


class LiveFeed:
    def __init__(self, max_entries: int = 100):
        self._entries: List[LiveFeedEntry] = []
        self._max_entries = max_entries

    def push(self, event: TimelineEvent) -> LiveFeedEntry:
        entry = LiveFeedEntry(
            id=event.id,
            event_type=event.event_type,
            title=event.title,
            category=event.category,
            icon=_ICON_MAP.get(event.event_type, "•"),
        )
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            self._entries.pop(0)
        return entry

    def get_entries(self, limit: int = 50) -> List[LiveFeedEntry]:
        return self._entries[-limit:]

    def clear(self) -> None:
        self._entries.clear()


_live_feed_instance: Optional[LiveFeed] = None


def get_live_feed() -> LiveFeed:
    global _live_feed_instance
    if _live_feed_instance is None:
        _live_feed_instance = LiveFeed()
    return _live_feed_instance
