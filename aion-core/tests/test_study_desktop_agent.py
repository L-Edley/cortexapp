import asyncio
import os
import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock

from aion.memory import sqlite_store
from aion.study.study_desktop_agent import (
    start_desktop_study,
    stop_desktop_study,
    get_desktop_study_status,
    get_last_desktop_study_report,
    recover_stale_sessions,
    ACTIVE_DESKTOP_STUDY_TASKS,
    DesktopStudySession,
    DesktopStudyStatus,
    DesktopStudyReport
)

# ---------------------------------------------------------------------------
# Fixtures e Configurações
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    # Provisiona tenant de teste "cortex" e "tenant_b"
    await sqlite_store.provision_tenant("cortex")
    await sqlite_store.provision_tenant("tenant_b")
    
    # Limpa as tabelas antes de cada teste
    for tenant in ["cortex", "tenant_b"]:
        async with sqlite_store.tenant_db_connection(tenant) as conn:
            await conn.execute("DELETE FROM desktop_study_sessions")
            await conn.execute("DELETE FROM desktop_study_reports")
            await conn.execute("DELETE FROM memories")
            await conn.execute("DELETE FROM knowledge")
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()
            
    yield
    
    # Limpa as tabelas depois de cada teste e as tasks ativas
    for tenant in ["cortex", "tenant_b"]:
        async with sqlite_store.tenant_db_connection(tenant) as conn:
            await conn.execute("DELETE FROM desktop_study_sessions")
            await conn.execute("DELETE FROM desktop_study_reports")
            await conn.execute("DELETE FROM memories")
            await conn.execute("DELETE FROM knowledge")
            await conn.execute("DELETE FROM sync_queue")
            await conn.commit()
    ACTIVE_DESKTOP_STUDY_TASKS.clear()


# ---------------------------------------------------------------------------
# Testes do Ciclo de Vida da Sessão
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_desktop_study_validation():
    # Valida limites de duração (1 a 480)
    with pytest.raises(ValueError, match="duration_minutes"):
        await start_desktop_study("cortex", duration_minutes=0)
    with pytest.raises(ValueError, match="duration_minutes"):
        await start_desktop_study("cortex", duration_minutes=500)
        
    # Valida limites de fontes (1 a 100)
    with pytest.raises(ValueError, match="max_sources"):
        await start_desktop_study("cortex", max_sources=0)
    with pytest.raises(ValueError, match="max_sources"):
        await start_desktop_study("cortex", max_sources=101)


@pytest.mark.asyncio
async def test_start_desktop_study_creation(monkeypatch):
    # Mock do orquestrador em background para não rodar a lógica real no start
    mock_run = AsyncMock()
    monkeypatch.setattr("aion.study.study_desktop_agent.run_desktop_study_session", mock_run)
    
    session = await start_desktop_study(
        app_id="cortex",
        topics=["AION local-first", "Supabase Warm Storage"],
        duration_minutes=30,
        max_sources=10
    )
    
    assert isinstance(session, DesktopStudySession)
    assert session.app_id == "cortex"
    assert session.status == "pending"
    assert len(session.topics) == 2
    assert session.id in ACTIVE_DESKTOP_STUDY_TASKS
    
    # Verifica gravação no SQLite
    status = await get_desktop_study_status("cortex", session.id)
    assert isinstance(status, DesktopStudyStatus)
    assert status.status == "pending"
    assert status.progress == 0.0


@pytest.mark.asyncio
async def test_stop_desktop_study():
    session_id = "desktop_study_teststop"
    
    # Cria uma future real para simular a task
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    ACTIVE_DESKTOP_STUDY_TASKS[session_id] = future
    
    # Insere sessão rodando no SQLite
    async with sqlite_store.tenant_db_connection("cortex") as conn:
        await conn.execute(
            """
            INSERT INTO desktop_study_sessions 
            (id, app_id, topics, status, duration_minutes, max_sources, progress, created_at, updated_at)
            VALUES (?, 'cortex', '["topico"]', 'running', 60, 20, 0.5, '2026-05-21', '2026-05-21')
            """,
            (session_id,)
        )
        await conn.commit()
        
    status = await stop_desktop_study("cortex", session_id)
    
    # Verifica cancelamento cooperativo e atualização do status no banco
    assert future.cancelled()
    assert status.status == "cancelled"


@pytest.mark.asyncio
async def test_recover_stale_sessions():
    # Insere sessões rodando que serão stale
    async with sqlite_store.tenant_db_connection("cortex") as conn:
        await conn.execute(
            """
            INSERT INTO desktop_study_sessions 
            (id, app_id, topics, status, duration_minutes, max_sources, created_at, updated_at)
            VALUES ('stale_1', 'cortex', '[]', 'running', 60, 20, '2026-05-21', '2026-05-21'),
                   ('stale_2', 'cortex', '[]', 'pending', 60, 20, '2026-05-21', '2026-05-21')
            """
        )
        await conn.commit()
        
    await recover_stale_sessions("cortex")
    
    # Verifica que foram marcadas como failed
    status_1 = await get_desktop_study_status("cortex", "stale_1")
    status_2 = await get_desktop_study_status("cortex", "stale_2")
    
    assert status_1.status == "failed"
    assert "Sessão interrompida" in status_1.warnings[0]
    assert status_2.status == "failed"


# ---------------------------------------------------------------------------
# Teste de Isolamento de Tenants (Tenant Isolation)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenant_isolation():
    session_id = "desktop_study_isolation"
    
    # Insere sessão para tenant_b
    async with sqlite_store.tenant_db_connection("tenant_b") as conn:
        await conn.execute(
            """
            INSERT INTO desktop_study_sessions 
            (id, app_id, topics, status, duration_minutes, max_sources, created_at, updated_at)
            VALUES (?, 'tenant_b', '[]', 'completed', 60, 20, '2026-05-21', '2026-05-21')
            """,
            (session_id,)
        )
        await conn.commit()
        
    # Tenta ler a partir do tenant "cortex"
    with pytest.raises(ValueError, match="não encontrada"):
        await get_desktop_study_status("cortex", session_id)


# ---------------------------------------------------------------------------
# Teste de Execução Completa (Mock de Provedores e Sync)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_desktop_study_session_success(monkeypatch):
    # Mock do LLM Provider
    async def mock_llm_provider(messages):
        # Retorna resposta para resumo da fonte e para a síntese final do estudo
        if "Você é um assistente de pesquisa científica" in messages[1]["content"]:
            return '{"summary": "Resumo da fonte externa", "key_points": ["ponto A", "ponto B"], "confidence": 0.90}'
        else:
            return '{"summary": "Conclusão consolidada de estudo", "conclusions": ["Conclusão X", "Conclusão Y"], "confidence": 0.85, "tags": ["tag1", "tag2"]}'
            
    async def mock_get_llm_provider():
        return mock_llm_provider
        
    monkeypatch.setattr("aion.llm.factory.get_llm_provider", mock_get_llm_provider)
    
    # Mock da pesquisa web e leitura de página
    from aion.research.browser_research import PublicSearchResult, PublicPageContent
    
    async def mock_search_public_web(query, max_results=5):
        return [PublicSearchResult(title="Página Web", url="https://example.com/artigo", snippet="Snippet da página", source="public_web")]
        
    async def mock_open_public_page(url):
        return PublicPageContent(url=url, title="Página Web", text="Texto longo da página sobre o tópico.", success=True)
        
    monkeypatch.setattr("aion.study.study_desktop_agent.search_public_web", mock_search_public_web)
    monkeypatch.setattr("aion.study.study_desktop_agent.open_public_page", mock_open_public_page)
    
    # Mock do Obsidian Writer
    mock_obsidian = AsyncMock(return_value="/mock/obsidian/path.md")
    monkeypatch.setattr("aion.study.study_desktop_agent.write_desktop_study_report", mock_obsidian)
    
    # Mock do Sync Queue
    mock_enqueue = AsyncMock()
    monkeypatch.setattr("aion.sync.sync_queue.enqueue_sync", mock_enqueue)
    
    # Inicia e roda sessão de estudo completo
    session = await start_desktop_study(
        app_id="cortex",
        topics=["Estudo Inteligência Artificial"],
        duration_minutes=30,
        max_sources=5
    )
    
    # Espera que a task em background conclua
    task = ACTIVE_DESKTOP_STUDY_TASKS.get(session.id)
    assert task is not None
    await task
    
    # Inspeciona status final no SQLite
    status = await get_desktop_study_status("cortex", session.id)
    assert status.status == "completed"
    assert status.progress == 1.0
    assert status.knowledge_saved == 1
    assert status.sources_read == 1
    
    # Inspeciona relatório final gerado no SQLite
    report = await get_last_desktop_study_report("cortex")
    assert report is not None
    assert report.session_id == session.id
    assert report.knowledge_saved == 1
    assert report.sources_read == 1
    assert "Conclusão X" in report.conclusions
    assert report.confidence == 0.85
    
    # Verifica se o relatório e o conhecimento foram enfileirados no sync_queue
    # enqueue_sync deve ter sido chamado pelo menos duas vezes (uma para o knowledge e uma para o report)
    assert mock_enqueue.call_count >= 2
    
    # Verifica que o Obsidian Writer foi chamado
    assert mock_obsidian.called
