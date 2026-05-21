import os
import shutil
import pytest
from aion.obsidian import writer


@pytest.fixture(autouse=True)
def obsidian_env(monkeypatch):
    test_vault = "test_obsidian_vault"
    monkeypatch.setenv("OBSIDIAN_VAULT_PATH", test_vault)
    if os.path.exists(test_vault):
        shutil.rmtree(test_vault)
    yield
    if os.path.exists(test_vault):
        shutil.rmtree(test_vault)


@pytest.mark.asyncio
async def test_write_memory_creates_file_and_frontmatter():
    path = await writer.write_memory(
        "test-app",
        "Lembrar de verificar o deploy.",
        {"source": "voice", "priority": "high"},
    )
    assert path is not None
    assert os.path.exists(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "---" in content
    assert "id: mem_" in content
    assert "type: memory" in content
    assert "tenant: test-app" in content
    assert "created_at:" in content
    assert "# Lembrar de verificar o deploy." in content
    assert '"source": "voice"' in content or "source: voice" in content


@pytest.mark.asyncio
async def test_write_knowledge_creates_file_with_tags():
    path = await writer.write_knowledge(
        "test-app",
        "Regra: revisar PRs antes do merge.",
        ["regras", "pr"],
        confidence=0.95,
    )
    assert path is not None
    assert os.path.exists(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "id: know_" in content
    assert "type: knowledge" in content
    assert "confidence: 0.95" in content
    assert "tags: [regras, pr]" in content or "tags: [regras, pr]" in content


@pytest.mark.asyncio
async def test_write_decision_includes_reasoning_section():
    path = await writer.write_decision(
        "test-app",
        "Migrar para FastAPI 0.110",
        "Performance e segurança aprimoradas na nova versão.",
    )
    assert path is not None
    assert os.path.exists(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "id: dec_" in content
    assert "type: decision" in content
    assert "## Reasoning" in content
    assert "Performance e segurança aprimoradas" in content


@pytest.mark.asyncio
async def test_write_action_log_appends_to_daily_file():
    path1 = await writer.write_action_log(
        "test-app",
        {"type": "web_search", "query": "cotação dólar"},
        {"status": "success", "pages": 5},
    )
    assert path1 is not None
    assert os.path.exists(path1)
    path2 = await writer.write_action_log(
        "test-app",
        {"type": "api_call", "endpoint": "/health"},
        {"status": "ok"},
    )
    assert path2 == path1
    assert os.path.exists(path1)
    with open(path1, "r", encoding="utf-8") as f:
        content = f.read()
    assert content.count("---") >= 4
    assert "act_" in content
    assert "web_search" in content
    assert "api_call" in content


@pytest.mark.asyncio
async def test_folder_structure_is_correct():
    mem_path = await writer.write_memory("app-x", "Conteúdo memoria", None)
    know_path = await writer.write_knowledge("app-x", "Conhecimento", ["tag1"])
    dec_path = await writer.write_decision("app-x", "Decisão", "Raciocínio")
    act_path = await writer.write_action_log("app-x", {"a": 1}, {"b": 2})
    assert "memory" in mem_path
    assert "knowledge" in know_path
    assert "decisions" in dec_path
    assert "actions" in act_path


@pytest.mark.asyncio
async def test_silent_failure_when_vault_not_configured(monkeypatch):
    monkeypatch.delenv("OBSIDIAN_VAULT_PATH", raising=False)
    result = await writer.write_memory("no-vault", "teste", None)
    assert result is None
    result = await writer.write_knowledge("no-vault", "teste", [])
    assert result is None
    result = await writer.write_decision("no-vault", "teste", "razao")
    assert result is None
    result = await writer.write_action_log("no-vault", {}, {})
    assert result is None


@pytest.mark.asyncio
async def test_tenant_isolation_in_writer():
    path_a = await writer.write_memory("tenant-a", "Segredo A", None)
    path_b = await writer.write_memory("tenant-b", "Segredo B", None)
    assert "tenant-a" in path_a
    assert "tenant-b" in path_b
    assert os.path.dirname(os.path.dirname(path_a)) != os.path.dirname(os.path.dirname(path_b))
    with open(path_a, "r", encoding="utf-8") as f:
        assert "Segredo A" in f.read()
    with open(path_b, "r", encoding="utf-8") as f:
        assert "Segredo B" in f.read()
