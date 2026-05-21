import os
import json
import asyncio
import datetime
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from aion.analysis.pattern_detector import (
    detect_all_patterns,
    get_insights_for_briefing,
    schedule_detection,
    stop_detection,
    DetectedPattern,
    _detect_many_open_fronts,
    _detect_create_vs_complete_gap,
    _detect_stale_projects,
    _detect_inactivity_peak,
    _detect_researched_not_executed,
    _detect_unused_knowledge,
    _detect_repeated_questions,
    _group_hours,
    _pattern_cache,
    _scheduled_detections,
)


@pytest.fixture(autouse=True)
def reset():
    _pattern_cache.clear()
    _scheduled_detections.clear()


async def _provision(app_id: str):
    from aion.memory.sqlite_store import provision_tenant
    await provision_tenant(app_id)


async def _insert_action(app_id: str, status: str, created_at: str = "", input: str = "input", output: str = "output"):
    import uuid
    from aion.memory.sqlite_store import tenant_db_connection, provision_tenant
    await provision_tenant(app_id)
    if not created_at:
        created_at = datetime.datetime.utcnow().isoformat()
    aid = str(uuid.uuid4())
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            "INSERT INTO actions_log (id, app_id, action_type, input, output, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (aid, app_id, "test", input, output, status, created_at),
        )
        await conn.commit()


async def _insert_knowledge(app_id: str, content: str, tags: list, confidence: float = 1.0, created_at: str = ""):
    import uuid
    from aion.memory.sqlite_store import tenant_db_connection, provision_tenant
    await provision_tenant(app_id)
    if not created_at:
        created_at = datetime.datetime.utcnow().isoformat()
    kid = str(uuid.uuid4())
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            "INSERT INTO knowledge (id, app_id, content, tags, confidence, expires_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (kid, app_id, content, json.dumps(tags), confidence, None, created_at),
        )
        await conn.commit()


async def _insert_memory(app_id: str, content: str, mem_type: str = "user_query"):
    import uuid
    from aion.memory.sqlite_store import tenant_db_connection, provision_tenant
    await provision_tenant(app_id)
    mid = str(uuid.uuid4())
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            "INSERT INTO memories (id, app_id, content, type, metadata, confidence, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (mid, app_id, content, mem_type, None, 1.0, datetime.datetime.utcnow().isoformat()),
        )
        await conn.commit()


# ── TestGroupHours ────────────────────────────────────────────────

class TestGroupHours:
    def test_single_hour(self):
        assert _group_hours([8]) == "08h"

    def test_contiguous_range(self):
        assert _group_hours([2, 3, 4]) == "02h-04h"

    def test_multiple_ranges(self):
        result = _group_hours([1, 2, 5, 6, 10])
        assert "01h-02h" in result
        assert "05h-06h" in result
        assert "10h" in result

    def test_empty(self):
        assert _group_hours([]) == ""

    def test_unsorted(self):
        result = _group_hours([4, 2, 3])
        assert "02h-04h" in result


# ── TestDetectManyOpenFronts ──────────────────────────────────────

class TestDetectManyOpenFronts:
    @pytest.mark.asyncio
    async def test_returns_none_when_under_three(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_many_none"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        await _insert_knowledge(app_id, "projeto A", ["frontend"], created_at=now)
        await _insert_knowledge(app_id, "projeto B", ["backend"], created_at=now)
        result = await _detect_many_open_fronts(app_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_detects_when_over_three(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_many_yes"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for area in ["frontend", "backend", "mobile", "devops", "data"]:
            await _insert_knowledge(app_id, f"projeto {area}", [area], created_at=now)
        result = await _detect_many_open_fronts(app_id)
        assert result is not None
        assert result.type == "many_open_fronts"
        assert result.confidence >= 0.5

    @pytest.mark.asyncio
    async def test_unprovisioned_returns_none(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        result = await _detect_many_open_fronts("nonexistent")
        assert result is None


# ── TestDetectCreateVsCompleteGap ─────────────────────────────────

class TestDetectCreateVsCompleteGap:
    @pytest.mark.asyncio
    async def test_returns_none_when_few_actions(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_gap_few"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        await _insert_action(app_id, "completed", created_at=now)
        result = await _detect_create_vs_complete_gap(app_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_detects_low_completion(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_gap_low"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for _ in range(10):
            await _insert_action(app_id, "pending", created_at=now)
        await _insert_action(app_id, "completed", created_at=now)
        result = await _detect_create_vs_complete_gap(app_id)
        assert result is not None
        assert result.type == "create_vs_complete_gap"
        assert result.confidence > 0.5

    @pytest.mark.asyncio
    async def test_returns_none_when_high_completion(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_gap_high"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for _ in range(10):
            await _insert_action(app_id, "completed", created_at=now)
        result = await _detect_create_vs_complete_gap(app_id)
        assert result is None


# ── TestDetectStaleProjects ───────────────────────────────────────

class TestDetectStaleProjects:
    @pytest.mark.asyncio
    async def test_detects_old_knowledge(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_stale"
        await _provision(app_id)
        old = (datetime.datetime.utcnow() - datetime.timedelta(days=14)).isoformat()
        for i in range(4):
            await _insert_knowledge(app_id, f"projeto antigo {i}", ["test"], created_at=old)
        result = await _detect_stale_projects(app_id)
        assert result is not None
        assert result.type == "stale_projects"

    @pytest.mark.asyncio
    async def test_returns_none_when_recent(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_stale_none"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        await _insert_knowledge(app_id, "recente", ["test"], created_at=now)
        result = await _detect_stale_projects(app_id)
        assert result is None


# ── TestDetectInactivityPeak ──────────────────────────────────────

class TestDetectInactivityPeak:
    @pytest.mark.asyncio
    async def test_returns_none_when_few_actions(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_inact_few"
        await _provision(app_id)
        now = datetime.datetime.utcnow()
        for _ in range(5):
            await _insert_action(app_id, "completed", created_at=now.isoformat())
        result = await _detect_inactivity_peak(app_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_detects_low_hours(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_inact_yes"
        await _provision(app_id)
        now = datetime.datetime.utcnow()
        for _ in range(60):
            ts = now.replace(hour=12, minute=0, second=0).isoformat()
            await _insert_action(app_id, "completed", created_at=ts)
        for h in [0, 1, 2, 3, 4, 5, 6]:
            ts = now.replace(hour=h, minute=0, second=0).isoformat()
            await _insert_action(app_id, "completed", created_at=ts)
        result = await _detect_inactivity_peak(app_id)
        assert result is not None
        assert result.type == "inactivity_peak"


# ── TestDetectResearchedNotExecuted ───────────────────────────────

class TestDetectResearchedNotExecuted:
    @pytest.mark.asyncio
    async def test_detects_unmatched(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_res_not_exec"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        await _insert_knowledge(app_id, "machine learning transformers architecture", ["ml"], created_at=now)
        await _insert_knowledge(app_id, "kubernetes cluster deployment strategy", ["devops"], created_at=now)
        await _insert_knowledge(app_id, "react state management patterns", ["frontend"], created_at=now)
        await _insert_action(app_id, "completed", created_at=now)
        result = await _detect_researched_not_executed(app_id)
        assert result is not None
        assert result.type == "researched_not_executed"

    @pytest.mark.asyncio
    async def test_returns_none_when_all_executed(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_res_exec"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        await _insert_knowledge(app_id, "machine learning transformers", ["ml"], created_at=now)
        await _insert_action(app_id, "completed", input="machine", output="learning transformers", created_at=now)
        result = await _detect_researched_not_executed(app_id)
        assert result is None


# ── TestDetectUnusedKnowledge ─────────────────────────────────────

class TestDetectUnusedKnowledge:
    @pytest.mark.asyncio
    async def test_detects_low_confidence(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_unused"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for i in range(4):
            await _insert_knowledge(app_id, f"conhecimento duvidoso {i}", ["test"], confidence=0.3, created_at=now)
        result = await _detect_unused_knowledge(app_id)
        assert result is not None
        assert result.type == "unused_knowledge"

    @pytest.mark.asyncio
    async def test_returns_none_when_confident(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_used"
        await _provision(app_id)
        await _insert_knowledge(app_id, "conhecimento sólido", ["test"], confidence=0.9)
        result = await _detect_unused_knowledge(app_id)
        assert result is None


# ── TestDetectRepeatedQuestions ───────────────────────────────────

class TestDetectRepeatedQuestions:
    @pytest.mark.asyncio
    async def test_detects_repeated_type(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_repeat"
        await _provision(app_id)
        for _ in range(5):
            await _insert_memory(app_id, "qual o status do projeto?", "project_query")
        result = await _detect_repeated_questions(app_id)
        assert result is not None
        assert result.type == "repeated_questions"

    @pytest.mark.asyncio
    async def test_returns_none_when_few_memories(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_repeat_none"
        await _provision(app_id)
        await _insert_memory(app_id, "pergunta única", "query")
        result = await _detect_repeated_questions(app_id)
        assert result is None


# ── TestDetectAllPatterns ─────────────────────────────────────────

class TestDetectAllPatterns:
    @pytest.mark.asyncio
    async def test_returns_empty_for_unprovisioned(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        result = await detect_all_patterns("nonexistent")
        assert result == []

    @pytest.mark.asyncio
    async def test_detects_multiple_patterns(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_all"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        old = (datetime.datetime.utcnow() - datetime.timedelta(days=14)).isoformat()
        for area in ["a", "b", "c", "d", "e"]:
            await _insert_knowledge(app_id, f"projeto {area}", [area], created_at=now)
        for i in range(4):
            await _insert_knowledge(app_id, f"antigo {i}", ["old"], confidence=0.9, created_at=old)
        for _ in range(8):
            await _insert_action(app_id, "pending", created_at=now)
        await _insert_action(app_id, "completed", created_at=now)
        for _ in range(4):
            await _insert_memory(app_id, "mesma pergunta?", "faq")
        result = await detect_all_patterns(app_id)
        types = [p.type for p in result]
        assert "many_open_fronts" in types
        assert "stale_projects" in types
        assert "create_vs_complete_gap" in types
        assert "repeated_questions" in types

    @pytest.mark.asyncio
    async def test_caches_results(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_cache_all"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for area in ["a", "b", "c", "d"]:
            await _insert_knowledge(app_id, f"projeto {area}", [area], created_at=now)
        await detect_all_patterns(app_id)
        assert app_id in _pattern_cache


# ── TestGetInsightsForBriefing ────────────────────────────────────

class TestGetInsightsForBriefing:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_patterns(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        result = await get_insights_for_briefing("nonexistent")
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_formatted_insights(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_insights"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        for area in ["a", "b", "c", "d", "e"]:
            await _insert_knowledge(app_id, f"projeto {area}", [area], created_at=now)
        result = await get_insights_for_briefing(app_id)
        assert len(result) >= 1
        assert all(isinstance(i, str) for i in result)
        assert all(i.startswith("[") for i in result)

    @pytest.mark.asyncio
    async def test_max_three_insights(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_insights_max"
        await _provision(app_id)
        now = datetime.datetime.utcnow().isoformat()
        old = (datetime.datetime.utcnow() - datetime.timedelta(days=14)).isoformat()
        for area in ["a", "b", "c", "d", "e"]:
            await _insert_knowledge(app_id, f"projeto {area}", [area], created_at=now)
        for i in range(4):
            await _insert_knowledge(app_id, f"antigo {i}", ["old"], created_at=old)
        for _ in range(8):
            await _insert_action(app_id, "pending", created_at=now)
        await _insert_action(app_id, "completed", created_at=now)
        result = await get_insights_for_briefing(app_id)
        assert len(result) <= 3


# ── TestScheduleDetection ─────────────────────────────────────────

class TestScheduleDetection:
    @pytest.mark.asyncio
    async def test_schedules_once(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_sched"
        await schedule_detection(app_id)
        assert app_id in _scheduled_detections
        assert _scheduled_detections[app_id] is True

    @pytest.mark.asyncio
    async def test_does_not_duplicate(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_sched_dup"
        await schedule_detection(app_id)
        await schedule_detection(app_id)
        assert _scheduled_detections[app_id] is True

    @pytest.mark.asyncio
    async def test_stop_detection(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_stop"
        await schedule_detection(app_id)
        assert _scheduled_detections[app_id] is True
        await stop_detection(app_id)
        assert _scheduled_detections[app_id] is False


# ── TestDetectedPatternModel ──────────────────────────────────────

class TestDetectedPatternModel:
    def test_default_values(self):
        p = DetectedPattern()
        assert p.id == ""
        assert p.app_id == ""
        assert p.type == ""
        assert p.description == ""
        assert p.confidence == 0.0
        assert p.data == {}
        assert p.recommendation == ""
        assert p.detected_at == ""

    def test_full_construction(self):
        p = DetectedPattern(
            id="p1",
            app_id="test",
            type="test_type",
            description="desc",
            confidence=0.85,
            data={"key": "val"},
            recommendation="recomendo",
            detected_at="2025-01-01T00:00:00",
        )
        assert p.id == "p1"
        assert p.confidence == 0.85
        assert p.data["key"] == "val"
        assert p.recommendation == "recomendo"
