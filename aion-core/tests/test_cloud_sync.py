import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock, AsyncMock

from aion.sync.cloud_sync import sync_once, push_item_to_supabase
from aion.sync.sync_queue import enqueue_sync, get_sync_status, get_pending_sync
from aion.memory import sqlite_store
from aion.config import settings

@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    if await sqlite_store.is_tenant_provisioned("test_tenant"):
        async with sqlite_store.tenant_db_connection("test_tenant") as conn:
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()
    yield
    if await sqlite_store.is_tenant_provisioned("test_tenant"):
        async with sqlite_store.tenant_db_connection("test_tenant") as conn:
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()

@pytest.mark.asyncio
async def test_sync_disabled_returns_skipped():
    await enqueue_sync("test_tenant", "knowledge", "k_1", {"content": "teste"})
    
    with patch("aion.config.settings.SUPABASE_ENABLED", False):
        report = await sync_once("test_tenant")
        assert report.skipped == 1
        assert report.attempted == 0

@pytest.mark.asyncio
async def test_sync_push_success_marks_synced():
    await enqueue_sync("test_tenant", "knowledge", "k_2", {"content": "teste"})
    
    with patch("aion.config.settings.SUPABASE_ENABLED", True), \
         patch("aion.config.settings.SUPABASE_URL", "http://test"), \
         patch("aion.config.settings.SUPABASE_SERVICE_KEY", "key"), \
         patch("aion.sync.cloud_sync.push_item_to_supabase", new_callable=AsyncMock) as mock_push:
        
        mock_push.return_value = True
        
        report = await sync_once("test_tenant")
        
        assert report.attempted == 1
        assert report.synced == 1
        assert report.failed == 0
        
        status = await get_sync_status("test_tenant")
        assert status.synced == 1
        assert status.pending == 0

@pytest.mark.asyncio
async def test_sync_push_failure_marks_failed():
    await enqueue_sync("test_tenant", "knowledge", "k_3", {"content": "teste"})
    
    with patch("aion.config.settings.SUPABASE_ENABLED", True), \
         patch("aion.config.settings.SUPABASE_URL", "http://test"), \
         patch("aion.config.settings.SUPABASE_SERVICE_KEY", "key"), \
         patch("aion.sync.cloud_sync.push_item_to_supabase", new_callable=AsyncMock) as mock_push:
        
        mock_push.return_value = False
        
        report = await sync_once("test_tenant")
        
        assert report.attempted == 1
        assert report.synced == 0
        assert report.failed == 1
        
        status = await get_sync_status("test_tenant")
        assert status.failed == 1
        assert status.pending == 0

@pytest.mark.asyncio
async def test_push_item_routing():
    # Testa se o routing do push cai nas funções corretas
    from aion.sync.sync_queue import SyncItem
    
    # knowledge
    item = SyncItem(
        id="123", app_id="test_tenant", record_type="knowledge", record_id="k_99",
        payload={"content": "test"}, created_at="now", updated_at="now"
    )
    with patch("aion.memory.supabase_store.SupabaseStore.sync_knowledge", new_callable=AsyncMock) as mock_fn:
        success = await push_item_to_supabase(item)
        assert success is True
        mock_fn.assert_called_once()

@pytest.mark.asyncio
async def test_push_study_report_routing():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="124", app_id="test_tenant", record_type="study_report", record_id="sr_001",
        payload={"id": "sr_001", "mode": "auto", "summary": "test"},
        created_at="now", updated_at="now"
    )
    with patch("aion.memory.supabase_store.SupabaseStore.save_study_report", new_callable=AsyncMock, return_value=True) as mock_fn:
        success = await push_item_to_supabase(item)
        assert success is True
        mock_fn.assert_called_once_with("test_tenant", item.payload)

@pytest.mark.asyncio
async def test_push_desktop_study_report_routing():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="125", app_id="test_tenant", record_type="desktop_study_report", record_id="dsr_001",
        payload={"id": "dsr_001", "session_id": "s1"},
        created_at="now", updated_at="now"
    )
    with patch("aion.memory.supabase_store.SupabaseStore.save_desktop_study_report", new_callable=AsyncMock, return_value=True) as mock_fn:
        success = await push_item_to_supabase(item)
        assert success is True
        mock_fn.assert_called_once_with("test_tenant", item.payload)

@pytest.mark.asyncio
async def test_push_teacher_knowledge_routing():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="126", app_id="test_tenant", record_type="teacher_knowledge", record_id="tl_001",
        payload={"id": "tl_001", "provider": "mock"},
        created_at="now", updated_at="now"
    )
    with patch("aion.memory.supabase_store.SupabaseStore.save_teacher_lesson", new_callable=AsyncMock, return_value=True) as mock_fn:
        success = await push_item_to_supabase(item)
        assert success is True
        mock_fn.assert_called_once_with("test_tenant", item.payload)

@pytest.mark.asyncio
async def test_push_dev_lesson_routing():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="127", app_id="test_tenant", record_type="dev_lesson", record_id="dl_001",
        payload={"id": "dl_001", "title": "test"},
        created_at="now", updated_at="now"
    )
    with patch("aion.memory.supabase_store.SupabaseStore.save_dev_lesson", new_callable=AsyncMock, return_value=True) as mock_fn:
        success = await push_item_to_supabase(item)
        assert success is True
        mock_fn.assert_called_once_with("test_tenant", item.payload)

@pytest.mark.asyncio
async def test_push_unknown_type_marks_failed():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="128", app_id="test_tenant", record_type="unknown_type", record_id="x_001",
        payload={}, created_at="now", updated_at="now"
    )
    success = await push_item_to_supabase(item)
    assert success is False

@pytest.mark.asyncio
async def test_push_supabase_disabled_does_not_break():
    from aion.sync.sync_queue import SyncItem
    item = SyncItem(
        id="129", app_id="test_tenant", record_type="study_report", record_id="sr_002",
        payload={"id": "sr_002"}, created_at="now", updated_at="now"
    )
    with patch("aion.config.settings.SUPABASE_ENABLED", False):
        success = await push_item_to_supabase(item)
        # push_item_to_supabase instancia SupabaseStore com as settings atuais;
        # mesmo com SUPABASE_ENABLED=False, ele cria o client que vai falhar.
        # O SupabaseStore internamente retorna False quando disabled.
        assert success is False
