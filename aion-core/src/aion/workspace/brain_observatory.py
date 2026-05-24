import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.workspace.brain_observatory")


class BrainMetrics(BaseModel):
    memory_count: int = 0
    knowledge_count: int = 0
    execution_count: int = 0
    reflection_count: int = 0
    study_sessions: int = 0
    execution_success_rate: float = 0.0
    average_duration: float = 0.0
    cache_hit_rate: float = 0.0
    active_jobs: int = 0
    memory_growth_7d: int = 0
    vector_count: int = 0


class BrainObservatory:
    async def get_stats(self, app_id: str) -> BrainMetrics:
        from aion.memory.sqlite_store import get_memories, search_knowledge

        memories = await get_memories(app_id, limit=10000)
        knowledge = await search_knowledge(app_id, "")

        memory_count = len(memories)
        knowledge_count = len(knowledge)

        execution_records = [k for k in knowledge if "execution_memory" in (k.get("tags") or [])]
        reflections = [k for k in knowledge if "reflection" in (k.get("tags") or []) and "orchestrator" in (k.get("source_mode") or "")]
        study_entries = [k for k in knowledge if k.get("source_mode") == "study"]
        executions = len(execution_records)
        reflections_count = len(reflections)
        study_count = len(study_entries)

        recent_7d = sum(1 for m in memories if self._is_recent_7d(m.get("created_at", "")))

        vector_count = 0
        try:
            from aion.memory.vector_store import count_vectors
            vector_count = await count_vectors(app_id)
        except Exception:
            pass

        success_rate = 0.0
        avg_duration = 0.0
        if execution_records:
            import json
            successes = 0
            durations = []
            for er in execution_records[:200]:
                try:
                    raw = er.get("content", "{}")
                    data = json.loads(raw) if isinstance(raw, str) else raw
                    if data.get("success"):
                        successes += 1
                    d = data.get("duration_seconds", 0)
                    if d > 0:
                        durations.append(d)
                except Exception:
                    pass
            total = len(execution_records[:200])
            success_rate = successes / total if total > 0 else 0.0
            avg_duration = sum(durations) / len(durations) if durations else 0.0

        return BrainMetrics(
            memory_count=memory_count,
            knowledge_count=knowledge_count,
            execution_count=executions,
            reflection_count=reflections_count,
            study_sessions=study_count,
            execution_success_rate=round(success_rate, 2),
            average_duration=round(avg_duration, 2),
            cache_hit_rate=0.0,
            active_jobs=0,
            memory_growth_7d=recent_7d,
            vector_count=vector_count,
        )

    def _is_recent_7d(self, created_at: str) -> bool:
        try:
            import datetime
            dt = datetime.datetime.fromisoformat(created_at)
            return (datetime.datetime.utcnow() - dt).days < 7
        except Exception:
            return False

    async def get_health(self, app_id: str) -> Dict[str, Any]:
        from aion.memory.sqlite_store import is_tenant_provisioned
        provisioned = await is_tenant_provisioned(app_id)

        stats = await self.get_stats(app_id)

        issues: List[str] = []
        if not provisioned:
            issues.append("Tenant não provisionado")
        if stats.execution_count > 0 and stats.execution_success_rate < 0.3:
            issues.append("Taxa de sucesso crítica")
        if stats.vector_count == 0:
            issues.append("Sem vetores carregados")

        return {
            "tenant_id": app_id,
            "provisioned": provisioned,
            "status": "degraded" if issues else "healthy",
            "issues": issues,
            "memory_count": stats.memory_count,
            "knowledge_count": stats.knowledge_count,
            "vector_count": stats.vector_count,
        }

    async def get_providers(self, app_id: str) -> List[Dict[str, Any]]:
        from aion.memory.sqlite_store import search_knowledge
        knowledge = await search_knowledge(app_id, "", limit=500)

        import json
        provider_stats: Dict[str, Dict[str, Any]] = {}
        for k in knowledge:
            if k.get("niche") != "execution_memory":
                continue
            try:
                raw = k.get("content", "{}")
                data = json.loads(raw) if isinstance(raw, str) else raw
                for p in data.get("providers_used", []):
                    if p not in provider_stats:
                        provider_stats[p] = {"total": 0, "success": 0, "avg_duration": 0.0, "durations": []}
                    entry = provider_stats[p]
                    entry["total"] += 1
                    if data.get("success"):
                        entry["success"] += 1
                    d = data.get("duration_seconds", 0)
                    if d > 0:
                        entry["durations"].append(d)
            except Exception:
                pass

        result = []
        for provider, stats in provider_stats.items():
            avg_d = sum(stats["durations"]) / len(stats["durations"]) if stats["durations"] else 0.0
            result.append({
                "provider": provider,
                "total_calls": stats["total"],
                "success_rate": round(stats["success"] / stats["total"], 2) if stats["total"] > 0 else 0.0,
                "average_duration": round(avg_d, 2),
            })
        return sorted(result, key=lambda x: -x["total_calls"])


_brain_observatory_instance: Optional[BrainObservatory] = None


def get_brain_observatory() -> BrainObservatory:
    global _brain_observatory_instance
    if _brain_observatory_instance is None:
        _brain_observatory_instance = BrainObservatory()
    return _brain_observatory_instance
