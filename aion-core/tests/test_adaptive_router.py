import pytest
from unittest.mock import patch, AsyncMock
from typing import List, Dict, Any

from aion.orchestrator.execution_memory import ExecutionRecord


def make_records(goal_type: str, success_count: int, fail_count: int, modes: List[str], providers: List[str]) -> List[ExecutionRecord]:
    records = []
    for i in range(success_count):
        records.append(ExecutionRecord(
            id=f"{goal_type}_ok_{i}",
            goal=f"test {goal_type} {i}",
            goal_type=goal_type,
            modes_used=modes,
            providers_used=providers,
            success=True,
            duration_seconds=2.0,
            confidence_score=0.9,
        ))
    for i in range(fail_count):
        records.append(ExecutionRecord(
            id=f"{goal_type}_fail_{i}",
            goal=f"test {goal_type} {i}",
            goal_type=goal_type,
            modes_used=modes,
            providers_used=providers,
            success=False,
            duration_seconds=10.0,
            errors=["timeout"],
            confidence_score=0.3,
        ))
    return records


class TestStrategyEvaluator:
    @pytest.mark.asyncio
    async def test_update_from_records(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = make_records("dev", 9, 1, ["dev", "research"], ["openrouter/deepseek"])
        await evaluator.update_from_records(records)
        strategies = evaluator.get_all_strategies()
        assert "dev" in strategies
        entry = strategies["dev"]
        assert entry.total_executions == 10
        assert entry.success_rate == 0.9
        assert "dev" in entry.best_modes
        assert entry.best_provider == "openrouter/deepseek"

    @pytest.mark.asyncio
    async def test_get_best_strategy_exists(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = make_records("learning", 7, 3, ["study"], ["provider1"])
        await evaluator.update_from_records(records)
        entry = evaluator.get_best_strategy("learning")
        assert entry is not None
        assert entry.goal_type == "learning"
        assert entry.total_executions == 10

    @pytest.mark.asyncio
    async def test_get_best_strategy_nonexistent(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        entry = evaluator.get_best_strategy("nonexistent")
        assert entry is None

    @pytest.mark.asyncio
    async def test_get_confidence_score(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = make_records("dev", 8, 2, ["dev"], ["p1"])
        await evaluator.update_from_records(records)
        confidence = evaluator.get_confidence_score("dev")
        assert confidence > 0.0
        assert confidence <= 1.0

    @pytest.mark.asyncio
    async def test_get_confidence_score_low_executions(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = make_records("dev", 1, 0, ["dev"], ["p1"])
        await evaluator.update_from_records(records)
        confidence = evaluator.get_confidence_score("dev")
        assert confidence == 0.0

    @pytest.mark.asyncio
    async def test_get_most_used_modes(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = make_records("dev", 5, 0, ["dev", "research"], ["p1"])
        await evaluator.update_from_records(records)
        modes = evaluator.get_most_used_modes(top_n=5)
        assert len(modes) > 0
        assert any(m["mode"] == "dev" for m in modes)

    @pytest.mark.asyncio
    async def test_multiple_goal_types(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        records = []
        records.extend(make_records("dev", 8, 2, ["dev", "research"], ["p1"]))
        records.extend(make_records("learning", 5, 5, ["study"], ["p2"]))
        await evaluator.update_from_records(records)
        strategies = evaluator.get_all_strategies()
        assert "dev" in strategies
        assert "learning" in strategies
        assert strategies["dev"].success_rate == 0.8
        assert strategies["learning"].success_rate == 0.5


class TestAdaptiveRouter:
    @pytest.mark.asyncio
    async def test_router_adjusts_scores_with_history(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        from aion.orchestrator.adaptive_router import AdaptiveRouter
        evaluator = StrategyEvaluator()
        records = make_records("dev", 9, 1, ["dev", "research"], ["openrouter/deepseek"])
        await evaluator.update_from_records(records)
        router = AdaptiveRouter(evaluator)
        result = await router.get_adjusted_scores("dev", ["dev", "study", "chat"])
        assert result.is_adapted
        assert result.strategy_confidence > 0.0
        assert "dev" in result.mode_scores
        assert result.provider_preference == "openrouter/deepseek"

    @pytest.mark.asyncio
    async def test_router_fallback_without_history(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        from aion.orchestrator.adaptive_router import AdaptiveRouter
        evaluator = StrategyEvaluator()
        router = AdaptiveRouter(evaluator)
        result = await router.get_adjusted_scores("unknown_type", ["dev", "chat"])
        assert not result.is_adapted
        assert result.strategy_confidence == 0.0
        assert result.mode_scores["dev"] == 1.0
        assert result.mode_scores["chat"] == 1.0

    @pytest.mark.asyncio
    async def test_router_boosts_known_best_mode(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        from aion.orchestrator.adaptive_router import AdaptiveRouter
        evaluator = StrategyEvaluator()
        records = make_records("dev", 10, 0, ["dev", "research"], ["p1"])
        await evaluator.update_from_records(records)
        router = AdaptiveRouter(evaluator)
        result = await router.get_adjusted_scores("dev", ["dev", "chat"])
        assert result.is_adapted
        assert result.mode_scores["dev"] >= result.mode_scores["chat"]

    @pytest.mark.asyncio
    async def test_get_routing_summary(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        from aion.orchestrator.adaptive_router import AdaptiveRouter
        evaluator = StrategyEvaluator()
        records = make_records("dev", 8, 2, ["dev"], ["p1"])
        await evaluator.update_from_records(records)
        router = AdaptiveRouter(evaluator)
        summary = router.get_routing_summary("dev")
        assert "80%" in summary or "0.8" in summary
        assert "dev" in summary

    @pytest.mark.asyncio
    async def test_get_routing_summary_no_strategy(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        from aion.orchestrator.adaptive_router import AdaptiveRouter
        evaluator = StrategyEvaluator()
        router = AdaptiveRouter(evaluator)
        summary = router.get_routing_summary("unknown")
        assert "Nenhuma" in summary


class TestIntegration:
    @pytest.mark.asyncio
    async def test_learning_system_records_and_reflects(self):
        from aion.orchestrator.learning_system import OrchestratorLearningSystem
        system = OrchestratorLearningSystem()

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]),
        ):
            rec = await system.record_execution(
                app_id="cortex",
                goal="criar um app",
                goal_type="product_development",
                modes_used=["dev", "research"],
                providers_used=["openrouter/deepseek"],
                success=True,
                duration_seconds=5.0,
                confidence_score=0.85,
            )
            assert rec.id != ""
            assert rec.success
            assert rec.goal_type == "product_development"

            reflection = await system.reflect_on_execution("cortex", rec)
            assert reflection.execution_id == rec.id

            await system.sync_strategies("cortex")
            routing = await system.get_routing_recommendation(
                "product_development", ["dev", "study", "chat"]
            )
            assert routing is not None

    @pytest.mark.asyncio
    async def test_learning_system_dashboard(self):
        from aion.orchestrator.learning_system import OrchestratorLearningSystem
        system = OrchestratorLearningSystem()

        mock_records = [
            {"content": '{"id":"r1","goal":"g1","goal_type":"dev","success":true,"duration_seconds":2.0,"modes_used":["dev"],"providers_used":["p1"],"errors":[],"improvements":[],"confidence_score":0.9,"error_count":0,"improvement_count":0,"created_at":"2026-01-01"}'},
            {"content": '{"id":"r2","goal":"g2","goal_type":"learning","success":false,"duration_seconds":5.0,"modes_used":["study"],"providers_used":["p2"],"errors":["timeout"],"improvements":[],"confidence_score":0.3,"error_count":1,"improvement_count":0,"created_at":"2026-01-01"}'},
        ]

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records),
        ):
            dash = await system.get_dashboard_data("cortex")
            assert dash["total_executions"] == 2
            assert dash["success_rate"] == 0.5
            assert "dev" in dash["strategies"]
            assert "learning" in dash["strategies"]

    @pytest.mark.asyncio
    async def test_learning_system_failure_feedback(self):
        from aion.orchestrator.learning_system import OrchestratorLearningSystem
        system = OrchestratorLearningSystem()
        rec = ExecutionRecord(
            goal="deletar dados",
            goal_type="troubleshooting",
            success=False,
            errors=["timeout"],
            modes_used=["chat"],
            providers_used=["p1"],
            confidence_score=0.3,
        )

        call_count = 0

        async def mock_save_knowledge(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return f"k{call_count}"

        with (
            patch("aion.memory.sqlite_store.save_knowledge", side_effect=mock_save_knowledge),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            result = await system.process_failure_feedback("cortex", rec)
            assert result["status"] == "recorded"
            assert "reflection" in result
            assert call_count >= 1


class TestSafety:
    def test_learning_system_has_no_execute_methods(self):
        from aion.orchestrator.learning_system import OrchestratorLearningSystem
        system = OrchestratorLearningSystem()
        assert not hasattr(system, "execute_shell")
        assert not hasattr(system, "run_command")
        assert not hasattr(system, "auto_execute")

    def test_execution_record_has_no_dangerous_attrs(self):
        from aion.orchestrator.execution_memory import ExecutionRecord
        rec = ExecutionRecord()
        assert not hasattr(rec, "execute")
        assert not hasattr(rec, "shell")
        assert not hasattr(rec, "run")
        assert not hasattr(rec, "system")

    def test_reflection_is_readonly(self):
        from aion.orchestrator.reflection_engine import ExecutionReflection
        ref = ExecutionReflection()
        assert not hasattr(ref, "write")
        assert not hasattr(ref, "delete")
        assert not hasattr(ref, "exec")

    def test_strategy_evaluator_no_side_effects(self):
        from aion.orchestrator.strategy_evaluator import StrategyEvaluator
        evaluator = StrategyEvaluator()
        assert callable(evaluator.get_all_strategies)
        result = evaluator.get_all_strategies()
        assert isinstance(result, dict)
