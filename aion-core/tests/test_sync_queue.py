import pytest
import pytest_asyncio
import asyncio
from aion.sync.sync_queue import (
    enqueue_sync,
    get_pending_sync,
    mark_synced,
    mark_failed,
    get_sync_status,
    retry_failed_sync,
)
from aion.memory import sqlite_store

@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    # Setup - garante que está limpo
    if await sqlite_store.is_tenant_provisioned("test_tenant"):
        async with sqlite_store.tenant_db_connection("test_tenant") as conn:
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()
    
    yield
    
    # Teardown
    if await sqlite_store.is_tenant_provisioned("test_tenant"):
        async with sqlite_store.tenant_db_connection("test_tenant") as conn:
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()

@pytest.mark.asyncio
async def test_enqueue_sync_success():
    item_id = await enqueue_sync(
        "test_tenant",
        "knowledge",
        "k_123",
        {"content": "Teste unitário"}
    )
    assert item_id is not None
    assert item_id.startswith("sync_")

    pending = await get_pending_sync("test_tenant")
    assert len(pending) == 1
    assert pending[0].id == item_id
    assert pending[0].record_id == "k_123"
    assert pending[0].status == "pending"

@pytest.mark.asyncio
async def test_enqueue_sync_blocks_sensitive_data():
    item_id = await enqueue_sync(
        "test_tenant",
        "knowledge",
        "k_sensitive",
        {"content": "Meu CPF é 123.456.789-00"}
    )
    assert item_id is None

    pending = await get_pending_sync("test_tenant")
    assert len(pending) == 0

@pytest.mark.asyncio
async def test_mark_synced_updates_status():
    item_id = await enqueue_sync(
        "test_tenant",
        "study_report",
        "sr_1",
        {"mode": "auto"}
    )
    
    await mark_synced("test_tenant", item_id)
    
    pending = await get_pending_sync("test_tenant")
    assert len(pending) == 0  # synced doesn't show in pending
    
    status = await get_sync_status("test_tenant")
    assert status.synced == 1
    assert status.pending == 0

@pytest.mark.asyncio
async def test_mark_failed_increments_attempts():
    item_id = await enqueue_sync(
        "test_tenant",
        "decision",
        "d_1",
        {"content": "test"}
    )
    
    await mark_failed("test_tenant", item_id, "Network error")
    
    pending = await get_pending_sync("test_tenant")
    assert len(pending) == 1
    assert pending[0].status == "failed"
    assert pending[0].attempts == 1
    assert pending[0].last_error == "Network error"
    
    status = await get_sync_status("test_tenant")
    assert status.failed == 1

@pytest.mark.asyncio
async def test_tenant_isolation():
    # Garante limpeza para tenant_a e tenant_b
    for tenant in ["tenant_a", "tenant_b"]:
        if await sqlite_store.is_tenant_provisioned(tenant):
            async with sqlite_store.tenant_db_connection(tenant) as conn:
                await conn.execute("DELETE FROM sync_queue")
                await conn.commit()

    await enqueue_sync("tenant_a", "knowledge", "1", {"c": "a"})
    await enqueue_sync("tenant_b", "knowledge", "2", {"c": "b"})
    
    pending_a = await get_pending_sync("tenant_a")
    pending_b = await get_pending_sync("tenant_b")
    
    assert len(pending_a) == 1
    assert pending_a[0].app_id == "tenant_a"
    
    assert len(pending_b) == 1
    assert pending_b[0].app_id == "tenant_b"


@pytest.mark.asyncio
async def test_retry_failed_empty_queue():
    # Garante que funciona sem problemas em fila vazia e retorna 0 retried
    res = await retry_failed_sync("test_tenant")
    assert res == {"retried": 0}


@pytest.mark.asyncio
async def test_retry_failed_with_items():
    # Insere itens e marca como falhos
    item_1 = await enqueue_sync("test_tenant", "knowledge", "k_1", {"content": "teste 1"})
    item_2 = await enqueue_sync("test_tenant", "knowledge", "k_2", {"content": "teste 2"})

    await mark_failed("test_tenant", item_1, "Erro 1")
    await mark_failed("test_tenant", item_2, "Erro 2")

    # Verifica se foram marcados como failed
    status_before = await get_sync_status("test_tenant")
    assert status_before.failed == 2

    # Executa o retry
    res = await retry_failed_sync("test_tenant")
    assert res == {"retried": 2}

    # Verifica se voltaram para pending com attempts=0 e last_error=None
    status_after = await get_sync_status("test_tenant")
    assert status_after.failed == 0
    assert status_after.pending == 2

    pending = await get_pending_sync("test_tenant")
    for item in pending:
        assert item.status == "pending"
        assert item.attempts == 0
        assert item.last_error is None


@pytest.mark.asyncio
async def test_retry_failed_tenant_isolation():
    # Garante limpeza para tenant_a e tenant_b
    for tenant in ["tenant_a", "tenant_b"]:
        if await sqlite_store.is_tenant_provisioned(tenant):
            async with sqlite_store.tenant_db_connection(tenant) as conn:
                await conn.execute("DELETE FROM sync_queue")
                await conn.commit()

    # Enfileira itens nos dois tenants
    item_a = await enqueue_sync("tenant_a", "knowledge", "k_a", {"c": "a"})
    item_b = await enqueue_sync("tenant_b", "knowledge", "k_b", {"c": "b"})

    # Marca ambos como falhos
    await mark_failed("tenant_a", item_a, "Erro A")
    await mark_failed("tenant_b", item_b, "Erro B")

    # Executa retry apenas para tenant_a
    res = await retry_failed_sync("tenant_a")
    assert res == {"retried": 1}

    # Verifica que tenant_a resetou e tenant_b continuou failed
    status_a = await get_sync_status("tenant_a")
    assert status_a.failed == 0
    assert status_a.pending == 1

    status_b = await get_sync_status("tenant_b")
    assert status_b.failed == 1
    assert status_b.pending == 0

