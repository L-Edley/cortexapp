import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from aion.main import app, REBUILD_JOBS
from aion.obsidian.rebuilder import RebuildReport
from aion.obsidian.reader import VaultRecord

client = TestClient(app)

@pytest.fixture
def mock_settings():
    with patch("aion.config.settings") as mock_settings:
        mock_settings.SUPABASE_ENABLED = True
        mock_settings.SUPABASE_URL = "http://mock"
        mock_settings.SUPABASE_SERVICE_KEY = "mock_key"
        yield mock_settings

@pytest.fixture
def mock_supabase_store():
    with patch("aion.memory.supabase_store.SupabaseStore") as mock_store_cls:
        mock_instance = MagicMock()
        mock_instance.pull_all = AsyncMock(return_value={
            "memories": [{"id": "s1", "app_id": "test_app", "content": "supa mem", "type": "memory"}],
            "knowledge": [],
            "decisions": []
        })
        mock_store_cls.return_value = mock_instance
        yield mock_store_cls

@pytest.fixture
def mock_read_all():
    with patch("aion.obsidian.rebuilder.read_all") as mock_read:
        mock_read.return_value = [
            VaultRecord(id="o1", tenant="test_app", type="memory", content="obs mem", file_path="mock.md")
        ]
        yield mock_read

@pytest.fixture
def mock_sqlite():
    with patch("aion.obsidian.rebuilder._SQLiteWriter") as mock_writer, \
         patch("aion.obsidian.rebuilder.tenant_db_connection") as mock_conn, \
         patch("aion.obsidian.rebuilder.provision_tenant") as mock_prov:
        
        mock_conn_instance = MagicMock()
        mock_conn_instance.commit = AsyncMock()
        mock_conn.return_value.__aenter__.return_value = mock_conn_instance
        mock_writer.insert_memory = AsyncMock(return_value=True)
        mock_writer.insert_knowledge = AsyncMock(return_value=True)
        mock_writer.insert_decision = AsyncMock(return_value=True)
        mock_prov.return_value = AsyncMock()()
        yield mock_writer

@pytest.mark.asyncio
async def test_rebuild_supabase_mode(mock_settings, mock_supabase_store, mock_read_all, mock_sqlite):
    from aion.obsidian.rebuilder import rebuild_from_vault
    report = await rebuild_from_vault("test_app", source="supabase", include_chroma=False)
    assert report.source == "supabase"
    assert report.memories_restored == 1
    mock_supabase_store.assert_called_once()
    mock_read_all.assert_not_called()

@pytest.mark.asyncio
async def test_rebuild_obsidian_mode(mock_settings, mock_supabase_store, mock_read_all, mock_sqlite):
    from aion.obsidian.rebuilder import rebuild_from_vault
    report = await rebuild_from_vault("test_app", source="obsidian", include_chroma=False)
    assert report.source == "obsidian"
    assert report.memories_restored == 1
    mock_supabase_store.assert_not_called()
    mock_read_all.assert_called_once()

@pytest.mark.asyncio
async def test_rebuild_auto_fallback(mock_settings, mock_supabase_store, mock_read_all, mock_sqlite):
    from aion.obsidian.rebuilder import rebuild_from_vault
    
    # Make Supabase fail
    mock_supabase_store.return_value.pull_all = AsyncMock(side_effect=Exception("DB error"))
    
    report = await rebuild_from_vault("test_app", source="auto", include_chroma=False)
    assert report.source == "obsidian" # Should fallback
    assert report.memories_restored == 1
    mock_supabase_store.assert_called_once()
    mock_read_all.assert_called_once()

def test_api_rebuild_endpoints(mock_settings, mock_supabase_store, mock_read_all, mock_sqlite):
    with patch("aion.middleware.auth.settings") as mock_auth_settings:
        mock_auth_settings.get_token_for_tenant.return_value = "mock_token"
        headers = {
            "X-Tenant-ID": "test_app",
            "Authorization": "Bearer mock_token"
        }
        
        # Post Request
        response = client.post("/v1/tenant/test_app/rebuild", json={"source": "auto"}, headers=headers)
        assert response.status_code == 202
        data = response.json()
        assert data["job_id"] is not None
        job_id = data["job_id"]
        
        # Get Request Status
        status_resp = client.get(f"/v1/tenant/test_app/rebuild/{job_id}", headers=headers)
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["status"] in ["running", "completed", "failed"]
