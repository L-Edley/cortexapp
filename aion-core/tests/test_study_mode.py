"""
Tests for AION Study Mode (P10.3).

Cobre:
1. Estudo manual com tópico específico
2. Estudo automático detectando tópicos
3. Não chama provider quando knowledge local resolve
4. Salva knowledge corretamente
5. Não salva dado sensível
6. Provider falha → relatório parcial
7. Endpoint POST retorna job_id
8. Endpoint GET retorna relatório
9. Tenant isolation
10. Chat não é bloqueado pelo Study Mode
"""

import json
import asyncio
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from aion.study.study_mode import (
    StudyTopic,
    StudyResult,
    StudyReport,
    run_study_mode,
    detect_study_topics,
    study_topic,
    save_study_result,
    get_last_study_report,
    _contains_sensitive,
    _sanitize_study_content,
)


# ---------------------------------------------------------------------------
# Tipos
# ---------------------------------------------------------------------------


class TestStudyTypes:
    def test_study_topic_defaults(self):
        t = StudyTopic(topic="FastAPI")
        assert t.topic == "FastAPI"
        assert t.source == "manual"
        assert t.priority == 0
        assert t.created_at

    def test_study_result_defaults(self):
        r = StudyResult(topic="RAG")
        assert r.topic == "RAG"
        assert r.summary == ""
        assert r.conclusions == []
        assert r.confidence == 0.0
        assert r.should_save is True

    def test_study_report_defaults(self):
        r = StudyReport(app_id="test")
        assert r.app_id == "test"
        assert r.mode == "manual"
        assert r.topics_studied == []
        assert r.knowledge_saved == 0
        assert r.id  # UUID gerado


# ---------------------------------------------------------------------------
# Filtro de dados sensíveis
# ---------------------------------------------------------------------------


class TestSensitiveFilter:
    def test_detects_cpf(self):
        assert _contains_sensitive("CPF é 123.456.789-09") is True

    def test_detects_api_key(self):
        assert _contains_sensitive("apikey=sk-abc123xyz") is True

    def test_detects_token_prefix(self):
        assert _contains_sensitive("token: ghp_1234567890abcdef") is True

    def test_passes_clean_content(self):
        assert _contains_sensitive("FastAPI é um framework web") is False

    def test_sanitizes_sensitive(self):
        result = _sanitize_study_content("senha=abc123 é segredo")
        assert "abc123" not in result
        assert "[REDACTED]" in result


# ---------------------------------------------------------------------------
# Detecção automática de tópicos
# ---------------------------------------------------------------------------


class TestDetectStudyTopics:
    @pytest.mark.asyncio
    async def test_returns_empty_when_not_provisioned(self):
        with patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False):
            topics = await detect_study_topics("test-app")
            assert topics == []

    @pytest.mark.asyncio
    async def test_detects_from_actions_log(self):
        # Precisamos mockar duas chamadas separadas ao tenant_db_connection
        # Primeira: actions_log, Segunda: knowledge
        mock_cursor_actions = AsyncMock()
        mock_cursor_actions.fetchall.return_value = [
            {"input": "como funciona fastapi?"},
            {"input": "fastapi tem websocket?"},
            {"input": "deploy fastapi na vercel"},
            {"input": "fastapi é melhor que flask?"},
        ]

        mock_cursor_knowledge = AsyncMock()
        mock_cursor_knowledge.fetchall.return_value = []

        call_count = [0]

        class FakeConn:
            async def execute(self, sql, params=None):
                call_count[0] += 1
                if "actions_log" in sql:
                    return mock_cursor_actions
                return mock_cursor_knowledge

        fake_conn = FakeConn()

        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = fake_conn
        mock_cm.__aexit__.return_value = None

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            topics = await detect_study_topics("test-app", max_topics=3)
            topic_names = [t.topic for t in topics]
            assert any("fastapi" in t.lower() for t in topic_names)

    @pytest.mark.asyncio
    async def test_detects_knowledge_gaps(self):
        call_count = [0]

        mock_conn = AsyncMock()
        mock_cursor_actions = AsyncMock()
        mock_cursor_actions.fetchall.return_value = []

        mock_cursor_knowledge = AsyncMock()
        mock_cursor_knowledge.fetchall.return_value = [
            {"content": "Docker compose networking basics", "confidence": 0.45},
        ]

        async def mock_execute(sql, params=None):
            call_count[0] += 1
            if "actions_log" in sql:
                return mock_cursor_actions
            return mock_cursor_knowledge

        mock_conn.execute = mock_execute
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn
        mock_cm.__aexit__.return_value = None

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            topics = await detect_study_topics("test-app")
            assert any(t.source == "knowledge_gap" for t in topics)


# ---------------------------------------------------------------------------
# Estudo de tópico individual
# ---------------------------------------------------------------------------


class TestStudyTopic:
    @pytest.mark.asyncio
    async def test_returns_consolidated_when_local_confidence_high(self):
        """Não chama provider quando knowledge local já resolve."""
        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock,
                  return_value="[knowledge] (confidence: 0.90) FastAPI é um framework web rápido"),
        ):
            result = await study_topic("test-app", "FastAPI")
            assert result.should_save is False
            assert result.confidence >= 0.80
            assert "local" in result.tags

    @pytest.mark.asyncio
    async def test_calls_llm_when_local_confidence_low(self):
        llm_response = json.dumps({
            "summary": "FastAPI é um framework moderno para APIs em Python.",
            "conclusions": ["Alta performance", "Suporte a async"],
            "confidence": 0.85,
            "tags": ["python", "web"],
            "is_volatile": False,
        })

        async def mock_complete(messages, tools=None):
            return llm_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.research.web_search.search_web", new_callable=AsyncMock, return_value=[
                {"title": "FastAPI", "snippet": "Modern web framework", "url": "https://fastapi.tiangolo.com"}
            ]),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
        ):
            result = await study_topic("test-app", "FastAPI")
            assert result.confidence == 0.85
            assert "FastAPI" in result.summary
            assert result.should_save is True
            assert "llm_provider" in result.sources_used
            assert "web_search" in result.sources_used

    @pytest.mark.asyncio
    async def test_does_not_save_sensitive_topic(self):
        llm_response = json.dumps({
            "summary": "Info sobre credenciais.",
            "conclusions": [],
            "confidence": 0.9,
            "tags": [],
            "is_volatile": False,
        })

        async def mock_complete(messages, tools=None):
            return llm_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.research.web_search.search_web", new_callable=AsyncMock, return_value=[]),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
        ):
            result = await study_topic("test-app", "minha senha=abc123 do banco")
            assert result.should_save is False

    @pytest.mark.asyncio
    async def test_provider_failure_returns_partial(self):
        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.research.web_search.search_web", new_callable=AsyncMock, return_value=[]),
            patch("aion.llm.factory.get_llm_provider", side_effect=Exception("provider down")),
        ):
            result = await study_topic("test-app", "Kubernetes")
            assert result.should_save is False
            assert result.confidence == 0.0
            assert "provider_failed" in result.tags


# ---------------------------------------------------------------------------
# Persistência de resultado
# ---------------------------------------------------------------------------


class TestSaveStudyResult:
    @pytest.mark.asyncio
    async def test_saves_knowledge_correctly(self):
        result = StudyResult(
            topic="FastAPI",
            summary="Framework web moderno.",
            conclusions=["Rápido", "Async"],
            confidence=0.85,
            should_save=True,
            tags=["python", "web"],
        )

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-study-1"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            await save_study_result("test-app", result)
            # Se chegou aqui sem erro, passou

    @pytest.mark.asyncio
    async def test_skips_when_should_save_false(self):
        result = StudyResult(topic="test", should_save=False)

        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock) as mock_save:
            await save_study_result("test-app", result)
            mock_save.assert_not_called()


# ---------------------------------------------------------------------------
# Orquestrador principal
# ---------------------------------------------------------------------------


class TestRunStudyMode:
    @pytest.mark.asyncio
    async def test_manual_mode_studies_given_topics(self):
        llm_response = json.dumps({
            "summary": "Python é uma linguagem de programação.",
            "conclusions": ["Versátil", "Tipagem dinâmica"],
            "confidence": 0.80,
            "tags": ["programming"],
            "is_volatile": False,
        })

        async def mock_complete(messages, tools=None):
            return llm_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.research.web_search.search_web", new_callable=AsyncMock, return_value=[]),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-1"),
            patch("aion.memory.sqlite_store.provision_tenant", new_callable=AsyncMock),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2]),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_study_report", new_callable=AsyncMock),
            patch("aion.study.study_mode._save_study_report", new_callable=AsyncMock),
        ):
            report = await run_study_mode("test-app", topics=["Python"], mode="manual")
            assert report.app_id == "test-app"
            assert report.mode == "manual"
            assert "Python" in report.topics_studied
            assert report.knowledge_saved >= 1
            assert report.duration_seconds >= 0

    @pytest.mark.asyncio
    async def test_auto_mode_with_no_topics_returns_warning(self):
        with (
            patch("aion.study.study_mode.detect_study_topics", new_callable=AsyncMock, return_value=[]),
            patch("aion.study.study_mode._save_study_report", new_callable=AsyncMock),
        ):
            report = await run_study_mode("test-app", mode="auto")
            assert report.mode == "auto"
            assert report.topics_studied == []
            assert len(report.warnings) > 0

    @pytest.mark.asyncio
    async def test_auto_mode_studies_detected_topics(self):
        detected = [
            StudyTopic(topic="Docker networking", reason="Gap detectado", source="knowledge_gap", priority=3),
        ]

        llm_response = json.dumps({
            "summary": "Docker networking permite comunicação entre containers.",
            "conclusions": ["Bridge network é o default"],
            "confidence": 0.75,
            "tags": ["docker", "networking"],
            "is_volatile": False,
        })

        async def mock_complete(messages, tools=None):
            return llm_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.study.study_mode.detect_study_topics", new_callable=AsyncMock, return_value=detected),
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.research.web_search.search_web", new_callable=AsyncMock, return_value=[]),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-2"),
            patch("aion.memory.sqlite_store.provision_tenant", new_callable=AsyncMock),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1]),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_study_report", new_callable=AsyncMock),
            patch("aion.study.study_mode._save_study_report", new_callable=AsyncMock),
        ):
            report = await run_study_mode("test-app", mode="auto")
            assert report.mode == "auto"
            assert "Docker networking" in report.topics_studied
            assert report.knowledge_saved >= 1


# ---------------------------------------------------------------------------
# Relatório persistido
# ---------------------------------------------------------------------------


class TestStudyReportPersistence:
    @pytest.mark.asyncio
    async def test_get_last_report_returns_none_when_not_provisioned(self):
        with patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False):
            report = await get_last_study_report("test-app")
            assert report is None

    @pytest.mark.asyncio
    async def test_get_last_report_returns_none_when_empty(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.execute.return_value = mock_cursor

        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn
        mock_cm.__aexit__.return_value = None

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            report = await get_last_study_report("test-app")
            assert report is None


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


class TestStudyEndpoints:
    def _auth_patch(self):
        return patch("aion.middleware.auth.settings", **{
            "get_token_for_tenant.return_value": "mock_token",
        })

    def _headers(self):
        return {
            "X-Tenant-ID": "test-app",
            "Authorization": "Bearer mock_token",
        }

    @pytest.mark.asyncio
    async def test_post_study_returns_job_id(self):
        from fastapi.testclient import TestClient
        from aion.main import app

        with self._auth_patch():
            client = TestClient(app)
            response = client.post(
                "/v1/tenant/test-app/study",
                json={"topics": ["Python"], "mode": "manual"},
                headers=self._headers(),
            )
            assert response.status_code == 202
            data = response.json()
            assert "job_id" in data
            assert data["status"] == "started"
            assert data["job_id"].startswith("study_")

    @pytest.mark.asyncio
    async def test_get_study_status_not_found(self):
        from fastapi.testclient import TestClient
        from aion.main import app

        with self._auth_patch():
            client = TestClient(app)
            response = client.get(
                "/v1/tenant/test-app/study/nonexistent-job",
                headers=self._headers(),
            )
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_last_study_not_found(self):
        from fastapi.testclient import TestClient
        from aion.main import app

        with self._auth_patch():
            client = TestClient(app)
            response = client.get(
                "/v1/tenant/test-app/study/last",
                headers=self._headers(),
            )
            data = response.json()
            assert data["status"] == "not_found"

    @pytest.mark.asyncio
    async def test_tenant_isolation_on_study_job(self):
        """Tenant A não pode ver jobs de Tenant B."""
        from aion.main import STUDY_JOBS
        from fastapi.testclient import TestClient
        from aion.main import app

        # Simula job de outro tenant
        STUDY_JOBS["study_fake123"] = {
            "status": "completed",
            "report": {"summary": "secret"},
            "error": None,
            "app_id": "other-tenant",
        }

        with self._auth_patch():
            client = TestClient(app)
            response = client.get(
                "/v1/tenant/test-app/study/study_fake123",
                headers=self._headers(),
            )
            # Deve retornar 404 para tenant errado
            assert response.status_code == 404

        # Cleanup
        del STUDY_JOBS["study_fake123"]


# ---------------------------------------------------------------------------
# Chat não bloqueado
# ---------------------------------------------------------------------------


class TestStudyDoesNotBlockChat:
    @pytest.mark.asyncio
    async def test_chat_works_during_study(self):
        """Verifica que o endpoint de chat funciona mesmo com study rodando."""
        from aion.main import STUDY_JOBS

        # Simula job em andamento
        STUDY_JOBS["study_running"] = {
            "status": "running",
            "report": None,
            "error": None,
            "app_id": "test-app",
        }

        # Chat deve funcionar normalmente (usamos o mock padrão)
        from aion.agent.agent import run as agent_run

        with (
            patch("aion.agent.agent.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=AsyncMock(return_value=AsyncMock(return_value="OK"))),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-1"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
            patch("aion.agent.agent.get_emotional_context", new_callable=AsyncMock,
                  return_value=type('obj', (object,), {'current_state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.detect_emotional_state",
                  return_value=type('obj', (object,), {'state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.save_emotional_snapshot", new_callable=AsyncMock),
        ):
            response = await agent_run("test-app", "user-1", "hello", {})
            assert response.status == "success"

        # Cleanup
        del STUDY_JOBS["study_running"]
