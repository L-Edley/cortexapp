import os
import asyncio
import datetime
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, ANY

from aion.teaching.reteacher import (
    get_knowledge_health,
    _identify_weak_topics,
    run_reteaching,
    schedule_reteaching,
    cancel_reteaching,
    is_reteaching_scheduled,
    _scheduled_tasks,
    _reteaching_locks,
    _lock_registry,
    KnowledgeHealth,
    ReteachingReport,
)


@pytest.fixture(autouse=True)
def reset_state():
    _scheduled_tasks.clear()
    _reteaching_locks.clear()


class TestKnowledgeHealth:

    @pytest.mark.asyncio
    async def test_returns_empty_for_unprovisioned(self):
        with patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False):
            health = await get_knowledge_health("app-x")
            assert health.total_knowledge == 0
            assert health.expired_count == 0
            assert health.low_confidence_count == 0
            assert health.healthy_count == 0

    @pytest.mark.asyncio
    async def test_counts_knowledge(self):
        mock_conn = AsyncMock()
        mock_cursor_1 = AsyncMock()
        mock_cursor_1.fetchone.side_effect = [(15,), (3,), (2,), (None,)]
        mock_conn.execute.return_value = mock_cursor_1
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            health = await get_knowledge_health("app-x")
            assert health.total_knowledge == 15
            assert health.expired_count == 3
            assert health.low_confidence_count == 2
            assert health.healthy_count == 10

    @pytest.mark.asyncio
    async def test_healthy_count_floor_at_zero(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.side_effect = [(5,), (10,), (0,), (None,)]
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            health = await get_knowledge_health("app-x")
            assert health.healthy_count == 0

    @pytest.mark.asyncio
    async def test_detects_last_reteaching(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.side_effect = [(10,), (0,), (0,), ("2026-05-18T12:00:00",)]
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
        ):
            health = await get_knowledge_health("app-x")
            assert health.last_reteaching == "2026-05-18T12:00:00"
            assert health.days_since_last_reteaching is not None


class TestIdentifyWeakTopics:

    @pytest.mark.asyncio
    async def test_uses_llm_when_healthy(self):
        async def mock_llm(messages):
            return "Topic 1?\nTopic 2?\nTopic 3?\nTopic 4?\nTopic 5?"

        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = []
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.teaching.reteacher.get_knowledge_health", new_callable=AsyncMock, return_value=KnowledgeHealth(total_knowledge=10, expired_count=0, low_confidence_count=0, healthy_count=10)),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
        ):
            topics = await _identify_weak_topics("app-x", mock_llm, "app de teste")
            assert len(topics) == 5
            assert all(t.endswith("?") for t in topics)

    @pytest.mark.asyncio
    async def test_includes_low_confidence_topics(self):
        async def mock_llm(messages):
            return "Topic 1?\nTopic 2?\nTopic 3?\nTopic 4?\nTopic 5?"

        mock_cursor = AsyncMock()
        mock_cursor.fetchall.return_value = [
            {"content": "old knowledge about X"},
        ]
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with (
            patch("aion.teaching.reteacher.get_knowledge_health", new_callable=AsyncMock, return_value=KnowledgeHealth(total_knowledge=10, expired_count=0, low_confidence_count=3, healthy_count=7)),
            patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
        ):
            topics = await _identify_weak_topics("app-x", mock_llm, "app")
            assert len(topics) <= 5
            assert any("Fragmented" in t for t in topics)

    @pytest.mark.asyncio
    async def test_fallback_when_llm_returns_empty(self):
        async def mock_llm(messages):
            return ""

        with (
            patch("aion.teaching.reteacher.get_knowledge_health", new_callable=AsyncMock, return_value=KnowledgeHealth(total_knowledge=0)),
        ):
            topics = await _identify_weak_topics("app-x", mock_llm, "app generico")
            assert len(topics) == 5
            assert all(t.endswith("?") for t in topics)


class TestRunReteaching:

    @pytest.mark.asyncio
    async def test_full_flow(self):
        async def mock_llm(messages):
            msg = messages[0]["content"]
            if "gerar" in msg.lower() or "perguntas" in msg.lower():
                return "P1?\nP2?\nP3?\nP4?\nP5?"
            return "Resposta do especialista."

        mock_save = AsyncMock(side_effect=[f"k-{i}" for i in range(6)])
        mock_add_vector = AsyncMock()

        with (
            patch("aion.teaching.reteacher._identify_weak_topics", new_callable=AsyncMock, return_value=["P1?", "P2?"]),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save),
            patch("aion.memory.vector_store.add_knowledge", mock_add_vector),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
        ):
            report = await run_reteaching("app-x", "app de teste", mock_llm)
            assert report.questions_generated == 2
            assert report.knowledge_saved == 2
            assert report.vectors_added == 2
            assert report.duration_seconds >= 0

    @pytest.mark.asyncio
    async def test_handles_missing_llm(self):
        with (
            patch("aion.llm.factory.get_llm_provider", side_effect=RuntimeError("No LLM")),
        ):
            report = await run_reteaching("app-x", "app de teste")
            assert len(report.errors) == 1
            assert "Failed to get LLM provider" in report.errors[0]

    @pytest.mark.asyncio
    async def test_handles_topic_failure_gracefully(self):
        async def mock_llm(messages):
            return "Answer for topic."

        mock_save = AsyncMock(side_effect=[f"k-{i}" for i in range(3)])

        with (
            patch("aion.teaching.reteacher._identify_weak_topics", new_callable=AsyncMock, return_value=["P1?", "P2?"]),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save),
            patch("aion.memory.vector_store.add_knowledge", side_effect=RuntimeError("Vector store down")),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
        ):
            report = await run_reteaching("app-x", "app", mock_llm)
            # Vector errors are caught per-topic, not fatal
            assert report.knowledge_saved == 2
            assert report.vectors_added == 0

    @pytest.mark.asyncio
    async def test_saves_marker_and_obsidian(self):
        async def mock_llm(messages):
            if "perguntas" in messages[0]["content"].lower():
                return "P1?\nP2?"
            return "Resposta."

        mock_save = AsyncMock(side_effect=[f"k-{i}" for i in range(3)])
        mock_write = AsyncMock()

        with (
            patch("aion.teaching.reteacher._identify_weak_topics", new_callable=AsyncMock, return_value=["P1?"]),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", mock_write),
            patch("aion.obsidian.writer._get_vault_path", return_value="/vault"),
        ):
            report = await run_reteaching("app-x", "app", mock_llm)
            assert mock_write.assert_awaited
            # 1 topic + 1 marker = 2 knowledge saves
            assert mock_save.call_count == 2
            # Last call is the marker
            last_call_content = mock_save.call_args_list[-1][0][1]
            assert last_call_content == "reteaching_complete"


class TestScheduleAndCancel:

    @pytest.mark.asyncio
    async def test_schedules_background_loop(self):
        await schedule_reteaching("app-x", "desc", interval_hours=999)
        assert "app-x" in _scheduled_tasks
        assert is_reteaching_scheduled("app-x") is True

    @pytest.mark.asyncio
    async def test_does_not_duplicate_schedule(self):
        await schedule_reteaching("app-x", "desc", interval_hours=999)
        task_id_1 = id(_scheduled_tasks["app-x"])
        await schedule_reteaching("app-x", "desc", interval_hours=999)
        task_id_2 = id(_scheduled_tasks["app-x"])
        assert task_id_1 == task_id_2

    @pytest.mark.asyncio
    async def test_cancel_reteaching(self):
        await schedule_reteaching("app-x", "desc", interval_hours=999)
        assert is_reteaching_scheduled("app-x") is True
        cancelled = await cancel_reteaching("app-x")
        assert cancelled is True
        assert is_reteaching_scheduled("app-x") is False

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_returns_false(self):
        cancelled = await cancel_reteaching("app-nonexistent")
        assert cancelled is False

    @pytest.mark.asyncio
    async def test_reteaching_loop_runs_on_interval(self):
        with (
            patch("aion.teaching.reteacher.run_reteaching", new_callable=AsyncMock) as mock_run,
        ):
            await schedule_reteaching("app-x", "desc", interval_hours=0.00005)
            await asyncio.sleep(0.6)
            assert mock_run.called
            await cancel_reteaching("app-x")

    @pytest.mark.asyncio
    async def test_loop_handles_exceptions_gracefully(self):
        with (
            patch("aion.teaching.reteacher.run_reteaching", side_effect=RuntimeError("Temporary error")),
        ):
            await schedule_reteaching("app-x", "desc", interval_hours=0.00005)
            await asyncio.sleep(0.6)
            # Loop should survive the error and keep running
            task = _scheduled_tasks.get("app-x")
            assert task is not None and task.done() is False
            await cancel_reteaching("app-x")
