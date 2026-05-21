import os
import json
import asyncio
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, ANY

from aion.teaching.self_teacher import (
    is_initialized,
    get_preflight_summary,
    generate_domain_questions,
    run_preflight,
    _initialized_tenants,
    _preflight_summaries,
    _teaching_locks,
)


@pytest.fixture(autouse=True)
def reset_state():
    _initialized_tenants.clear()
    _preflight_summaries.clear()
    _teaching_locks.clear()


class TestIsInitialized:

    @pytest.mark.asyncio
    async def test_returns_true_when_in_set(self):
        _initialized_tenants.add("app-teste")
        assert await is_initialized("app-teste") is True

    @pytest.mark.asyncio
    async def test_returns_false_when_db_missing(self):
        assert await is_initialized("app-inexistente") is False

    @pytest.mark.asyncio
    async def test_returns_false_when_not_provisioned(self):
        with patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False):
            assert await is_initialized("app-x") is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_marker(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            assert await is_initialized("app-x") is False

    @pytest.mark.asyncio
    async def test_returns_true_when_marker_found(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = {"id": "marker-123"}
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("os.path.exists", return_value=True),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            assert await is_initialized("app-x") is True
            assert "app-x" in _initialized_tenants

    @pytest.mark.asyncio
    async def test_does_not_scan_db_if_in_set(self):
        _initialized_tenants.add("app-y")
        with patch("aion.memory.sqlite_store.is_tenant_provisioned") as mock:
            assert await is_initialized("app-y") is True
            mock.assert_not_called()


class TestGetPreflightSummary:

    def test_returns_none_when_not_cached(self):
        assert get_preflight_summary("app-x") is None

    def test_returns_summary_when_cached(self):
        _preflight_summaries["app-x"] = "# Preflight"
        assert get_preflight_summary("app-x") == "# Preflight"


class TestGenerateDomainQuestions:

    @pytest.mark.asyncio
    async def test_returns_parsed_questions(self):
        async def mock_llm(messages):
            return "Pergunta 1?\nPergunta 2?\nPergunta 3?\nPergunta 4?\nPergunta 5?"

        questions = await generate_domain_questions("app de finanças", mock_llm)
        assert len(questions) == 5
        assert all(q.endswith("?") for q in questions)

    @pytest.mark.asyncio
    async def test_fallback_when_llm_returns_empty(self):
        async def mock_llm(messages):
            return ""

        questions = await generate_domain_questions("app generico", mock_llm)
        assert len(questions) == 5
        assert all(q.endswith("?") for q in questions)

    @pytest.mark.asyncio
    async def test_fallback_when_llm_raises(self):
        async def mock_llm(messages):
            raise RuntimeError("LLM down")

        questions = await generate_domain_questions("app generico", mock_llm)
        assert len(questions) == 5

    @pytest.mark.asyncio
    async def test_strips_markdown_bullets(self):
        async def mock_llm(messages):
            return "- Pergunta 1?\n* Pergunta 2?\n- Pergunta 3?"

        questions = await generate_domain_questions("app", mock_llm)
        assert len(questions) == 3

    @pytest.mark.asyncio
    async def test_timeout_returns_fallback(self):
        async def mock_llm(messages):
            await asyncio.sleep(10)
            return "Pergunta?"

        with patch("aion.teaching.self_teacher._call_llm", new_callable=AsyncMock, return_value=""):
            questions = await generate_domain_questions("app", mock_llm)
            assert len(questions) == 5


class TestRunPreflight:

    @pytest.mark.asyncio
    async def test_skips_when_already_initialized(self):
        _initialized_tenants.add("app-x")
        with patch("aion.teaching.self_teacher.generate_domain_questions") as mock:
            await run_preflight("app-x", "descricao", AsyncMock())
            mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_when_db_marker_exists(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = {"id": "marker-1"}
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("os.path.exists", return_value=True),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
            patch("aion.teaching.self_teacher.generate_domain_questions") as mock_gen,
        ):
            await run_preflight("app-x", "desc", AsyncMock())
            mock_gen.assert_not_called()

    @pytest.mark.asyncio
    async def test_generates_and_saves_knowledge(self):
        async def mock_llm(messages):
            msg = messages[0]["content"]
            if "gerar" in msg.lower() or "perguntas" in msg.lower():
                return "P1?\nP2?\nP3?\nP4?\nP5?"
            return "Resposta especializada."

        mock_save_knowledge = AsyncMock(side_effect=[f"k-{i}" for i in range(6)])
        mock_add_knowledge = AsyncMock()

        with (
            patch("aion.teaching.self_teacher.is_initialized", new_callable=AsyncMock, return_value=False),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save_knowledge),
            patch("aion.memory.vector_store.add_knowledge", mock_add_knowledge),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
        ):
            await run_preflight("app-x", "app de teste", mock_llm)
            assert mock_save_knowledge.call_count == 6  # 5 Q&A + 1 marker
            assert mock_add_knowledge.call_count == 6
            assert "app-x" in _initialized_tenants

    @pytest.mark.asyncio
    async def test_duplicate_call_does_not_run_twice(self):
        call_count = 0

        async def mock_llm(messages):
            return "P1?\nP2?\nP3?\nP4?\nP5?"

        async def counting_save(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return f"k-{call_count}"

        async def is_init_side_effect(app):
            return app in _initialized_tenants

        with (
            patch("aion.teaching.self_teacher.is_initialized", side_effect=is_init_side_effect),
            patch("aion.memory.sqlite_store.save_knowledge", counting_save),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
        ):
            task1 = asyncio.create_task(run_preflight("app-x", "desc", mock_llm))
            task2 = asyncio.create_task(run_preflight("app-x", "desc", mock_llm))
            await asyncio.gather(task1, task2)
            # Only one should have completed the full flow
            assert call_count == 6

    @pytest.mark.asyncio
    async def test_writes_obsidian_summary(self):
        async def mock_llm(messages):
            return "P1?\nP2?\nP3?\nP4?\nP5?"

        mock_write = AsyncMock()

        with (
            patch("aion.teaching.self_teacher.is_initialized", new_callable=AsyncMock, return_value=False),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, side_effect=[f"k-{i}" for i in range(6)]),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", mock_write),
            patch("aion.obsidian.writer._get_vault_path", return_value="/vault"),
        ):
            await run_preflight("app-x", "app de teste", mock_llm)
            mock_write.assert_awaited_once()
            args, _ = mock_write.await_args
            filepath = args[0]
            assert "app-x" in filepath
            assert "knowledge" in filepath
            assert "preflight" in filepath
            content = args[1]
            assert "Preflight" in content
            assert "app de teste" in content

    @pytest.mark.asyncio
    async def test_silent_failure_when_llm_unavailable(self):
        with (
            patch("aion.teaching.self_teacher.is_initialized", new_callable=AsyncMock, return_value=False),
            patch("aion.teaching.self_teacher._run_preflight_inner", side_effect=RuntimeError("LLM down")),
        ):
            await run_preflight("app-x", "desc", AsyncMock())
            # Should not raise — silent failure

    @pytest.mark.asyncio
    async def test_saves_summary_to_cache(self):
        async def mock_llm(messages):
            return "P1?\nP2?\nP3?\nP4?\nP5?"

        with (
            patch("aion.teaching.self_teacher.is_initialized", new_callable=AsyncMock, return_value=False),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, side_effect=[f"k-{i}" for i in range(6)]),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
        ):
            await run_preflight("app-x", "desc", mock_llm)
            summary = get_preflight_summary("app-x")
            assert summary is not None
            assert "Preflight" in summary
            assert "desc" in summary

    @pytest.mark.asyncio
    async def test_total_timeout_30s(self):
        async def slow_llm(messages):
            await asyncio.sleep(60)
            return "P1?"

        start = asyncio.get_event_loop().time()
        with (
            patch("aion.teaching.self_teacher.is_initialized", new_callable=AsyncMock, return_value=False),
            patch("aion.teaching.self_teacher._run_preflight_inner", side_effect=asyncio.TimeoutError()),
        ):
            await run_preflight("app-x", "desc", slow_llm)
            elapsed = asyncio.get_event_loop().time() - start
            # Should complete quickly (simulated timeout, not real 60s)
            assert elapsed < 5.0


class TestTenantMiddlewareIntegration:

    @pytest.mark.asyncio
    async def test_middleware_fires_preflight(self):
        from aion.middleware.tenant import TenantMiddleware
        mock_request = MagicMock()
        mock_request.url.path = "/v1/core/chat"
        mock_request.headers.get.return_value = None
        mock_request.query_params.get.return_value = None
        mock_request.method = "POST"
        mock_request.headers.get.side_effect = lambda k, d=None: "application/json" if k == "content-type" else d

        body_bytes = json.dumps({"app_id": "app-preflight-test", "user_id": "u1", "input": "oi"}).encode()
        mock_request.body = AsyncMock(return_value=body_bytes)
        mock_request.state = MagicMock()

        async def mock_call_next(req):
            return "response"

        with (
            patch("aion.database.provision_tenant", return_value="/tmp/test.db"),
            patch("aion.middleware.tenant.run_preflight", new_callable=AsyncMock) as mock_preflight,
        ):
            mw = TenantMiddleware(mock_call_next)
            await mw.dispatch(mock_request, mock_call_next)
            mock_preflight.assert_called_once()
            args, _ = mock_preflight.call_args
            assert args[0] == "app-preflight-test"
