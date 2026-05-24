import uuid
import json
import datetime
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from aion.cognitive.goal_models import (
    GoalAnalysis,
    GoalPlan,
    DecomposedTask,
    ExecutionStep,
    RecommendedCapability,
    Reflection,
    LearnedStrategy,
    TaskStatus,
    CapabilityMode,
    ComplexityLevel,
)
from aion.cognitive.execution_plan import GoalAnalyzer, TaskDecomposer, CapabilityRouter, ExecutionPlanner
from aion.cognitive.reflection_engine import ReflectionEngine

logger = logging.getLogger("aion.cognitive.orchestrator")


@dataclass
class OrchestratorResult:
    activated: bool = False
    goal_analysis: Optional[GoalAnalysis] = None
    execution_plan: List[ExecutionStep] = field(default_factory=list)
    recommended_modes: List[RecommendedCapability] = field(default_factory=list)
    plan: Optional[GoalPlan] = None
    reflection: Optional[Reflection] = None
    summary: str = ""
    ui_reply_extra: Dict[str, Any] = field(default_factory=dict)


class CognitiveOrchestrator:
    def __init__(self):
        self.analyzer = GoalAnalyzer()
        self.decomposer = TaskDecomposer()
        self.router = CapabilityRouter()
        self.planner = ExecutionPlanner()
        self.reflection_engine = ReflectionEngine()
        self._active_plans: Dict[str, GoalPlan] = {}

    async def should_activate(self, input: str, intent: str, confidence: float) -> bool:
        text = input.lower()
        goal_keywords = [
            "quero", "preciso", "vou", "vamos", "gostaria", "planejo",
            "monetizar", "lançar", "criar", "desenvolver", "construir",
            "estratégia", "plano", "projeto", "campanha", "mvp",
            "automatizar", "organizar", "refatorar", "migrar",
        ]
        has_goal_keyword = any(kw in text for kw in goal_keywords)
        word_count = len(text.split())
        is_complex = word_count > 5
        is_planning_intent = intent in ("planning", "strategy", "project", "goal", "analysis")
        low_confidence = confidence < 0.5

        if has_goal_keyword and word_count >= 3:
            return True
        if is_planning_intent:
            return True
        if low_confidence and is_complex:
            return True
        return False

    async def process(
        self,
        app_id: str,
        user_id: str,
        input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> OrchestratorResult:
        ctx = context or {}
        intent = ctx.get("intent", "unknown")
        confidence = ctx.get("confidence", 0.0)

        active = await self.should_activate(input, intent, confidence)
        if not active:
            return OrchestratorResult(activated=False)

        analysis = self.analyzer.analyze(app_id, input)
        tasks = self.decomposer.decompose(analysis, input)
        recommendations = self.router.route(analysis, tasks)
        steps = self.planner.plan(analysis, tasks, recommendations)

        plan = GoalPlan(
            goal_id=str(uuid.uuid4()),
            app_id=app_id,
            user_id=user_id,
            raw_input=input,
            analysis=analysis,
            tasks=tasks,
            execution_plan=steps,
            recommended_capabilities=recommendations,
            total_steps=len(steps),
        )

        self._active_plans[plan.goal_id] = plan

        await self._persist_plan(app_id, plan)

        try:
            from aion.workspace.event_bus import get_event_bus
            get_event_bus().emit("plan_created", {
                "goal_id": plan.goal_id[:12],
                "goal": plan.raw_input[:80],
                "goal_type": plan.analysis.goal_type.value,
                "steps": plan.total_steps,
            })
        except Exception:
            pass

        extra = {
            "goal_analysis": analysis.model_dump(),
            "execution_plan": [s.model_dump() for s in steps],
            "recommended_modes": [r.model_dump() for r in recommendations],
        }

        summary_parts = []
        if analysis.complexity in (ComplexityLevel.high, ComplexityLevel.critical):
            summary_parts.append(f"Objetivo identificado como {analysis.complexity.value}.")
        summary_parts.append(f"Domínios: {', '.join(analysis.domains)}")
        summary_parts.append(f"Recomendo {len(steps)} passos para concluir.")

        return OrchestratorResult(
            activated=True,
            goal_analysis=analysis,
            execution_plan=steps,
            recommended_modes=recommendations,
            plan=plan,
            summary=" | ".join(summary_parts),
            ui_reply_extra=extra,
        )

    async def record_reflection(
        self,
        app_id: str,
        plan: GoalPlan,
        step: ExecutionStep,
        input_text: str,
        output_text: str,
        error: Optional[str] = None,
    ) -> Reflection:
        reflection = await self.reflection_engine.analyze_step(
            app_id, plan, step, input_text, output_text, error
        )
        await self._persist_reflection(app_id, reflection)
        return reflection

    async def update_step_status(
        self,
        goal_id: str,
        step_number: int,
        status: TaskStatus,
        result: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[GoalPlan]:
        plan = self._active_plans.get(goal_id)
        if not plan:
            return None

        for step in plan.execution_plan:
            if step.step_number == step_number:
                step.status = status
                step.result = result
                step.error = error
                break

        if status == TaskStatus.completed:
            plan.completed_steps += 1
        elif status == TaskStatus.failed:
            plan.failed_steps += 1

        plan.current_step = step_number
        plan.updated_at = datetime.datetime.utcnow().isoformat()

        if plan.completed_steps + plan.failed_steps >= plan.total_steps:
            plan.active = False
            plan.status = "completed" if plan.failed_steps == 0 else "completed_with_errors"

        await self._persist_plan(plan.app_id, plan)
        return plan

    def get_plan(self, goal_id: str) -> Optional[GoalPlan]:
        return self._active_plans.get(goal_id)

    def list_active_plans(self, app_id: Optional[str] = None) -> List[GoalPlan]:
        plans = [p for p in self._active_plans.values() if p.active]
        if app_id:
            plans = [p for p in plans if p.app_id == app_id]
        return sorted(plans, key=lambda p: p.created_at, reverse=True)

    async def _persist_plan(self, app_id: str, plan: GoalPlan) -> None:
        try:
            from aion.memory import sqlite_store
            content = (
                f"[Cognitive Plan] {plan.raw_input[:100]}\n\n"
                f"Tipo: {plan.analysis.goal_type.value}\n"
                f"Complexidade: {plan.analysis.complexity.value}\n"
                f"Domínios: {', '.join(plan.analysis.domains)}\n"
                f"Passos: {plan.total_steps}\n"
                f"Tarefas: {len(plan.tasks)}\n"
            )
            tags = ["cognitive", "plan", plan.analysis.goal_type.value, *plan.analysis.domains]
            await sqlite_store.save_knowledge(
                app_id=app_id,
                content=content,
                tags=tags,
                confidence=plan.analysis.confidence,
                domain="technology",
                niche="aion_architecture",
                source_mode="cognitive_orchestrator",
            )
        except Exception as e:
            logger.warning("Failed to persist plan: %s", e)

    async def _persist_reflection(self, app_id: str, reflection: Reflection) -> None:
        try:
            from aion.memory import sqlite_store
            content = (
                f"[Reflection] Goal: {reflection.goal_id[:12]} Step: {reflection.step_number}\n"
                f"Sucesso: {reflection.success}\n"
                f"Lição: {reflection.lesson_learned or 'N/A'}\n"
                f"Melhoria: {reflection.improvement_suggestion or 'N/A'}"
            )
            tags = ["cognitive", "reflection", "success" if reflection.success else "failure"]
            if reflection.error_type:
                tags.append(f"error_{reflection.error_type}")
            await sqlite_store.save_knowledge(
                app_id=app_id,
                content=content,
                tags=tags,
                confidence=0.8 if reflection.success else 0.5,
                domain="technology",
                niche="aion_architecture",
                source_mode="cognitive_orchestrator",
            )
        except Exception as e:
            logger.warning("Failed to persist reflection: %s", e)


_orchestrator_instance: Optional[CognitiveOrchestrator] = None


def get_orchestrator() -> CognitiveOrchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = CognitiveOrchestrator()
    return _orchestrator_instance
