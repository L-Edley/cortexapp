import pytest
import pytest_asyncio
import asyncio
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from aion.main import app
from aion.control.control_center import (
    ControlOverview,
    BrainStatus,
    ProviderStatus,
    SyncOverview,
    StudyOverview,
    DevOverview,
    JobsOverview,
    get_control_overview,
    get_brain_status,
    get_provider_status,
    get_sync_overview,
    get_study_overview,
    get_dev_overview,
    get_jobs_overview,
)
from aion.memory import sqlite_store

TEST_TENANT = "control_test"


@pytest_asyncio.fixture(autouse=True)
async def setup_and_cleanup():
    await sqlite_store.provision_tenant(TEST_TENANT)
    yield
    import os
    db_path = sqlite_store.get_db_path(TEST_TENANT)
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass


# Helper: context manager to mock auth
def _auth_headers(token="supersecret-token"):
    return {"X-Tenant-ID": TEST_TENANT, "Authorization": f"Bearer {token}"}


def _mock_auth():
    return patch("aion.middleware.auth.settings")


# ── get_control_overview ──

@pytest.mark.asyncio
async def test_overview_returns_complete_structure():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/overview", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert data["app_id"] == TEST_TENANT
            assert data["status"] in ("ok", "degraded", "error")
            assert data["version"] == "1.0.0"
            assert "uptime_seconds" in data
            assert "mode_summary" in data
            assert "brain" in data
            assert "providers" in data
            assert "sync" in data
            assert "study" in data
            assert "dev" in data
            assert "jobs" in data
            assert "warnings" in data
            assert "generated_at" in data
            assert isinstance(data["brain"]["memories_count"], int)


# ── get_brain_status ──

@pytest.mark.asyncio
async def test_brain_status_with_provisioned_tenant():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/brain", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert "sqlite" in data
            assert "chroma" in data
            assert "obsidian" in data
            assert "supabase" in data
            assert isinstance(data["memories_count"], int)
            assert isinstance(data["knowledge_count"], int)
            assert isinstance(data["decisions_count"], int)


# ── get_provider_status ──

@pytest.mark.asyncio
async def test_provider_status_does_not_expose_keys():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/providers", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            for provider in ("groq", "gemini", "openai", "ollama", "mock"):
                assert provider in data, f"Missing provider '{provider}' in response"
            payload_str = str(data)
            assert "sk-" not in payload_str, "API key leaked in provider status"
            assert "gsk_" not in payload_str, "Groq API key leaked in provider status"
            assert "AIza" not in payload_str, "Gemini API key leaked in provider status"


# ── get_sync_overview ──

@pytest.mark.asyncio
async def test_sync_overview_returns_counters():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/sync", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert "pending" in data
            assert "synced" in data
            assert "failed" in data
            assert isinstance(data["pending"], int)
            assert isinstance(data["scheduler_enabled"], bool)


# ── get_study_overview ──

@pytest.mark.asyncio
async def test_study_overview_works_even_without_report():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/study", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert data["last_study_report"] is None
            assert data["last_desktop_study_report"] is None
            assert isinstance(data["active_desktop_sessions"], int)
            assert isinstance(data["knowledge_saved_total"], int)


# ── get_dev_overview ──

@pytest.mark.asyncio
async def test_dev_overview_works_even_without_lessons():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/dev", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert data["dev_lessons_count"] == 0
            assert data["last_dev_lesson"] is None


# ── get_jobs_overview ──

@pytest.mark.asyncio
async def test_jobs_overview_works_even_without_jobs():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            response = client.get(f"/v1/tenant/{TEST_TENANT}/control/jobs", headers=_auth_headers())
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data["active_jobs"], int)
            assert isinstance(data["recent_jobs"], list)
            assert isinstance(data["failed_jobs"], list)
            assert isinstance(data["study_jobs"], int)


# ── Partial failure returns degraded, not 500 ──

@pytest.mark.asyncio
async def test_partial_failure_returns_degraded_not_500():
    with patch("aion.control.control_center.vector_store.count_vectors") as mock_vec:
        mock_vec.side_effect = Exception("Chroma failed")
        with _mock_auth() as mock_auth:
            mock_auth.get_token_for_tenant.return_value = "supersecret-token"
            with TestClient(app) as client:
                response = client.get(f"/v1/tenant/{TEST_TENANT}/control/overview", headers=_auth_headers())
                assert response.status_code == 200
                data = response.json()
                assert data["status"] in ("degraded", "ok")
                assert data["brain"]["chroma"] == "unavailable"


# ── Tenant isolation ──

@pytest.mark.asyncio
async def test_tenant_isolation():
    """A tenant should not see jobs from another tenant."""
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"

        # Inject a study job for a DIFFERENT tenant
        import sys
        mod = sys.modules.get("aion.main")
        fake_job_id = "study_fake"
        if mod:
            mod.STUDY_JOBS[fake_job_id] = {
                "status": "running", "report": None, "error": None,
                "app_id": "other_tenant"
            }

        try:
            with TestClient(app) as client:
                response = client.get(f"/v1/tenant/{TEST_TENANT}/control/jobs", headers=_auth_headers())
                assert response.status_code == 200
                data = response.json()
                assert data["study_jobs"] == 0, "Should not see other tenant's jobs"
                assert data["active_jobs"] == 0
        finally:
            if mod:
                mod.STUDY_JOBS.pop(fake_job_id, None)


# ── Endpoints require Bearer token ──

@pytest.mark.asyncio
async def test_endpoints_require_bearer_token():
    with TestClient(app) as client:
        endpoints = [
            f"/v1/tenant/{TEST_TENANT}/control/overview",
            f"/v1/tenant/{TEST_TENANT}/control/brain",
            f"/v1/tenant/{TEST_TENANT}/control/providers",
            f"/v1/tenant/{TEST_TENANT}/control/sync",
            f"/v1/tenant/{TEST_TENANT}/control/study",
            f"/v1/tenant/{TEST_TENANT}/control/dev",
            f"/v1/tenant/{TEST_TENANT}/control/jobs",
        ]
        for ep in endpoints:
            response = client.get(ep)
            assert response.status_code == 401, f"Expected 401 for {ep}, got {response.status_code}"


# ── ProviderStatus model defaults ──

def test_provider_status_defaults():
    ps = ProviderStatus()
    assert ps.groq == "missing"
    assert ps.gemini == "missing"
    assert ps.openai == "missing"
    assert ps.ollama == "not_configured"
    assert ps.mock == "available"
    assert ps.warnings == []


# ── JobsOverview handles no active jobs ──

def test_jobs_overview_defaults():
    jo = JobsOverview()
    assert jo.active_jobs == 0
    assert jo.recent_jobs == []
    assert jo.failed_jobs == []
    assert jo.study_jobs == 0
    assert jo.rebuild_jobs == 0
    assert jo.desktop_study_sessions == 0


# ── ControlOverview default status is ok ──

def test_control_overview_default_status():
    co = ControlOverview(app_id="test")
    assert co.status == "ok"
    assert co.app_id == "test"
    assert co.version == "1.0.0"


# ── SyncOverview basic function ──

def test_sync_overview_defaults():
    so = SyncOverview()
    assert so.pending == 0
    assert so.syncing == 0
    assert so.synced == 0
    assert so.failed == 0
    assert so.scheduler_enabled is False


# ── DevOverview defaults ──

def test_dev_overview_defaults():
    d = DevOverview()
    assert d.dev_lessons_count == 0
    assert d.last_dev_lesson is None


# ── StudyOverview defaults ──

def test_study_overview_defaults():
    s = StudyOverview()
    assert s.active_desktop_sessions == 0
    assert s.knowledge_saved_total == 0
    assert s.last_study_report is None


# ── BrainStatus defaults ──

def test_brain_status_defaults():
    b = BrainStatus()
    assert b.sqlite == "ok"
    assert b.chroma == "unavailable"
    assert b.obsidian == "unavailable"
    assert b.supabase == "disabled"
    assert b.memories_count == 0


# ── get_brain_status works without provisioned tenant ──

@pytest.mark.asyncio
async def test_brain_status_unprovisioned_tenant():
    status = await get_brain_status("nonexistent_tenant")
    assert status.sqlite == "error"
    assert isinstance(status.memories_count, int)


# ── get_sync_overview works without provisioned tenant ──

@pytest.mark.asyncio
async def test_sync_overview_unprovisioned_tenant():
    overview = await get_sync_overview("nonexistent_tenant")
    assert overview.pending == 0
    assert overview.synced == 0


# ── get_dev_overview works without provisioned tenant ──

@pytest.mark.asyncio
async def test_dev_overview_unprovisioned_tenant():
    overview = await get_dev_overview("nonexistent_tenant")
    assert overview.dev_lessons_count == 0
    assert overview.last_dev_lesson is None


# ── get_study_overview works without provisioned tenant ──

@pytest.mark.asyncio
async def test_study_overview_unprovisioned_tenant():
    overview = await get_study_overview("nonexistent_tenant")
    assert overview.last_study_report is None
    assert overview.active_desktop_sessions == 0


# ── get_jobs_overview unprovisioned tenant ──

@pytest.mark.asyncio
async def test_jobs_overview_unprovisioned_tenant():
    overview = await get_jobs_overview("nonexistent_tenant")
    assert overview.active_jobs == 0
    assert overview.study_jobs == 0


# ── control/brain rejects wrong token ──

@pytest.mark.asyncio
async def test_brain_rejects_wrong_token():
    with TestClient(app) as client:
        headers = {"X-Tenant-ID": TEST_TENANT, "Authorization": "Bearer wrong-token"}
        response = client.get(f"/v1/tenant/{TEST_TENANT}/control/brain", headers=headers)
        assert response.status_code == 401 or response.status_code == 403


# ── control/overview returns degraded when sqlite fails ──

@pytest.mark.asyncio
async def test_overview_degraded_when_sqlite_fails():
    with patch("aion.control.control_center.sqlite_store.is_tenant_provisioned") as mock_prov:
        mock_prov.side_effect = Exception("SQLite failure")
        overview = await get_control_overview(TEST_TENANT)
        assert overview.status == "error"
        assert overview.brain.sqlite == "error"


# ── ProviderStatus detects ollama timeout ──

@pytest.mark.asyncio
async def test_provider_status_ollama_timeout():
    with patch("aion.llm.providers.ollama.is_available") as mock_ollama:
        async def _slow(*args, **kwargs):
            await asyncio.sleep(10)
            return True
        mock_ollama.side_effect = _slow
        status = await get_provider_status()
        assert status.ollama == "offline"
        assert any("timeout" in w.lower() for w in status.warnings)


# ── All 7 endpoints return 200 with valid auth ──

@pytest.mark.asyncio
async def test_all_endpoints_return_200_with_valid_auth():
    with _mock_auth() as mock_auth:
        mock_auth.get_token_for_tenant.return_value = "supersecret-token"
        with TestClient(app) as client:
            endpoints = [
                f"/v1/tenant/{TEST_TENANT}/control/overview",
                f"/v1/tenant/{TEST_TENANT}/control/brain",
                f"/v1/tenant/{TEST_TENANT}/control/providers",
                f"/v1/tenant/{TEST_TENANT}/control/sync",
                f"/v1/tenant/{TEST_TENANT}/control/study",
                f"/v1/tenant/{TEST_TENANT}/control/dev",
                f"/v1/tenant/{TEST_TENANT}/control/jobs",
            ]
            for ep in endpoints:
                response = client.get(ep, headers=_auth_headers())
                assert response.status_code == 200, f"Expected 200 for {ep}, got {response.status_code}"
                assert response.headers.get("content-type", "").startswith("application/json")
