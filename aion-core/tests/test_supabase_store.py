import pytest
import asyncio
from unittest.mock import patch, MagicMock
from aion.memory.supabase_store import SupabaseStore

SAMPLE_REPORT = {
    "id": "sr_001",
    "mode": "auto",
    "topics_studied": ["RAG", "pgvector"],
    "topics": ["RAG", "pgvector"],
    "summary": "Estudo sobre RAG",
    "conclusions": ["RAG melhora respostas"],
    "warnings": [],
    "knowledge_saved": 2,
    "confidence": 0.9,
    "duration_seconds": 120.5,
    "created_at": "2026-05-21T12:00:00",
}

SAMPLE_DESKTOP_REPORT = {
    "id": "dsr_001",
    "session_id": "session_abc",
    "topics": ["pgvector"],
    "sources_read": 5,
    "teacher_calls": 3,
    "knowledge_saved": 2,
    "conclusions": ["pgvector é rapido"],
    "confidence": 0.85,
    "pending_sync_count": 0,
    "warnings": [],
    "duration_seconds": 300.0,
    "created_at": "2026-05-21T12:00:00",
}

SAMPLE_TEACHER_LESSON = {
    "id": "tl_001",
    "provider": "mock",
    "question": "O que é RAG?",
    "summary": "RAG explicado",
    "answer": "RAG significa Retrieval Augmented Generation.",
    "sources": [{"title": "Wikipedia"}],
    "confidence": 0.95,
    "tags": ["rag", "ia"],
    "should_save": True,
    "created_at": "2026-05-21T12:00:00",
}

SAMPLE_DEV_LESSON = {
    "id": "dl_001",
    "title": "Como usar async/await",
    "summary": "Guia de async no Python",
    "content": "Use async def para corrotinas.",
    "tags": ["python", "async"],
    "confidence": 0.9,
    "source": "dev_mode",
    "created_at": "2026-05-21T12:00:00",
}

SAMPLE_SYNC_LOG = {
    "id": "sl_001",
    "record_type": "knowledge",
    "record_id": "k_001",
    "status": "synced",
    "attempts": 1,
    "last_error": "",
    "created_at": "2026-05-21T12:00:00",
    "synced_at": "2026-05-21T12:01:00",
}

@pytest.fixture
def mock_supabase_client():
    with patch("aion.memory.supabase_store.create_client") as mock_create:
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        yield mock_client

# ── existing ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sync_memory(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    await store.sync_memory("mem1", "content", "memory", {"meta": "data"}, 0.9)
    
    mock_supabase_client.table.assert_called_with("aion_memories")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()
    
    # Assert silent failure
    table_mock.upsert.side_effect = Exception("Supabase connection error")
    try:
        await store.sync_memory("mem1", "content", "memory", {"meta": "data"}, 0.9)
    except Exception:
        pytest.fail("sync_memory raised an exception instead of failing silently")

@pytest.mark.asyncio
async def test_sync_knowledge(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    await store.sync_knowledge("know1", "content", ["tag1"], 1.0, None)
    
    mock_supabase_client.table.assert_called_with("aion_knowledge")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()

@pytest.mark.asyncio
async def test_sync_decision(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    await store.sync_decision("dec1", "content", "reasoning")
    
    mock_supabase_client.table.assert_called_with("aion_decisions")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()

@pytest.mark.asyncio
async def test_search_semantic(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    
    rpc_mock = mock_supabase_client.rpc.return_value
    rpc_mock.execute.return_value = MagicMock(data=[{"id": "mem1"}])
    
    result = await store.search_semantic("test_app", [0.1, 0.2], "memories", top_k=5)
    
    mock_supabase_client.rpc.assert_called_with("match_aion_memories", {
        "query_embedding": [0.1, 0.2],
        "match_count": 5,
        "filter_app_id": "test_app"
    })
    assert result == [{"id": "mem1"}]

@pytest.mark.asyncio
async def test_silent_failure_on_init():
    with patch("aion.memory.supabase_store.create_client", side_effect=Exception("Invalid credentials")):
        store = SupabaseStore("test_app", "invalid_url", "invalid_key")
        assert store.client is None
        
        try:
            await store.sync_memory("1", "c", "t", None)
            await store.sync_knowledge("1", "c", [])
            await store.sync_decision("1", "c", "r")
            res = await store.search_semantic("test", [0.1], "memories")
            assert res == []
        except Exception:
            pytest.fail("Store methods raised exceptions when client is None")

# ── new: save_study_report ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_study_report_disabled_returns_false():
    with patch("aion.memory.supabase_store.create_client", side_effect=Exception("Invalid")):
        store = SupabaseStore("test_app", "x", "y")
        result = await store.save_study_report("test_app", SAMPLE_REPORT)
        assert result is False

@pytest.mark.asyncio
async def test_save_study_report_upserts_correctly(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    result = await store.save_study_report("test_app", SAMPLE_REPORT)
    assert result is True

    mock_supabase_client.table.assert_called_with("study_reports")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()
    data = table_mock.upsert.call_args[0][0]
    assert data["id"] == "sr_001"
    assert data["mode"] == "auto"
    assert data["knowledge_saved"] == 2

@pytest.mark.asyncio
async def test_save_study_report_silent_failure(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.side_effect = Exception("DB error")
    result = await store.save_study_report("test_app", SAMPLE_REPORT)
    assert result is False

# ── new: save_desktop_study_report ───────────────────────────────────

@pytest.mark.asyncio
async def test_save_desktop_study_report_disabled_returns_false():
    with patch("aion.memory.supabase_store.create_client", side_effect=Exception("Invalid")):
        store = SupabaseStore("test_app", "x", "y")
        result = await store.save_desktop_study_report("test_app", SAMPLE_DESKTOP_REPORT)
        assert result is False

@pytest.mark.asyncio
async def test_save_desktop_study_report_upserts_correctly(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    result = await store.save_desktop_study_report("test_app", SAMPLE_DESKTOP_REPORT)
    assert result is True

    mock_supabase_client.table.assert_called_with("desktop_study_reports")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()
    data = table_mock.upsert.call_args[0][0]
    assert data["session_id"] == "session_abc"
    assert data["sources_read"] == 5

# ── new: save_teacher_lesson ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_teacher_lesson_sanitizes_sensitive(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    lesson_with_key = dict(SAMPLE_TEACHER_LESSON)
    lesson_with_key["answer"] = "Use api key sk-proj-ABCDEF123456 para conectar."
    result = await store.save_teacher_lesson("test_app", lesson_with_key)
    assert result is True

    table_mock = mock_supabase_client.table.return_value
    data = table_mock.upsert.call_args[0][0]
    assert "sk-..." in data["answer"]
    assert "sk-proj-ABCDEF123456" not in data["answer"]

# ── new: save_dev_lesson ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_dev_lesson_disabled_returns_false():
    with patch("aion.memory.supabase_store.create_client", side_effect=Exception("Invalid")):
        store = SupabaseStore("test_app", "x", "y")
        result = await store.save_dev_lesson("test_app", SAMPLE_DEV_LESSON)
        assert result is False

@pytest.mark.asyncio
async def test_save_dev_lesson_upserts_correctly(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    result = await store.save_dev_lesson("test_app", SAMPLE_DEV_LESSON)
    assert result is True

    mock_supabase_client.table.assert_called_with("dev_lessons")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()
    data = table_mock.upsert.call_args[0][0]
    assert data["title"] == "Como usar async/await"
    assert data["source"] == "dev_mode"

@pytest.mark.asyncio
async def test_save_dev_lesson_blocks_secrets(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    lesson_with_secret = dict(SAMPLE_DEV_LESSON)
    lesson_with_secret["content"] = "password = 'supersecret123'"
    result = await store.save_dev_lesson("test_app", lesson_with_secret)
    assert result is False

@pytest.mark.asyncio
async def test_save_dev_lesson_silent_failure(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.side_effect = Exception("DB error")
    result = await store.save_dev_lesson("test_app", SAMPLE_DEV_LESSON)
    assert result is False

# ── new: save_sync_log ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_sync_log_disabled_returns_false():
    with patch("aion.memory.supabase_store.create_client", side_effect=Exception("Invalid")):
        store = SupabaseStore("test_app", "x", "y")
        result = await store.save_sync_log("test_app", SAMPLE_SYNC_LOG)
        assert result is False

@pytest.mark.asyncio
async def test_save_sync_log_upserts_correctly(mock_supabase_client):
    store = SupabaseStore("test_app", "https://mock.supabase.co", "mock_key")
    result = await store.save_sync_log("test_app", SAMPLE_SYNC_LOG)
    assert result is True

    mock_supabase_client.table.assert_called_with("sync_log")
    table_mock = mock_supabase_client.table.return_value
    table_mock.upsert.assert_called_once()
    data = table_mock.upsert.call_args[0][0]
    assert data["record_type"] == "knowledge"
    assert data["status"] == "synced"
