import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from unittest.mock import patch

from aion.main import app
from aion.sync.sync_queue import enqueue_sync, mark_failed, get_sync_status
from aion.memory import sqlite_store


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    for tenant in ["test_tenant", "tenant_a", "tenant_b"]:
        if await sqlite_store.is_tenant_provisioned(tenant):
            async with sqlite_store.tenant_db_connection(tenant) as conn:
                cursor = await conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'")
                if await cursor.fetchone():
                    await conn.execute("DELETE FROM sync_queue")
                    await conn.commit()
    yield
    for tenant in ["test_tenant", "tenant_a", "tenant_b"]:
        if await sqlite_store.is_tenant_provisioned(tenant):
            async with sqlite_store.tenant_db_connection(tenant) as conn:
                cursor = await conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'")
                if await cursor.fetchone():
                    await conn.execute("DELETE FROM sync_queue")
                    await conn.commit()


@pytest.mark.asyncio
async def test_api_retry_failed_requires_auth():
    with TestClient(app) as client:
        response = client.post("/v1/tenant/test_tenant/sync/retry-failed")
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_retry_failed_empty_queue():
    with TestClient(app) as client:
        with patch("aion.middleware.auth.settings") as mock_auth_settings:
            mock_auth_settings.get_token_for_tenant.return_value = "supersecret-token"
            headers = {"X-Tenant-ID": "test_tenant", "Authorization": "Bearer supersecret-token"}
            response = client.post("/v1/tenant/test_tenant/sync/retry-failed", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["retried"] == 0
            assert data["message"] == "Nenhum item failed para retry."


@pytest.mark.asyncio
async def test_api_retry_failed_with_items():
    await sqlite_store.provision_tenant("test_tenant")
    item_1 = await enqueue_sync("test_tenant", "knowledge", "k_1", {"content": "teste 1"})
    item_2 = await enqueue_sync("test_tenant", "knowledge", "k_2", {"content": "teste 2"})
    await mark_failed("test_tenant", item_1, "Erro 1")
    await mark_failed("test_tenant", item_2, "Erro 2")

    with TestClient(app) as client:
        with patch("aion.middleware.auth.settings") as mock_auth_settings:
            mock_auth_settings.get_token_for_tenant.return_value = "supersecret-token"
            headers = {"X-Tenant-ID": "test_tenant", "Authorization": "Bearer supersecret-token"}
            response = client.post("/v1/tenant/test_tenant/sync/retry-failed", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["retried"] == 2
            assert "2 itens falhos reenfileirados" in data["message"]

            status = await get_sync_status("test_tenant")
            assert status.failed == 0
            assert status.pending == 2


@pytest.mark.asyncio
async def test_api_retry_failed_tenant_isolation():
    await sqlite_store.provision_tenant("tenant_a")
    await sqlite_store.provision_tenant("tenant_b")
    item_a = await enqueue_sync("tenant_a", "knowledge", "k_a", {"c": "a"})
    item_b = await enqueue_sync("tenant_b", "knowledge", "k_b", {"c": "b"})
    await mark_failed("tenant_a", item_a, "Erro A")
    await mark_failed("tenant_b", item_b, "Erro B")

    with TestClient(app) as client:
        with patch("aion.middleware.auth.settings") as mock_auth_settings:
            mock_auth_settings.get_token_for_tenant.return_value = "supersecret-token"
            headers = {"X-Tenant-ID": "tenant_a", "Authorization": "Bearer supersecret-token"}
            response = client.post("/v1/tenant/tenant_a/sync/retry-failed", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["retried"] == 1

            status_a = await get_sync_status("tenant_a")
            assert status_a.failed == 0
            assert status_a.pending == 1

            status_b = await get_sync_status("tenant_b")
            assert status_b.failed == 1
            assert status_b.pending == 0
