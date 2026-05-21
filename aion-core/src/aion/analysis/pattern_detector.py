import os
import json
import asyncio
import logging
import datetime
import collections
from typing import List, Optional, Dict, Tuple
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.analysis.pattern")

from aion.config import settings

DETECTION_TABLE = "detected_patterns"
_pattern_cache: Dict[str, List["DetectedPattern"]] = {}
_scheduled_detections: Dict[str, bool] = {}


class DetectedPattern(BaseModel):
    id: str = Field(default="")
    app_id: str = Field(default="")
    type: str = Field(default="")
    description: str = Field(default="")
    confidence: float = Field(default=0.0)
    data: Dict = Field(default_factory=dict)
    recommendation: str = Field(default="")
    detected_at: str = Field(default="")


async def _ensure_table(app_id: str) -> None:
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            f"CREATE TABLE IF NOT EXISTS {DETECTION_TABLE} ("
            "id TEXT PRIMARY KEY, app_id TEXT NOT NULL, "
            "type TEXT NOT NULL, description TEXT, "
            "confidence REAL NOT NULL, data TEXT, "
            "recommendation TEXT, detected_at TEXT NOT NULL)"
        )
        await conn.commit()


async def _save_patterns(app_id: str, patterns: List[DetectedPattern]) -> None:
    await _ensure_table(app_id)
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        for p in patterns:
            await conn.execute(
                f"INSERT OR REPLACE INTO {DETECTION_TABLE} "
                "(id, app_id, type, description, confidence, data, recommendation, detected_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    p.id, p.app_id, p.type, p.description,
                    p.confidence, json.dumps(p.data),
                    p.recommendation, p.detected_at,
                ),
            )
        await conn.commit()
    _pattern_cache[app_id] = patterns


def _generate_id(app_id: str, type_name: str) -> str:
    raw = f"{app_id}_{type_name}_{datetime.datetime.utcnow().isoformat()}"
    return str(hash(raw))


# ── Productivity patterns ──────────────────────────────────────────

async def _detect_many_open_fronts(app_id: str) -> Optional[DetectedPattern]:
    """More than 3 distinct project areas active in knowledge."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT tags FROM knowledge WHERE app_id = ? AND created_at >= ?",
                (app_id, (datetime.datetime.utcnow() - datetime.timedelta(days=30)).isoformat()),
            )
            rows = await c.fetchall()
        areas = set()
        for r in rows:
            try:
                tags = json.loads(r["tags"])
                for t in tags:
                    if t not in ("preflight", "reteaching", "research"):
                        areas.add(t)
            except Exception:
                pass
        if len(areas) > 3:
            return DetectedPattern(
                id=_generate_id(app_id, "many_fronts"),
                app_id=app_id,
                type="many_open_fronts",
                description=f"{len(areas)} áreas ativas simultaneamente: {', '.join(sorted(areas))}.",
                confidence=min(0.9, 0.5 + 0.1 * (len(areas) - 3)),
                data={"active_areas": sorted(areas), "count": len(areas)},
                recommendation="Consolidar frentes ou delegar para manter foco.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect many fronts for '%s': %s", app_id, e)
    return None


async def _detect_create_vs_complete_gap(app_id: str) -> Optional[DetectedPattern]:
    """High creation rate vs low completion in actions_log."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        since = (datetime.datetime.utcnow() - datetime.timedelta(days=14)).isoformat()
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT status FROM actions_log WHERE app_id = ? AND created_at >= ?",
                (app_id, since),
            )
            rows = await c.fetchall()
        total = len(rows)
        if total < 5:
            return None
        completed = sum(1 for r in rows if r["status"] == "completed")
        ratio = completed / total if total else 1
        if ratio < 0.4:
            return DetectedPattern(
                id=_generate_id(app_id, "create_complete_gap"),
                app_id=app_id,
                type="create_vs_complete_gap",
                description=f"Apenas {completed} de {total} ações concluídas ({(100*ratio):.0f}%) nos últimos 14 dias.",
                confidence=0.7 + 0.2 * (1 - ratio),
                data={"total": total, "completed": completed, "ratio": round(ratio, 2)},
                recommendation="Revisar tarefas paradas; reduzir novas aberturas até concluir pendentes.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect create/complete gap for '%s': %s", app_id, e)
    return None


async def _detect_stale_projects(app_id: str) -> Optional[DetectedPattern]:
    """Knowledge entries with no recent activity."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        seven_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content, tags, created_at FROM knowledge "
                "WHERE app_id = ? AND created_at < ? AND tags NOT LIKE '%preflight%' "
                "ORDER BY created_at ASC LIMIT 10",
                (app_id, seven_days_ago),
            )
            rows = await c.fetchall()
        if len(rows) >= 3:
            oldest = min(r["created_at"] for r in rows) if rows else ""
            return DetectedPattern(
                id=_generate_id(app_id, "stale_projects"),
                app_id=app_id,
                type="stale_projects",
                description=f"{len(rows)} conhecimentos sem atividade há 7+ dias (desde {oldest[:10]}).",
                confidence=0.75,
                data={"stale_count": len(rows), "oldest": oldest},
                recommendation="Revisar conhecimentos antigos; arquivar ou atualizar.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect stale projects for '%s': %s", app_id, e)
    return None


async def _detect_inactivity_peak(app_id: str) -> Optional[DetectedPattern]:
    """Hours with no activity over the last 7 days."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        since = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT created_at FROM actions_log WHERE app_id = ? AND created_at >= ?",
                (app_id, since),
            )
            rows = await c.fetchall()
        if len(rows) < 20:
            return None
        hour_counts: Dict[int, int] = collections.Counter()
        for r in rows:
            try:
                dt = datetime.datetime.fromisoformat(r["created_at"])
                hour_counts[dt.hour] += 1
            except Exception:
                pass
        if not hour_counts:
            return None
        total_hours = sum(hour_counts.values())
        low_hours = [h for h in range(24) if hour_counts.get(h, 0) < total_hours / 48]
        if len(low_hours) >= 6:
            blocks = _group_hours(low_hours)
            return DetectedPattern(
                id=_generate_id(app_id, "inactivity_peak"),
                app_id=app_id,
                type="inactivity_peak",
                description=f"Baixa atividade nos horários: {blocks}.",
                confidence=0.6,
                data={"low_activity_hours": low_hours, "hourly_counts": dict(hour_counts)},
                recommendation="Avaliar se há bloqueio ou distração nesses períodos.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect inactivity peak for '%s': %s", app_id, e)
    return None


def _group_hours(hours: List[int]) -> str:
    if not hours:
        return ""
    sorted_hours = sorted(hours)
    ranges = []
    start = end = sorted_hours[0]
    for h in sorted_hours[1:]:
        if h == end + 1:
            end = h
        else:
            ranges.append(f"{start:02d}h" if start == end else f"{start:02d}h-{end:02d}h")
            start = end = h
    ranges.append(f"{start:02d}h" if start == end else f"{start:02d}h-{end:02d}h")
    return ", ".join(ranges)


# ── Learning patterns ─────────────────────────────────────────────

async def _detect_researched_not_executed(app_id: str) -> Optional[DetectedPattern]:
    """Topics researched (knowledge) but no execution (actions_log)."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        since = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content, tags FROM knowledge WHERE app_id = ? AND created_at >= ? AND tags NOT LIKE '%preflight%'",
                (app_id, since),
            )
            k_rows = await c.fetchall()

            c = await conn.execute(
                "SELECT input, output FROM actions_log WHERE app_id = ? AND created_at >= ? LIMIT 50",
                (app_id, since),
            )
            a_rows = await c.fetchall()
        if not k_rows or not a_rows:
            return None
        action_text = " ".join(f"{r['input']} {r['output']}" for r in a_rows).lower()
        unmatched = []
        for r in k_rows:
            content_lower = r["content"].lower()
            keywords = [w for w in content_lower.split() if len(w) > 5]
            if keywords and not any(kw in action_text for kw in keywords):
                unmatched.append(r["content"][:80])
        if len(unmatched) >= 3:
            return DetectedPattern(
                id=_generate_id(app_id, "researched_not_executed"),
                app_id=app_id,
                type="researched_not_executed",
                description=f"{len(unmatched)} tópicos pesquisados mas sem ação associada.",
                confidence=0.7,
                data={"unmatched_topics": unmatched[:5], "count": len(unmatched)},
                recommendation="Revisar tópicos não executados; decidir se merecem ação ou arquivo.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect researched not executed for '%s': %s", app_id, e)
    return None


async def _detect_unused_knowledge(app_id: str) -> Optional[DetectedPattern]:
    """Low-confidence or old knowledge that may never be used in RAG."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content, confidence, created_at FROM knowledge "
                "WHERE app_id = ? AND confidence < 0.5 AND tags NOT LIKE '%preflight%' LIMIT 10",
                (app_id,),
            )
            rows = await c.fetchall()
        if len(rows) >= 3:
            return DetectedPattern(
                id=_generate_id(app_id, "unused_knowledge"),
                app_id=app_id,
                type="unused_knowledge",
                description=f"{len(rows)} conhecimentos com baixa confiança (<0.5) que podem nunca ser utilizados.",
                confidence=0.65,
                data={"low_confidence_count": len(rows)},
                recommendation="Revisar e reforçar conhecimentos de baixa confiança ou arquivar.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect unused knowledge for '%s': %s", app_id, e)
    return None


async def _detect_repeated_questions(app_id: str) -> Optional[DetectedPattern]:
    """Similar questions asked multiple times (memories with same type)."""
    from aion.memory import sqlite_store
    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return None
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content, type, created_at FROM memories WHERE app_id = ? ORDER BY created_at DESC LIMIT 30",
                (app_id,),
            )
            rows = await c.fetchall()
        if len(rows) < 4:
            return None
        groups: Dict[str, List[str]] = {}
        for r in rows:
            t = r["type"] or "unknown"
            if t not in groups:
                groups[t] = []
            groups[t].append(r["content"][:60])
        repeated = {t: items for t, items in groups.items() if len(items) >= 3}
        if repeated:
            lines = [f"{t} ({len(items)}x)" for t, items in repeated.items()]
            return DetectedPattern(
                id=_generate_id(app_id, "repeated_questions"),
                app_id=app_id,
                type="repeated_questions",
                description=f"Perguntas similares repetidas: {', '.join(lines)}.",
                confidence=0.8,
                data={"repeated_types": {t: len(items) for t, items in repeated.items()}},
                recommendation="Criar conhecimento permanente para os tópicos recorrentes.",
                detected_at=datetime.datetime.utcnow().isoformat(),
            )
    except Exception as e:
        logger.warning("Failed to detect repeated questions for '%s': %s", app_id, e)
    return None


# ── Public API ────────────────────────────────────────────────────

async def detect_all_patterns(app_id: str) -> List[DetectedPattern]:
    patterns: List[DetectedPattern] = []

    detectors = [
        _detect_many_open_fronts,
        _detect_create_vs_complete_gap,
        _detect_stale_projects,
        _detect_inactivity_peak,
        _detect_researched_not_executed,
        _detect_unused_knowledge,
        _detect_repeated_questions,
    ]

    for detector in detectors:
        try:
            result = await detector(app_id)
            if result is not None:
                patterns.append(result)
        except Exception as e:
            logger.warning("Pattern detector %s failed for '%s': %s", detector.__name__, app_id, e)

    if patterns:
        await _save_patterns(app_id, patterns)

    return patterns


async def get_insights_for_briefing(app_id: str) -> List[str]:
    patterns = await detect_all_patterns(app_id)
    if not patterns:
        return []

    patterns.sort(key=lambda p: p.confidence, reverse=True)
    insights = []
    for p in patterns[:3]:
        insights.append(f"[{p.type}] {p.description} — {p.recommendation}")
    return insights


async def schedule_detection(app_id: str) -> None:
    if app_id in _scheduled_detections and _scheduled_detections[app_id]:
        return
    _scheduled_detections[app_id] = True

    async def _loop():
        interval = 86400  # 24h
        while _scheduled_detections.get(app_id, False):
            try:
                await detect_all_patterns(app_id)
            except Exception as e:
                logger.warning("Scheduled detection failed for '%s': %s", app_id, e)
            await asyncio.sleep(interval)

    asyncio.create_task(_loop())
    logger.info("Pattern detection scheduled for '%s' (every 24h)", app_id)


async def stop_detection(app_id: str) -> None:
    _scheduled_detections[app_id] = False
