import os
import json
import sqlite3
import shutil
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from aion.memory.sqlite_store import get_db_path


TEST_TOKEN = "test-token-secure-456"
TEST_VAULT = "test_obsidian_vault_diag"


def _provision_sync(app_id: str):
    path = get_db_path(app_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY, app_id TEXT NOT NULL, content TEXT NOT NULL,
            type TEXT NOT NULL, metadata TEXT, confidence REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY, app_id TEXT NOT NULL, content TEXT NOT NULL,
            tags TEXT NOT NULL, confidence REAL NOT NULL,
            expires_at TEXT, created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS decisions (
            id TEXT PRIMARY KEY, app_id TEXT NOT NULL, content TEXT NOT NULL,
            reasoning TEXT NOT NULL, created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS actions_log (
            id TEXT PRIMARY KEY, app_id TEXT NOT NULL, action_type TEXT NOT NULL,
            input TEXT NOT NULL, output TEXT NOT NULL, status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def _insert_memory_sync(conn, app_id: str, content: str, ctype: str = "observation", confidence: float = 1.0):
    import datetime
    now = datetime.datetime.utcnow().isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO memories (id, app_id, content, type, metadata, confidence, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (f"mem_{content[:8]}", app_id, content, ctype, None, confidence, now),
    )
    conn.commit()


def _insert_knowledge_sync(conn, app_id: str, content: str, tags: list, confidence: float = 0.9):
    import datetime
    now = datetime.datetime.utcnow().isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO knowledge (id, app_id, content, tags, confidence, expires_at, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (f"k_{content[:8]}", app_id, content, json.dumps(tags), confidence, None, now),
    )
    conn.commit()


def _insert_decision_sync(conn, app_id: str, content: str, reasoning: str):
    import datetime
    now = datetime.datetime.utcnow().isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO decisions (id, app_id, content, reasoning, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (f"d_{content[:8]}", app_id, content, reasoning, now),
    )
    conn.commit()


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    from aion.config import settings
    monkeypatch.setattr(settings, "AION_TENANT_TOKENS", json.dumps({"test-tenant": TEST_TOKEN}))
    if os.path.exists("data"):
        try:
            shutil.rmtree("data")
        except PermissionError:
            pass
    from aion.memory.sqlite_store import _tenant_locks
    _tenant_locks.clear()
    yield
    if os.path.exists("data"):
        try:
            shutil.rmtree("data")
        except PermissionError:
            pass


def _clear_health_cache():
    from aion import main
    main.AVAILABLE_PROVIDERS_CACHE = []
    main._VECTOR_STORE_CACHE = None


@pytest.fixture
def client():
    from aion.main import app
    _clear_health_cache()
    with patch("aion.main.embedding_service.load_model", return_value=True):
        with TestClient(app) as c:
            yield c


# ── GET /health ──────────────────────────────────────────────


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "1.0.0"

    def test_health_includes_providers(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert "providers_available" in data
        assert isinstance(data["providers_available"], list)

    def test_health_includes_vector_store(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert "vector_store" in data
        assert data["vector_store"] in ("ok", "unavailable")

    def test_health_includes_obsidian_vault(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert "obsidian_vault" in data
        assert data["obsidian_vault"] in ("ok", "unavailable")

    def test_health_is_public_no_auth(self, client):
        resp = client.get("/health", headers={})
        assert resp.status_code == 200

    def test_obsidian_vault_returns_unavailable_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv("OBSIDIAN_VAULT_PATH", raising=False)
        _clear_health_cache()
        resp = client.get("/health")
        assert resp.json()["obsidian_vault"] == "unavailable"

    def test_cors_preflight_allows_origins(self, client):
        resp = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
        assert "GET" in resp.headers.get("access-control-allow-methods", "")

    def test_cors_preflight_rejects_unknown_origin(self, client):
        resp = client.options(
            "/health",
            headers={
                "Origin": "https://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" not in resp.headers


# ── GET /v1/tenant/{app_id}/stats ─────────────────────────────


class TestTenantStatsEndpoint:
    def _auth_headers(self):
        return {
            "X-Tenant-ID": "test-tenant",
            "Authorization": f"Bearer {TEST_TOKEN}",
        }

    def test_stats_requires_auth(self, client):
        resp = client.get("/v1/tenant/test-tenant/stats")
        assert resp.status_code == 401

    def test_stats_returns_zeros_for_unprovisioned(self, client):
        resp = client.get(
            "/v1/tenant/unknown/stats",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["app_id"] == "unknown"
        assert data["memories"] == 0
        assert data["knowledge"] == 0
        assert data["decisions"] == 0
        assert data["initialized"] is False

    def test_stats_returns_counts(self, client):
        conn = _provision_sync("test-tenant")
        _insert_memory_sync(conn, "test-tenant", "Memory A")
        _insert_memory_sync(conn, "test-tenant", "Memory B")
        _insert_knowledge_sync(conn, "test-tenant", "Know A", ["tag1"])
        _insert_decision_sync(conn, "test-tenant", "Dec A", "Reason A")
        conn.close()

        resp = client.get(
            "/v1/tenant/test-tenant/stats",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["app_id"] == "test-tenant"
        assert data["memories"] == 2
        assert data["knowledge"] == 1
        assert data["decisions"] == 1
        assert "last_activity" in data

    def test_stats_wrong_token_returns_401(self, client):
        resp = client.get(
            "/v1/tenant/test-tenant/stats",
            headers={
                "X-Tenant-ID": "test-tenant",
                "Authorization": "Bearer wrong-token",
            },
        )
        assert resp.status_code == 401


# ── GET /v1/tenant/{app_id}/knowledge ─────────────────────────


class TestTenantKnowledgeEndpoint:
    def _auth_headers(self):
        return {
            "X-Tenant-ID": "test-tenant",
            "Authorization": f"Bearer {TEST_TOKEN}",
        }

    def test_knowledge_requires_auth(self, client):
        resp = client.get("/v1/tenant/test-tenant/knowledge")
        assert resp.status_code == 401

    def test_knowledge_returns_empty_for_unprovisioned(self, client):
        resp = client.get(
            "/v1/tenant/unknown/knowledge",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_knowledge_returns_all_items(self, client):
        conn = _provision_sync("test-tenant")
        _insert_knowledge_sync(conn, "test-tenant", "Regra: revisar PRs", ["regras", "pr"])
        _insert_knowledge_sync(conn, "test-tenant", "Arquitetura: FastAPI", ["arquitetura"])
        _insert_knowledge_sync(conn, "test-tenant", "Deploy: GitHub Actions", ["deploy"])
        conn.close()

        resp = client.get(
            "/v1/tenant/test-tenant/knowledge",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 3
        assert data["total"] == 3

    def test_knowledge_respects_limit(self, client):
        conn = _provision_sync("test-tenant")
        _insert_knowledge_sync(conn, "test-tenant", "Item A", ["a"])
        _insert_knowledge_sync(conn, "test-tenant", "Item B", ["b"])
        _insert_knowledge_sync(conn, "test-tenant", "Item C", ["c"])
        conn.close()

        resp = client.get(
            "/v1/tenant/test-tenant/knowledge?limit=2",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 2

    def test_knowledge_filters_by_query(self, client):
        conn = _provision_sync("test-tenant")
        _insert_knowledge_sync(conn, "test-tenant", "Regra de segurança: revisar PRs", ["regras", "pr"])
        _insert_knowledge_sync(conn, "test-tenant", "Arquitetura: FastAPI", ["arquitetura"])
        conn.close()

        resp = client.get(
            "/v1/tenant/test-tenant/knowledge?query=segurança",
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) >= 1
        assert any("segurança" in item["content"] for item in data["items"])

    def test_knowledge_returns_proper_schema(self, client):
        conn = _provision_sync("test-tenant")
        _insert_knowledge_sync(conn, "test-tenant", "Knowledge item", ["tag-x"])
        conn.close()

        resp = client.get(
            "/v1/tenant/test-tenant/knowledge",
            headers=self._auth_headers(),
        )
        data = resp.json()
        item = data["items"][0]
        assert "id" in item
        assert "content" in item
        assert "tags" in item
        assert "confidence" in item
        assert "created_at" in item
        assert isinstance(item["tags"], list)

    def test_knowledge_wrong_token(self, client):
        resp = client.get(
            "/v1/tenant/test-tenant/knowledge",
            headers={
                "X-Tenant-ID": "test-tenant",
                "Authorization": "Bearer invalid",
            },
        )
        assert resp.status_code == 401
