import uuid
import json
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.sessions")

SESSION_TYPES = {"study", "dev", "research", "execution", "planning"}
SESSION_STATUSES = {"active", "paused", "completed", "cancelled", "timed_out"}


class CognitiveSession(BaseModel):
    id: str = ""
    session_type: str = "study"
    goal: str = ""
    active_modes: List[str] = Field(default_factory=list)
    context_window: List[Dict[str, Any]] = Field(default_factory=list)
    progress_state: Dict[str, Any] = Field(default_factory=dict)
    status: str = "active"
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class SessionStore:
    def __init__(self):
        self._sessions: Dict[str, CognitiveSession] = {}

    async def create(self, app_id: str, session_type: str, goal: str, modes: Optional[List[str]] = None) -> CognitiveSession:
        if session_type not in SESSION_TYPES:
            session_type = "study"
        session = CognitiveSession(
            id=str(uuid.uuid4()),
            session_type=session_type,
            goal=goal[:500],
            active_modes=modes or [],
        )
        self._sessions[session.id] = session
        await self._persist(app_id, session)
        return session

    async def update(self, app_id: str, session_id: str, **updates) -> Optional[CognitiveSession]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)
        session.updated_at = datetime.datetime.utcnow().isoformat()
        await self._persist(app_id, session)
        return session

    async def close(self, app_id: str, session_id: str, status: str = "completed") -> Optional[CognitiveSession]:
        if status not in SESSION_STATUSES:
            status = "completed"
        return await self.update(app_id, session_id, status=status)

    def get(self, session_id: str) -> Optional[CognitiveSession]:
        return self._sessions.get(session_id)

    def list_active(self, session_type: Optional[str] = None) -> List[CognitiveSession]:
        sessions = [s for s in self._sessions.values() if s.status == "active"]
        if session_type:
            sessions = [s for s in sessions if s.session_type == session_type]
        return sorted(sessions, key=lambda s: s.created_at, reverse=True)

    def list_all(self, session_type: Optional[str] = None, status: Optional[str] = None, limit: int = 50) -> List[CognitiveSession]:
        sessions = list(self._sessions.values())
        if session_type:
            sessions = [s for s in sessions if s.session_type == session_type]
        if status:
            sessions = [s for s in sessions if s.status == status]
        return sorted(sessions, key=lambda s: s.created_at, reverse=True)[:limit]

    async def _persist(self, app_id: str, session: CognitiveSession) -> None:
        try:
            from aion.memory.sqlite_store import save_knowledge
            content = (
                f"[Session] {session.session_type}: {session.goal[:100]}\n"
                f"Status: {session.status}\n"
                f"Modes: {', '.join(session.active_modes)}"
            )
            tags = ["runtime", "session", session.session_type, session.status]
            await save_knowledge(
                app_id=app_id,
                content=content,
                tags=tags,
                domain="runtime",
                niche="persistent_sessions",
                topic=session.session_type,
                source_mode="runtime",
            )
            try:
                from aion.obsidian.writer import write_knowledge
                await write_knowledge(app_id, content, tags)
            except Exception:
                pass
        except Exception as e:
            logger.debug("Failed to persist session: %s", e)


_session_store_instance: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    global _session_store_instance
    if _session_store_instance is None:
        _session_store_instance = SessionStore()
    return _session_store_instance
