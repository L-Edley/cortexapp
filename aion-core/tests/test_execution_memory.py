import pytest
import json
from unittest.mock import patch, AsyncMock
from typing import List, Dict, Any


class TestExecutionRecord:
    def test_create_record_with_defaults(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        rec = ExecutionRecord()
        assert rec.id == ""
        assert rec.goal == ""
        assert rec.modes_used == []
        assert rec.providers_used == []
        assert not rec.success
        assert rec.duration_seconds == 0.0
        assert rec.errors == []
        assert rec.improvements == []
        assert rec.created_at != ""

    def test_create_record_with_values(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        rec = ExecutionRecord(
            goal="criar um app",
            goal_type="product_development",
            modes_used=["dev", "research"],
            providers_used=["openrouter/deepseek"],
            success=True,
            duration_seconds=5.5,
            errors=["timeout"],
            improvements=["usar cache"],
            confidence_score=0.85,
        )
        assert rec.goal == "criar um app"
        assert rec.goal_type == "product_development"
        assert rec.modes_used == ["dev", "research"]
        assert rec.providers_used == ["openrouter/deepseek"]
        assert rec.success
        assert rec.duration_seconds == 5.5
        assert rec.errors == ["timeout"]
        assert rec.improvements == ["usar cache"]
        assert rec.confidence_score == 0.85

    def test_confidence_score_bounds(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ExecutionRecord(confidence_score=1.5)
        with pytest.raises(ValidationError):
            ExecutionRecord(confidence_score=-0.1)


class TestExecutionMemoryStore:
    @pytest.mark.asyncio
    async def test_save_record(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()
        rec = ExecutionRecord(goal="teste", goal_type="learning", success=True)

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            k_id = await store.save("cortex", rec)
            assert k_id == "k123"
            assert rec.id != ""

    @pytest.mark.asyncio
    async def test_save_generates_id(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()
        rec = ExecutionRecord(goal="teste", goal_type="test")
        assert rec.id == ""

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            await store.save("cortex", rec)
            assert rec.id != ""

    @pytest.mark.asyncio
    async def test_save_sets_error_and_improvement_counts(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()
        rec = ExecutionRecord(
            goal="teste", goal_type="test",
            errors=["err1", "err2"],
            improvements=["imp1"],
        )
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            await store.save("cortex", rec)
            assert rec.error_count == 2
            assert rec.improvement_count == 1

    @pytest.mark.asyncio
    async def test_save_obsidian_fail_does_not_crash(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()
        rec = ExecutionRecord(goal="teste", goal_type="test")

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", side_effect=Exception("obsidian fail")),
        ):
            k_id = await store.save("cortex", rec)
            assert k_id == "k123"

    @pytest.mark.asyncio
    async def test_list_recent_parses_records(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()

        mock_results = [
            {"content": json.dumps({"id": "r1", "goal": "goal1", "goal_type": "dev", "success": True})},
            {"content": json.dumps({"id": "r2", "goal": "goal2", "goal_type": "learning", "success": False})},
        ]

        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_results):
            records = await store.list_recent("cortex", limit=10)
            assert len(records) == 2
            assert records[0].id == "r1"
            assert records[0].success
            assert records[1].id == "r2"
            assert not records[1].success

    @pytest.mark.asyncio
    async def test_list_recent_skips_malformed(self):
        from aion.orchestrator.execution_memory import (
            ExecutionRecord, ExecutionMemoryStore,
        )
        store = ExecutionMemoryStore()

        mock_results = [
            {"content": "not valid json"},
            {"content": json.dumps({"id": "r2", "goal": "goal2", "goal_type": "test", "success": True})},
        ]

        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_results):
            records = await store.list_recent("cortex", limit=10)
            assert len(records) == 1
            assert records[0].id == "r2"

    @pytest.mark.asyncio
    async def test_get_success_rate_all(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        mock_records = []
        for i in range(10):
            mock_records.append({
                "content": json.dumps({
                    "id": f"r{i}", "goal": f"g{i}", "goal_type": "dev",
                    "success": i < 7,
                })
            })

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records):
            rate = await store.get_success_rate("cortex")
            assert rate == 0.7

    @pytest.mark.asyncio
    async def test_get_success_rate_by_goal_type(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        mock_records = [
            {"content": json.dumps({"id": "r1", "goal_type": "dev", "success": True})},
            {"content": json.dumps({"id": "r2", "goal_type": "dev", "success": False})},
            {"content": json.dumps({"id": "r3", "goal_type": "learning", "success": True})},
        ]

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records):
            rate = await store.get_success_rate("cortex", goal_type="dev")
            assert rate == 0.5

    @pytest.mark.asyncio
    async def test_get_success_rate_empty(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]):
            rate = await store.get_success_rate("cortex")
            assert rate == 0.0

    @pytest.mark.asyncio
    async def test_get_dashboard_empty(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]):
            dash = await store.get_dashboard("cortex")
            assert dash["total_executions"] == 0
            assert dash["success_rate"] == 0.0
            assert dash["total_failures"] == 0

    @pytest.mark.asyncio
    async def test_get_dashboard_with_data(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        mock_records = [
            {"content": json.dumps({
                "id": "r1", "goal": "g1", "goal_type": "dev",
                "success": True, "duration_seconds": 2.0,
                "modes_used": ["dev", "research"],
                "providers_used": ["p1"],
            })},
            {"content": json.dumps({
                "id": "r2", "goal": "g2", "goal_type": "learning",
                "success": False, "duration_seconds": 5.0,
                "modes_used": ["study"],
                "providers_used": ["p2"],
            })},
        ]

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records):
            dash = await store.get_dashboard("cortex")
            assert dash["total_executions"] == 2
            assert dash["success_rate"] == 0.5
            assert dash["average_duration"] == 3.5
            assert dash["total_failures"] == 1
            assert dash["mode_stats"]["dev"] == 1
            assert dash["mode_stats"]["study"] == 1
            assert dash["provider_stats"]["p1"] == 1
            assert len(dash["top_strategies"]) == 2

    @pytest.mark.asyncio
    async def test_get_dashboard_skips_zero_duration(self):
        from aion.orchestrator.execution_memory import ExecutionMemoryStore

        mock_records = [
            {"content": json.dumps({
                "id": "r1", "goal": "g1", "goal_type": "dev",
                "success": True, "duration_seconds": 0.0,
                "modes_used": [], "providers_used": [],
            })},
        ]

        store = ExecutionMemoryStore()
        with patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records):
            dash = await store.get_dashboard("cortex")
            assert dash["average_duration"] == 0.0

    @pytest.mark.asyncio
    async def test_singleton(self):
        from aion.orchestrator.execution_memory import get_execution_memory, ExecutionMemoryStore
        s1 = get_execution_memory()
        s2 = get_execution_memory()
        assert s1 is s2
        assert isinstance(s1, ExecutionMemoryStore)


class TestSafety:
    def test_reflection_never_executes_actions(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        rec = ExecutionRecord(goal="teste", goal_type="test")
        assert hasattr(rec, "success")
        assert hasattr(rec, "errors")
        assert hasattr(rec, "improvements")
        assert not hasattr(rec, "execute")
        assert not hasattr(rec, "run")
        assert not hasattr(rec, "shell")

    def test_default_not_success(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        rec = ExecutionRecord()
        assert not rec.success
