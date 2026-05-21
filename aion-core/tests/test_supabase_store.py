import pytest
import asyncio
from unittest.mock import patch, MagicMock
from aion.memory.supabase_store import SupabaseStore

@pytest.fixture
def mock_supabase_client():
    with patch("aion.memory.supabase_store.create_client") as mock_create:
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        yield mock_client

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
        
        # Method calls should silently return and do nothing
        try:
            await store.sync_memory("1", "c", "t", None)
            await store.sync_knowledge("1", "c", [])
            await store.sync_decision("1", "c", "r")
            res = await store.search_semantic("test", [0.1], "memories")
            assert res == []
        except Exception:
            pytest.fail("Store methods raised exceptions when client is None")
