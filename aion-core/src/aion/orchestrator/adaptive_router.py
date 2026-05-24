import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from pydantic import BaseModel, Field

from aion.orchestrator.execution_memory import ExecutionRecord
from aion.orchestrator.strategy_evaluator import StrategyEvaluator
from aion.cognitive.goal_models import CapabilityMode

logger = logging.getLogger("aion.orchestrator.adaptive_router")


class AdaptiveRoutingResult(BaseModel):
    mode_scores: Dict[str, float] = Field(default_factory=dict)
    provider_preference: str = ""
    strategy_confidence: float = 0.0
    is_adapted: bool = False
    reason: str = ""


class AdaptiveRouter:
    def __init__(self, strategy_evaluator: StrategyEvaluator):
        self._evaluator = strategy_evaluator

    async def get_adjusted_scores(
        self,
        goal_type: str,
        candidate_modes: List[str],
        app_id: str = "",
    ) -> AdaptiveRoutingResult:
        strategy = self._evaluator.get_best_strategy(goal_type)

        if not strategy or strategy.total_executions < 2:
            return AdaptiveRoutingResult(
                mode_scores={m: 1.0 for m in candidate_modes},
                strategy_confidence=0.0,
                is_adapted=False,
                reason="Histórico insuficiente para adaptação.",
            )

        mode_scores: Dict[str, float] = {}
        for mode in candidate_modes:
            if mode in strategy.best_modes:
                index = strategy.best_modes.index(mode)
                boost = max(1.0, 1.5 - index * 0.25)
                mode_scores[mode] = round(boost, 2)
            else:
                mode_scores[mode] = 0.8

        confidence = self._evaluator.get_confidence_score(goal_type)

        return AdaptiveRoutingResult(
            mode_scores=mode_scores,
            provider_preference=strategy.best_provider if strategy.best_provider else "",
            strategy_confidence=confidence,
            is_adapted=True,
            reason=f"Estratégia adaptada para '{goal_type}' com {strategy.total_executions} execuções históricas.",
        )

    def get_routing_summary(self, goal_type: str) -> str:
        strategy = self._evaluator.get_best_strategy(goal_type)
        if not strategy:
            return f"Nenhuma estratégia registrada para '{goal_type}'."
        modes = ", ".join(strategy.best_modes) if strategy.best_modes else "Nenhum"
        provider = strategy.best_provider or "Nenhum"
        return (
            f"Goal: {goal_type} | Taxa: {strategy.success_rate:.0%} "
            f"| Modos: [{modes}] | Provider: {provider} "
            f"| {strategy.total_executions} execuções"
        )
