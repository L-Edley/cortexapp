import time
import logging
from typing import List, Dict, Any, Optional

from aion.orchestrator.execution_memory import (
    ExecutionRecord, ExecutionMemoryStore, get_execution_memory,
)
from aion.orchestrator.reflection_engine import (
    ExecutionReflection, OrchestratorReflectionEngine,
)
from aion.orchestrator.strategy_evaluator import (
    StrategyEntry, StrategyEvaluator,
)
from aion.orchestrator.adaptive_router import (
    AdaptiveRouter, AdaptiveRoutingResult,
)
from aion.cognitive.goal_models import GoalAnalysis

logger = logging.getLogger("aion.orchestrator.learning_system")


class OrchestratorLearningSystem:
    def __init__(
        self,
        memory_store: Optional[ExecutionMemoryStore] = None,
        reflection_engine: Optional[OrchestratorReflectionEngine] = None,
        strategy_evaluator: Optional[StrategyEvaluator] = None,
        adaptive_router: Optional[AdaptiveRouter] = None,
    ):
        self.memory = memory_store or get_execution_memory()
        self.reflection = reflection_engine or OrchestratorReflectionEngine()
        self.evaluator = strategy_evaluator or StrategyEvaluator()
        self.router = adaptive_router or AdaptiveRouter(self.evaluator)

    async def record_execution(
        self,
        app_id: str,
        goal: str,
        goal_type: str,
        modes_used: List[str],
        providers_used: List[str],
        success: bool,
        duration_seconds: float,
        errors: Optional[List[str]] = None,
        improvements: Optional[List[str]] = None,
        confidence_score: float = 0.0,
    ) -> ExecutionRecord:
        record = ExecutionRecord(
            goal=goal[:500],
            goal_type=goal_type,
            modes_used=modes_used,
            providers_used=providers_used,
            success=success,
            duration_seconds=duration_seconds,
            errors=errors or [],
            improvements=improvements or [],
            confidence_score=confidence_score,
        )
        await self.memory.save(app_id, record)
        return record

    async def reflect_on_execution(self, app_id: str, record: ExecutionRecord) -> ExecutionReflection:
        reflection = await self.reflection.reflect_and_persist(app_id, record)
        return reflection

    async def sync_strategies(self, app_id: str) -> None:
        records = await self.memory.list_recent(app_id, limit=500)
        await self.evaluator.update_from_records(records)

    async def get_routing_recommendation(
        self,
        goal_type: str,
        candidate_modes: List[str],
        app_id: str = "",
    ) -> AdaptiveRoutingResult:
        return await self.router.get_adjusted_scores(goal_type, candidate_modes, app_id)

    async def get_dashboard_data(self, app_id: str) -> Dict[str, Any]:
        dashboard = await self.memory.get_dashboard(app_id)
        await self.sync_strategies(app_id)
        strategies = self.evaluator.get_all_strategies()
        dashboard["strategies"] = {
            gt: entry.model_dump() for gt, entry in strategies.items()
        }
        dashboard["strategy_confidence"] = (
            max(e.success_rate * min(e.total_executions / 10, 1.0) for e in strategies.values())
            if strategies else 0.0
        )
        return dashboard

    async def process_failure_feedback(
        self,
        app_id: str,
        record: ExecutionRecord,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        ctx = context or {}
        reflection = await self.reflect_on_execution(app_id, record)
        lesson = (
            f"[Lesson Learned] Goal: {record.goal[:100]}\n"
            f"Erro: {reflection.weakness or 'N/A'}\n"
            f"Melhoria: {reflection.improvement or 'N/A'}\n"
            f"Modos: {', '.join(record.modes_used)}\n"
            f"Providers: {', '.join(record.providers_used)}\n"
            f"Contexto: {json.dumps(ctx.get('additional_context', {}), ensure_ascii=False)[:300]}"
        )
        try:
            from aion.memory.sqlite_store import save_knowledge
            tags = ["lesson_learned", "feedback", record.goal_type]
            await save_knowledge(
                app_id=app_id,
                content=lesson,
                tags=tags,
                confidence=max(0.3, record.confidence_score),
                domain="aion_orchestration",
                niche="execution_memory",
                topic=record.goal_type,
                scope="orchestrator",
                source_mode="feedback_loop",
            )
            try:
                from aion.obsidian.writer import write_knowledge
                await write_knowledge(app_id, lesson, tags, max(0.3, record.confidence_score))
            except Exception:
                pass
        except Exception as e:
            logger.debug("Failed to persist lesson: %s", e)

        return {
            "reflection": reflection.model_dump(),
            "lesson_id": record.id,
            "status": "recorded",
        }


import json

_learning_system: Optional[OrchestratorLearningSystem] = None


def get_learning_system() -> OrchestratorLearningSystem:
    global _learning_system
    if _learning_system is None:
        _learning_system = OrchestratorLearningSystem()
    return _learning_system
