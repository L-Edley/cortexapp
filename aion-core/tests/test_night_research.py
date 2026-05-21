import os
import json
import shutil
import asyncio
import datetime
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, ANY

from aion.research.night_research import (
    run_night_research,
    get_last_report,
    get_monitored_topics,
    schedule_night_research,
    _save_research_result,
    _generate_research_questions,
    _is_knowledge_duplicate,
    _extract_topics_from_text,
    NightResearchReport,
    _last_reports,
    _TOPIC_CACHE,
    _scheduled_jobs,
)


@pytest.fixture(autouse=True)
def reset_state():
    _last_reports.clear()
    _TOPIC_CACHE.clear()
    _scheduled_jobs.clear()
    if os.path.isdir("data"):
        for f in os.listdir("data"):
            if f.endswith(".sqlite"):
                try:
                    os.remove(os.path.join("data", f))
                except PermissionError:
                    pass


class TestExtractTopics:

    def test_extracts_long_words(self):
        topics = _extract_topics_from_text("estou estudando machine learning e python")
        assert "machine" in topics
        assert "learning" in topics
        assert "python" in topics

    def test_skips_stopwords(self):
        topics = _extract_topics_from_text("para como sobre quando onde")
        assert topics == []

    def test_skips_short_words(self):
        topics = _extract_topics_from_text("um dois tres")
        assert topics == []

    def test_lowercases_and_strips_punctuation(self):
        topics = _extract_topics_from_text("Machine Learning!")
        assert "machine" in topics
        assert "learning" in topics


class TestGetMonitoredTopics:

    @pytest.mark.asyncio
    async def test_returns_topics_from_knowledge(self):
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.side_effect = [
            [("machine learning é importante",)],
            [],
            [],
        ]
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm):
            topics = await get_monitored_topics("app-x")
            assert "machine" in topics
            assert "learning" in topics

    @pytest.mark.asyncio
    async def test_deduplicates(self):
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.side_effect = [
            [("machine learning",)],
            [],
            [("machine learning",)],
        ]
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm):
            topics = await get_monitored_topics("app-x")
            assert topics.count("machine") == 1

    @pytest.mark.asyncio
    async def test_limits_to_max(self):
        many_rows = [(f"topic_{i} " * 5,) for i in range(100)]
        mock_cursor = AsyncMock()
        mock_cursor.fetchall.side_effect = [many_rows, [], []]
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = mock_cursor
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_conn

        with patch("aion.memory.sqlite_store.tenant_db_connection", return_value=mock_cm):
            topics = await get_monitored_topics("app-x")
            assert len(topics) <= 10

    @pytest.mark.asyncio
    async def test_caches_result(self):
        _TOPIC_CACHE["app-y"] = ["cached_topic"]
        topics = await get_monitored_topics("app-y")
        assert topics == ["cached_topic"]


class TestSaveResearchResult:

    @pytest.mark.asyncio
    async def test_saves_knowledge_and_vector(self):
        mock_save = AsyncMock(return_value="k-1")
        mock_add = AsyncMock()

        with (
            patch("aion.research.night_research._is_knowledge_duplicate", new_callable=AsyncMock, return_value=False),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save),
            patch("aion.memory.vector_store.add_knowledge", mock_add),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
        ):
            summary_lines = []
            saved = await _save_research_result("app-x", "P1?", "R1", summary_lines)
            assert saved is True
            mock_save.assert_called_once()
            mock_add.assert_called_once()
            assert len(summary_lines) > 0

    @pytest.mark.asyncio
    async def test_skips_duplicates(self):
        with (
            patch("aion.research.night_research._is_knowledge_duplicate", new_callable=AsyncMock, return_value=True),
        ):
            saved = await _save_research_result("app-x", "P1?", "R1", [])
            assert saved is False


class TestIsKnowledgeDuplicate:

    @pytest.mark.asyncio
    async def test_returns_true_when_similar_found(self):
        with (
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2]),
            patch("aion.memory.vector_store.semantic_search", new_callable=AsyncMock, return_value=[{"id": "k-1"}]),
        ):
            dup = await _is_knowledge_duplicate("app-x", "test content")
            assert dup is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_similar(self):
        with (
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2]),
            patch("aion.memory.vector_store.semantic_search", new_callable=AsyncMock, return_value=[]),
        ):
            dup = await _is_knowledge_duplicate("app-x", "test content")
            assert dup is False


class TestGenerateResearchQuestions:

    @pytest.mark.asyncio
    async def test_parses_llm_response(self):
        async def mock_llm(messages):
            return "Q1?\nQ2?\nQ3?"

        questions = await _generate_research_questions("app-x", ["topic1", "topic2"], mock_llm)
        assert len(questions) == 3
        assert all(q.endswith("?") for q in questions)

    @pytest.mark.asyncio
    async def test_fallback_when_llm_empty(self):
        async def mock_llm(messages):
            return ""

        questions = await _generate_research_questions("app-x", ["topic1"], mock_llm)
        assert len(questions) == 1
        assert "topic1" in questions[0]


class TestRunNightResearch:

    @pytest.mark.asyncio
    async def test_skips_unprovisioned_tenant(self):
        with patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False):
            report = await run_night_research("app-x")
            assert report.knowledge_saved == 0
            assert report.summary == ""

    @pytest.mark.asyncio
    async def test_skips_when_no_llm(self):
        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.llm.factory.get_llm_provider", side_effect=RuntimeError("No LLM")),
        ):
            report = await run_night_research("app-x")
            assert report.knowledge_saved == 0
            assert "LLM indisponível" in report.summary

    @pytest.mark.asyncio
    async def test_full_flow(self):
        async def mock_llm(messages):
            msg = messages[0]["content"]
            if "perguntas" in msg.lower():
                return "P1?\nP2?"
            return "Resposta de pesquisa."

        mock_save = AsyncMock(side_effect=[f"k-{i}" for i in range(5)])
        mock_add = AsyncMock()

        with (
            patch("aion.research.night_research.get_monitored_topics", new_callable=AsyncMock, return_value=["topic1", "topic2"]),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.save_knowledge", mock_save),
            patch("aion.memory.vector_store.add_knowledge", mock_add),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
            patch("aion.research.night_research._is_knowledge_duplicate", new_callable=AsyncMock, return_value=False),
        ):
            report = await run_night_research("app-x", mock_llm)
            assert report.knowledge_saved == 2
            assert len(report.topics_researched) == 2
            assert report.date == datetime.date.today().isoformat()

    @pytest.mark.asyncio
    async def test_saves_report_to_sqlite_and_cache(self):
        async def mock_llm(messages):
            return "P1?\nP2?"

        with (
            patch("aion.research.night_research.get_monitored_topics", new_callable=AsyncMock, return_value=["topic1"]),
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, side_effect=[f"k-{i}" for i in range(5)]),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.obsidian.writer._write_file", new_callable=AsyncMock),
            patch("aion.obsidian.writer._get_vault_path", return_value=None),
            patch("aion.research.night_research._is_knowledge_duplicate", new_callable=AsyncMock, return_value=False),
            patch("aion.research.night_research._save_report", new_callable=AsyncMock) as mock_save_report,
        ):
            report = await run_night_research("app-x", mock_llm)
            mock_save_report.assert_called_once()
            args = mock_save_report.call_args
            assert args[0][0] == "app-x"
            assert args[0][1].knowledge_saved == 2
            assert len(args[0][1].insights_generated) == 2


class TestGetLastReport:

    @pytest.mark.asyncio
    async def test_returns_none_when_no_report(self):
        report = await get_last_report("app-x")
        assert report is None

    @pytest.mark.asyncio
    async def test_returns_cached(self):
        cached = NightResearchReport(app_id="app-x", date="2026-05-20", created_at="now")
        _last_reports["app-x"] = cached
        report = await get_last_report("app-x")
        assert report is cached


class TestScheduleNightResearch:

    @pytest.mark.asyncio
    async def test_does_not_duplicate(self):
        with patch("apscheduler.schedulers.asyncio.AsyncIOScheduler") as mock_sched:
            mock_instance = MagicMock()
            mock_sched.return_value = mock_instance

            await schedule_night_research("app-x")
            await schedule_night_research("app-x")
            assert mock_sched.call_count == 1
            assert "app-x" in _scheduled_jobs

    @pytest.mark.asyncio
    async def test_handles_missing_apscheduler(self):
        with patch("builtins.__import__", side_effect=ImportError("No APScheduler")):
            await schedule_night_research("app-x")
            assert "app-x" not in _scheduled_jobs
