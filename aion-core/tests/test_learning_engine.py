import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, ANY
from datetime import datetime, timedelta

from aion.learning.learning_engine import (
    LearningResult,
    save_to_brain,
    _check_recent_cache,
    run,
)
from aion.learning.knowledge_gap import LearningClassification


class TestLearningResult:

    def test_default_values(self):
        lr = LearningResult()
        assert lr.answer == ""
        assert lr.source == "provider"
        assert lr.gap_type == "stable_knowledge"
        assert lr.learned is False
        assert lr.confidence == 0.0

    def test_custom_values(self):
        lr = LearningResult(
            answer="hello",
            raw_response='{"content": "hello"}',
            source="cache",
            gap_type="already_known",
            learned=False,
            confidence=0.85,
            provider_used="mock",
            debug={"key": "val"},
        )
        assert lr.answer == "hello"
        assert lr.source == "cache"
        assert lr.gap_type == "already_known"
        assert lr.provider_used == "mock"
        assert lr.debug["key"] == "val"


class TestCheckRecentCache:

    @pytest.mark.asyncio
    async def test_cache_hit_returns_output(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = {"output": "cached reply"}
        mock_conn.execute.return_value = mock_cursor

        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm):
            result = await _check_recent_cache("app-x", "hello")
            assert result == "cached reply"

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.execute.return_value = mock_cursor

        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm):
            result = await _check_recent_cache("app-x", "unknown")
            assert result is None

    @pytest.mark.asyncio
    async def test_exception_returns_none(self):
        with patch("aion.memory.sqlite_store.tenant_db_connection", side_effect=Exception("db error")):
            result = await _check_recent_cache("app-x", "hello")
            assert result is None


class TestSaveToBrain:

    @pytest.mark.asyncio
    async def test_discard_saves_nothing(self):
        cls = LearningClassification(action="discard", target="none")
        result = await save_to_brain("app", "input", cls, "response")
        assert result["saved"] is False
        assert result["target"] == "none"

    @pytest.mark.asyncio
    async def test_update_cache_saves_nothing(self):
        cls = LearningClassification(action="update_cache", target="cache")
        result = await save_to_brain("app", "input", cls, "response")
        assert result["saved"] is False
        assert result["target"] == "cache"

    @pytest.mark.asyncio
    async def test_save_memory_persists(self):
        cls = LearningClassification(
            action="save_memory", target="memory",
            content="user said hello", tags=["personal", "user_fact"],
            confidence=0.95,
        )
        with (
            patch("aion.memory.sqlite_store.save_memory", new_callable=AsyncMock, return_value="mem-123"),
            patch("aion.memory.vector_store.add_memory", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
        ):
            result = await save_to_brain("app", "input", cls, "llm_response")
            assert result["saved"] is True
            assert result["id"] == "mem-123"
            assert result["target"] == "memory"

    @pytest.mark.asyncio
    async def test_save_knowledge_persists(self):
        cls = LearningClassification(
            action="save_knowledge", target="knowledge",
            content="technical concept", tags=["stable", "technical"],
            confidence=0.85,
        )
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-456"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.4, 0.5, 0.6]),
        ):
            result = await save_to_brain("app", "input", cls, "llm_response")
            assert result["saved"] is True
            assert result["id"] == "k-456"
            assert result["target"] == "knowledge"

    @pytest.mark.asyncio
    async def test_fresh_info_has_expiry(self):
        cls = LearningClassification(
            action="save_memory", target="memory",
            content="weather info", tags=["fresh", "volatile"],
            confidence=0.70, expires_in_hours=48,
        )
        with (
            patch("aion.memory.sqlite_store.save_memory", new_callable=AsyncMock, return_value="mem-789"),
            patch("aion.memory.vector_store.add_memory", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.7, 0.8, 0.9]),
        ):
            result = await save_to_brain("app", "input", cls, "llm_response")
            assert result["saved"] is True
            assert result["id"] == "mem-789"

    @pytest.mark.asyncio
    async def test_project_decision_saves_to_knowledge(self):
        cls = LearningClassification(
            action="save_knowledge", target="knowledge",
            content="decision made", tags=["decision", "project"],
            confidence=0.90,
        )
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-decision"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[1.0, 0.0, 0.0]),
        ):
            result = await save_to_brain("app", "input", cls, "llm_response")
            assert result["saved"] is True
            assert result["id"] == "k-decision"

    @pytest.mark.asyncio
    async def test_empty_embedding_still_saves_sqlite(self):
        cls = LearningClassification(
            action="save_knowledge", target="knowledge",
            content="no vector", tags=["test"], confidence=0.5,
        )
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-novec"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[]),
        ):
            result = await save_to_brain("app", "input", cls, "llm_response")
            assert result["saved"] is True
            assert result["id"] == "k-novec"


class TestLearningEngineRun:

    @pytest.mark.asyncio
    async def test_already_known_returns_cache(self):
        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value="[memory] (confidence: 0.85) cached"),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
        ):
            result = await run("app-x", "user-1", "alguma pergunta", {})
            assert result.source == "cache"
            assert result.gap_type == "already_known"
            assert result.learned is False

    @pytest.mark.asyncio
    async def test_personal_memory_returns_cache(self):
        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
        ):
            result = await run("app-x", "user-1", "meu nome é João", {})
            assert result.source == "cache"
            assert result.gap_type == "personal_memory"
            assert result.learned is False

    @pytest.mark.asyncio
    async def test_recent_cache_hit_returns_cached(self):
        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value="cached response"),
        ):
            result = await run("app-x", "user-1", "o que é API?", {})
            assert result.source == "cache"
            assert result.answer == "cached response"

    @pytest.mark.asyncio
    async def test_stable_knowledge_calls_provider_and_learns(self):
        async def mock_complete(messages, tools=None):
            return "API significa Application Programming Interface"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-stable"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "o que é uma API REST?", {})
            assert result.source == "provider"
            assert result.gap_type == "stable_knowledge"
            assert result.learned is True
            assert "API" in result.answer
            assert result.provider_used is not None

    @pytest.mark.asyncio
    async def test_strategic_analysis_learns(self):
        async def mock_complete(messages, tools=None):
            return "Análise completa da concorrência concluída."

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-strat"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.4, 0.5, 0.6]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "analise a concorrência", {})
            assert result.source == "provider"
            assert result.gap_type == "strategic_analysis"
            assert result.learned is True

    @pytest.mark.asyncio
    async def test_project_decision_learns(self):
        async def mock_complete(messages, tools=None):
            return "Vamos usar Python sim."

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-decision"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.7, 0.8, 0.9]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "vamos usar Python", {})
            assert result.source == "provider"
            assert result.gap_type == "project_decision"
            assert result.learned is True

    @pytest.mark.asyncio
    async def test_fresh_info_learns(self):
        async def mock_complete(messages, tools=None):
            return "Amanhã fará 25 graus."

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_memory", new_callable=AsyncMock, return_value="mem-fresh"),
            patch("aion.memory.vector_store.add_memory", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.2, 0.3, 0.4]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "qual a previsão do tempo hoje?", {})
            assert result.source == "provider"
            assert result.gap_type == "fresh_info"
            assert result.learned is True

    @pytest.mark.asyncio
    async def test_provider_failure_falls_back_to_mock(self):
        call_count = 0

        async def mock_fail(messages, tools=None):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("provider down")

        async def mock_get_provider():
            return mock_fail

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.llm.providers.mock.complete", new_callable=AsyncMock, return_value="Mock fallback response"),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-mock"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.1, 0.1]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "o que é Python?", {})
            assert result.source == "provider"
            assert result.provider_used == "mock"
            assert result.answer == "Mock fallback response"

    @pytest.mark.asyncio
    async def test_all_providers_fail_returns_fallback(self):
        async def mock_fail(messages, tools=None):
            raise RuntimeError("provider down")

        async def mock_get_provider():
            return mock_fail

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.llm.providers.mock.complete", side_effect=mock_fail),
        ):
            result = await run("app-x", "user-1", "o que é Python?", {})
            assert result.source == "fallback"
            assert result.learned is False
            assert result.provider_used == "none"

    @pytest.mark.asyncio
    async def test_sensitive_input_discards(self):
        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
        ):
            result = await run("app-x", "user-1", "meu CPF é 123.456.789-09", {})
            assert result.source == "cache"
            assert result.gap_type == "ignore"
            assert result.learned is False

    @pytest.mark.asyncio
    async def test_debug_contains_gap_and_provider_info(self):
        async def mock_complete(messages, tools=None):
            return "Resposta do provider"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-debug"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "o que é um banco relacional?", {})
            assert "gap_type" in result.debug
            assert "provider" in result.debug
            assert "rag_confidence" in result.debug
            assert result.debug["provider_ok"] is True
            assert "classification" in result.debug
            assert "brain" in result.debug

    @pytest.mark.asyncio
    async def test_raw_response_preserved_for_tool_parsing(self):
        raw = json.dumps({
            "tool_calls": [{"name": "create_task", "arguments": {"title": "test"}}],
            "content": "Tarefa criada.",
        })

        async def mock_complete(messages, tools=None):
            return raw

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-tool"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            result = await run("app-x", "user-1", "crie uma tarefa", {})
            assert result.raw_response == raw
            # tool_calls should be parseable from raw_response
            import json as j
            data = j.loads(result.raw_response)
            assert "tool_calls" in data


class TestAgentLearningEngineIntegration:

    @pytest.mark.asyncio
    async def test_agent_delegates_to_learning_engine_for_llm_path(self):
        from aion.agent.agent import run as agent_run
        from aion.agent.reasoner import build_rag_context

        async def mock_complete(messages, tools=None):
            return "Hi there!"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.agent.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-123"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
            patch("aion.agent.agent.get_emotional_context", new_callable=AsyncMock, return_value=type('obj', (object,), {'current_state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.detect_emotional_state", return_value=type('obj', (object,), {'state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.save_emotional_snapshot", new_callable=AsyncMock),
        ):
            response = await agent_run("tenant-x", "user-1", "hello", {})
            assert response.response_source == "provider"
            assert response.ui_reply == "Hi there!"

    @pytest.mark.asyncio
    async def test_agent_tool_execution_from_learning_engine(self):
        from aion.agent.agent import run as agent_run

        tool_response = json.dumps({
            "tool_calls": [{"name": "create_task", "arguments": {"title": "Buy bread", "due_date": "2026-05-22"}}],
            "content": "I'll create that task for you.",
        })

        async def mock_complete(messages, tools=None):
            return tool_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.agent.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-123"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
            patch("aion.agent.agent.get_emotional_context", new_callable=AsyncMock, return_value=type('obj', (object,), {'current_state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.detect_emotional_state", return_value=type('obj', (object,), {'state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.save_emotional_snapshot", new_callable=AsyncMock),
        ):
            response = await agent_run("tenant-x", "user-1", "create a task", {})
            assert response.action_executed == "create_task"
            assert response.ui_reply == "I'll create that task for you."
