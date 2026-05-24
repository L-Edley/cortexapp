import json
import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.orchestrator.execution_memory")


class ExecutionRecord(BaseModel):
    id: str = ""
    goal: str = ""
    goal_type: str = ""
    modes_used: List[str] = Field(default_factory=list)
    providers_used: List[str] = Field(default_factory=list)
    success: bool = False
    duration_seconds: float = 0.0
    errors: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    error_count: int = Field(default=0)
    improvement_count: int = Field(default=0)
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class ExecutionMemoryStore:
    def __init__(self):
        self._records: Dict[str, ExecutionRecord] = {}

    async def save(self, app_id: str, record: ExecutionRecord) -> str:
        if not record.id:
            record.id = str(uuid.uuid4())
        record.error_count = len(record.errors)
        record.improvement_count = len(record.improvements)
        record.created_at = record.created_at or datetime.datetime.utcnow().isoformat()

        content = record.model_dump_json()
        tags = ["execution_memory", record.goal_type, "ok" if record.success else "fail"]

        from aion.memory.sqlite_store import save_knowledge
        k_id = await save_knowledge(
            app_id=app_id,
            content=content,
            tags=tags,
            confidence=record.confidence_score,
            domain="aion_orchestration",
            niche="execution_memory",
            topic=record.goal_type,
            scope="orchestrator",
            source_mode="orchestrator",
        )

        try:
            from aion.obsidian.writer import write_knowledge
            await write_knowledge(app_id, content, tags, record.confidence_score)
        except Exception:
            pass

        self._records[record.id] = record
        return k_id

    async def list_recent(self, app_id: str, limit: int = 50) -> List[ExecutionRecord]:
        from aion.memory.sqlite_store import search_knowledge
        results = await search_knowledge(app_id, "", niche="execution_memory")
        records: List[ExecutionRecord] = []
        for r in results[:limit]:
            try:
                raw = r.get("content", "{}")
                data = json.loads(raw) if isinstance(raw, str) else raw
                records.append(ExecutionRecord(**data))
            except Exception as e:
                logger.debug("Skipping malformed record: %s", e)
        return records

    async def get_success_rate(self, app_id: str, goal_type: Optional[str] = None) -> float:
        records = await self.list_recent(app_id, limit=200)
        if not records:
            return 0.0
        if goal_type:
            records = [r for r in records if r.goal_type == goal_type]
        if not records:
            return 0.0
        return sum(1 for r in records if r.success) / len(records)

    async def get_dashboard(self, app_id: str) -> Dict[str, Any]:
        records = await self.list_recent(app_id, limit=500)
        total = len(records)
        if total == 0:
            return {
                "total_executions": 0,
                "success_rate": 0.0,
                "average_duration": 0.0,
                "total_failures": 0,
                "mode_stats": {},
                "provider_stats": {},
                "top_strategies": [],
            }

        successes = sum(1 for r in records if r.success)
        durations = [r.duration_seconds for r in records if r.duration_seconds > 0]
        avg_duration = sum(durations) / len(durations) if durations else 0.0

        mode_stats: Dict[str, int] = {}
        provider_stats: Dict[str, int] = {}
        for r in records:
            for m in r.modes_used:
                mode_stats[m] = mode_stats.get(m, 0) + 1
            for p in r.providers_used:
                provider_stats[p] = provider_stats.get(p, 0) + 1

        type_stats: Dict[str, List[bool]] = {}
        for r in records:
            if r.goal_type not in type_stats:
                type_stats[r.goal_type] = []
            type_stats[r.goal_type].append(r.success)
        top_strategies = sorted(
            [(gt, sum(1 for s in ss if s) / len(ss), len(ss)) for gt, ss in type_stats.items()],
            key=lambda x: (-x[1], -x[2])
        )[:5]

        return {
            "total_executions": total,
            "success_rate": successes / total if total > 0 else 0.0,
            "average_duration": round(avg_duration, 2),
            "total_failures": total - successes,
            "mode_stats": dict(sorted(mode_stats.items(), key=lambda x: -x[1])),
            "provider_stats": dict(sorted(provider_stats.items(), key=lambda x: -x[1])),
            "top_strategies": [
                {"goal_type": gt, "success_rate": round(sr, 2), "count": c}
                for gt, sr, c in top_strategies
            ],
        }


_execution_memory_instance: Optional[ExecutionMemoryStore] = None


def get_execution_memory() -> ExecutionMemoryStore:
    global _execution_memory_instance
    if _execution_memory_instance is None:
        _execution_memory_instance = ExecutionMemoryStore()
    return _execution_memory_instance
