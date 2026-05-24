import pytest
from unittest.mock import patch, AsyncMock


class TestCognitiveSession:
    def test_default_session(self):
        from aion.runtime.persistent_sessions import CognitiveSession
        s = CognitiveSession()
        assert s.session_type == "study"
        assert s.status == "active"
        assert s.goal == ""
        assert s.active_modes == []
        assert s.context_window == []

    def test_session_with_values(self):
        from aion.runtime.persistent_sessions import CognitiveSession
        s = CognitiveSession(
            id="sid1",
            session_type="dev",
            goal="build app",
            active_modes=["dev", "research"],
            status="active",
        )
        assert s.id == "sid1"
        assert s.session_type == "dev"
        assert s.goal == "build app"


class TestSessionStore:
    @pytest.mark.asyncio
    async def test_create(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            session = await store.create("cortex", "study", "learn python")
            assert session.id != ""
            assert session.session_type == "study"
            assert session.goal == "learn python"
            assert session.status == "active"

    @pytest.mark.asyncio
    async def test_create_invalid_type_falls_back(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            session = await store.create("cortex", "invalid_type", "test")
            assert session.session_type == "study"

    @pytest.mark.asyncio
    async def test_update(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            session = await store.create("cortex", "dev", "build")
            updated = await store.update("cortex", session.id, goal="build app", status="paused")
            assert updated is not None
            assert updated.goal == "build app"
            assert updated.status == "paused"

    @pytest.mark.asyncio
    async def test_update_nonexistent(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        updated = await store.update("cortex", "nonexistent", goal="x")
        assert updated is None

    @pytest.mark.asyncio
    async def test_close(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            session = await store.create("cortex", "research", "investigate")
            closed = await store.close("cortex", session.id, status="completed")
            assert closed.status == "completed"

    def test_get(self):
        from aion.runtime.persistent_sessions import SessionStore, CognitiveSession
        store = SessionStore()
        s = CognitiveSession(id="sid1", session_type="study", goal="test")
        store._sessions["sid1"] = s
        assert store.get("sid1").id == "sid1"
        assert store.get("nonexistent") is None

    def test_list_active(self):
        from aion.runtime.persistent_sessions import SessionStore, CognitiveSession
        store = SessionStore()
        store._sessions["s1"] = CognitiveSession(id="s1", session_type="study", status="active")
        store._sessions["s2"] = CognitiveSession(id="s2", session_type="dev", status="active")
        store._sessions["s3"] = CognitiveSession(id="s3", session_type="study", status="completed")
        active = store.list_active()
        assert len(active) == 2
        study_active = store.list_active(session_type="study")
        assert len(study_active) == 1

    def test_list_all(self):
        from aion.runtime.persistent_sessions import SessionStore, CognitiveSession
        store = SessionStore()
        for i in range(5):
            store._sessions[f"s{i}"] = CognitiveSession(id=f"s{i}", session_type="study")
        sessions = store.list_all(limit=3)
        assert len(sessions) == 3

    def test_singleton(self):
        from aion.runtime.persistent_sessions import get_session_store, SessionStore
        s1 = get_session_store()
        s2 = get_session_store()
        assert s1 is s2


class TestSafety:
    def test_session_no_execute(self):
        from aion.runtime.persistent_sessions import SessionStore
        store = SessionStore()
        assert not hasattr(store, "execute")
        assert not hasattr(store, "shell")
