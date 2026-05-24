import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.notifications")

NOTIFICATION_TYPES = {"insight", "warning", "recommendation", "reflection", "study", "provider", "execution", "runtime"}


class Notification(BaseModel):
    id: str = ""
    type: str = "insight"
    title: str = ""
    message: str = ""
    data: Dict[str, Any] = Field(default_factory=dict)
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class NotificationStore:
    def __init__(self, max_notifications: int = 200):
        self._notifications: List[Notification] = []
        self._max = max_notifications

    def add(self, type: str, title: str, message: str = "", data: Optional[Dict[str, Any]] = None) -> Notification:
        if type not in NOTIFICATION_TYPES:
            type = "runtime"
        n = Notification(
            id=str(uuid.uuid4())[:12],
            type=type,
            title=title[:200],
            message=message[:500],
            data=data or {},
        )
        self._notifications.append(n)
        if len(self._notifications) > self._max:
            self._notifications.pop(0)
        return n

    def list_all(self, unread_only: bool = False, type_filter: Optional[str] = None, limit: int = 50) -> List[Notification]:
        notes = self._notifications
        if unread_only:
            notes = [n for n in notes if not n.read]
        if type_filter and type_filter in NOTIFICATION_TYPES:
            notes = [n for n in notes if n.type == type_filter]
        return notes[-limit:]

    def mark_read(self, notification_id: str) -> bool:
        for n in self._notifications:
            if n.id == notification_id:
                n.read = True
                return True
        return False

    def mark_all_read(self) -> int:
        count = sum(1 for n in self._notifications if not n.read)
        for n in self._notifications:
            n.read = True
        return count

    def count_unread(self) -> int:
        return sum(1 for n in self._notifications if not n.read)

    def clear(self) -> None:
        self._notifications.clear()

    def get_types(self) -> List[str]:
        return sorted(NOTIFICATION_TYPES)


_notification_store_instance: Optional[NotificationStore] = None


def get_notification_store() -> NotificationStore:
    global _notification_store_instance
    if _notification_store_instance is None:
        _notification_store_instance = NotificationStore()
    return _notification_store_instance
