import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from aion.orchestrator.execution_memory import ExecutionRecord

logger = logging.getLogger("aion.orchestrator.strategy_evaluator")


class StrategyEntry(BaseModel):
    goal_type: str = ""
    best_modes: List[str] = Field(default_factory=list)
    best_provider: str = ""
    success_rate: float = 0.0
    total_executions: int = 0
    average_duration: float = 0.0


class StrategyEvaluator:
    def __init__(self):
        self._strategies: Dict[str, StrategyEntry] = {}

    async def update_from_records(self, records: List[ExecutionRecord]) -> None:
        type_records: Dict[str, List[ExecutionRecord]] = {}
        for r in records:
            if r.goal_type not in type_records:
                type_records[r.goal_type] = []
            type_records[r.goal_type].append(r)

        for goal_type, recs in type_records.items():
            total = len(recs)
            successes = sum(1 for r in recs if r.success)
            durations = [r.duration_seconds for r in recs if r.duration_seconds > 0]
            avg_dur = sum(durations) / len(durations) if durations else 0.0

            mode_stats: Dict[str, List[bool]] = {}
            provider_stats: Dict[str, List[bool]] = {}
            for r in recs:
                for m in r.modes_used:
                    mode_stats.setdefault(m, []).append(r.success)
                for p in r.providers_used:
                    provider_stats.setdefault(p, []).append(r.success)

            best_modes = sorted(
                [(m, sum(1 for s in ss if s) / len(ss), len(ss)) for m, ss in mode_stats.items()],
                key=lambda x: (-x[1], -x[2])
            )
            best_providers = sorted(
                [(p, sum(1 for s in ss if s) / len(ss), len(ss)) for p, ss in provider_stats.items()],
                key=lambda x: (-x[1], -x[2])
            )

            self._strategies[goal_type] = StrategyEntry(
                goal_type=goal_type,
                best_modes=[m for m, _, _ in best_modes[:3]],
                best_provider=best_providers[0][0] if best_providers else "",
                success_rate=successes / total if total > 0 else 0.0,
                total_executions=total,
                average_duration=round(avg_dur, 2),
            )

    def get_best_strategy(self, goal_type: str) -> Optional[StrategyEntry]:
        entry = self._strategies.get(goal_type)
        if entry and entry.total_executions > 0:
            return entry
        return None

    def get_all_strategies(self) -> Dict[str, StrategyEntry]:
        return dict(self._strategies)

    def get_most_used_modes(self, top_n: int = 5) -> List[Dict[str, Any]]:
        mode_count: Dict[str, int] = {}
        for entry in self._strategies.values():
            for m in entry.best_modes:
                mode_count[m] = mode_count.get(m, 0) + 1
        result = [{"mode": m, "strategies": c} for m, c in sorted(mode_count.items(), key=lambda x: -x[1])]
        return result[:top_n]

    def get_confidence_score(self, goal_type: str) -> float:
        entry = self._strategies.get(goal_type)
        if not entry or entry.total_executions < 3:
            return 0.0
        return round(entry.success_rate * min(entry.total_executions / 10, 1.0), 2)
