import pytest
import pytest_asyncio
import os
import json
from unittest.mock import patch
from fastapi.testclient import TestClient

from aion.main import app
from aion.study.teacher_adapters import (
    TeacherAnswer,
    ask_teacher,
    ask_ollama,
    ask_external_provider,
    import_opencode_lesson,
    validate_teacher_answer,
    save_teacher_answer
)
from aion.memory import sqlite_store


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    for tenant in ["test_tenant", "tenant_a", "tenant_b"]:
        if await sqlite_store.is_tenant_provisioned(tenant):
            async with sqlite_store.tenant_db_connection(tenant) as conn:
                for table in ["knowledge", "sync_queue"]:
                    cursor = await conn.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
                    if await cursor.fetchone():
                        await conn.execute(f"DELETE FROM {table}")
                        await conn.commit()
    yield

@pytest.mark.asyncio
async def test_ollama_offline_does_not_break():
    with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
        ans = await ask_ollama("Como usar pgvector?")
        assert ans.provider == "ollama"
        assert ans.should_save is False
        assert ans.confidence == 0.0
        assert any("offline" in w or "Connection" in w for w in ans.warnings)

@pytest.mark.asyncio
async def test_provider_mock_returns_valid_answer():
    ans = await ask_external_provider("mock", "O que e RAG?")
    assert ans.provider == "mock"
    assert ans.should_save is True
    assert ans.confidence == 0.50
    assert "Mock Response" in ans.answer

@pytest.mark.asyncio
async def test_ask_teacher_auto_routing():
    with patch("aion.llm.providers.ollama.is_available", return_value=False):
        ans = await ask_teacher("auto", "O que e RAG?")
        assert ans.provider in ["mock", "groq", "gemini", "openai"]

@pytest.mark.asyncio
async def test_block_sensitive_data():
    ans = TeacherAnswer(
        id="test_sens",
        provider="mock",
        question="Senha de produção?",
        answer="A senha ultra secreta é apikey=sk-1234567890abcdef e CPF: 123.456.789-00",
        summary="Senha e CPF.",
        confidence=0.9,
        created_at="2026-05-21T12:00:00"
    )
    res = await save_teacher_answer("test_tenant", ans)
    assert res is None

@pytest.mark.asyncio
async def test_import_opencode_lesson_valid_md():
    file_path = "./docs_test_lesson.md"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("# Como Corrigir Bundle\n\nEste é o conteúdo da lição explicando os bugs do bundle.")
    try:
        ans = await import_opencode_lesson("test_tenant", file_path)
        assert ans.provider == "opencode_file"
        assert "Como Corrigir Bundle" in ans.question
        assert "Este é o conteúdo da lição" in ans.answer
        assert ans.should_save is True
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@pytest.mark.asyncio
async def test_path_traversal_and_env_blocked():
    with pytest.raises(PermissionError):
        await import_opencode_lesson("test_tenant", "../../.env")
    with pytest.raises(PermissionError):
        await import_opencode_lesson("test_tenant", ".env")

@pytest.mark.asyncio
async def test_save_teacher_answer_success():
    ans = TeacherAnswer(
        id="test_success",
        provider="mock",
        question="Como funciona o RAG?",
        answer="O RAG recupera pedaços de textos e passa ao LLM.",
        summary="Explicação do RAG.",
        confidence=0.85,
        created_at="2026-05-21T12:00:00"
    )
    with patch("aion.llm.factory.complete", return_value='{"valid": true, "summary": "RAG resumido", "confidence": 0.90}'):
        k_id = await save_teacher_answer("test_tenant", ans)
        assert k_id is not None
        async with sqlite_store.tenant_db_connection("test_tenant") as conn:
            cursor = await conn.execute("SELECT * FROM knowledge WHERE id = ?", (k_id,))
            row = await cursor.fetchone()
            assert row is not None
            assert "mock" in row["content"]
            assert "Como funciona o RAG?" in row["content"]
            cursor = await conn.execute("SELECT * FROM sync_queue WHERE record_id = ?", (k_id,))
            sync_row = await cursor.fetchone()
            assert sync_row is not None
            assert sync_row["record_type"] == "teacher_knowledge"

@pytest.mark.asyncio
async def test_tenant_isolation_in_endpoints():
    with patch("aion.middleware.auth.settings") as mock_auth_settings:
        mock_auth_settings.get_token_for_tenant.return_value = "supersecret-token"
        headers = {
            "X-Tenant-ID": "tenant_a",
            "Authorization": "Bearer supersecret-token"
        }
        client = TestClient(app)
        response = client.post("/v1/tenant/tenant_b/teach/ask", headers=headers, json={
            "teacher": "mock",
            "topic": "Supabase pgvector",
            "save": False
        })
        assert response.status_code == 403
        assert "Isolation" in response.json()["detail"]
