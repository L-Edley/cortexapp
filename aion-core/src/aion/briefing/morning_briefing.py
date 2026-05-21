import os
import json
import asyncio
import logging
import datetime
from typing import List, Optional, Dict, Callable, Awaitable
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.briefing.morning")

from aion.config import settings

BRIEFING_TABLE = "morning_briefings"
_cache: Dict[str, "MorningBriefing"] = {}


class MorningBriefing(BaseModel):
    app_id: str = Field(default="")
    date: str = Field(default="")
    summary: str = Field(default="")
    priorities: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    opportunities: List[str] = Field(default_factory=list)
    strategic_note: str = Field(default="")
    sources_used: List[str] = Field(default_factory=list)
    generated_at: str = Field(default="")
    shown_at: Optional[str] = None


async def _ensure_table(app_id: str) -> None:
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            f"CREATE TABLE IF NOT EXISTS {BRIEFING_TABLE} ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "app_id TEXT NOT NULL, date TEXT NOT NULL, "
            "summary TEXT, priorities TEXT, risks TEXT, "
            "opportunities TEXT, strategic_note TEXT, "
            "sources_used TEXT, generated_at TEXT NOT NULL, "
            "shown_at TEXT)"
        )
        await conn.commit()


async def _save_briefing(app_id: str, briefing: MorningBriefing) -> None:
    await _ensure_table(app_id)
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            f"INSERT INTO {BRIEFING_TABLE} "
            "(app_id, date, summary, priorities, risks, opportunities, "
            "strategic_note, sources_used, generated_at, shown_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                briefing.app_id, briefing.date,
                briefing.summary,
                json.dumps(briefing.priorities),
                json.dumps(briefing.risks),
                json.dumps(briefing.opportunities),
                briefing.strategic_note,
                json.dumps(briefing.sources_used),
                briefing.generated_at,
                briefing.shown_at,
            ),
        )
        await conn.commit()
    _cache[app_id] = briefing


async def _get_activity_summary(app_id: str) -> str:
    from aion.memory import sqlite_store
    yesterday = (datetime.datetime.utcnow() - datetime.timedelta(hours=24)).isoformat()
    parts = []

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT COUNT(*) FROM actions_log WHERE app_id = ? AND created_at >= ?",
                (app_id, yesterday),
            )
            count = (await c.fetchone())[0]
            if count:
                parts.append(f"{count} ações registradas")

            c = await conn.execute(
                "SELECT input, output FROM actions_log WHERE app_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 10",
                (app_id, yesterday),
            )
            rows = await c.fetchall()
            for r in rows:
                parts.append(f"Entrada: {r[0][:100]} | Saída: {r[1][:100]}")

            c = await conn.execute(
                "SELECT COUNT(*) FROM knowledge WHERE app_id = ? AND created_at >= ?",
                (app_id, yesterday),
            )
            k_count = (await c.fetchone())[0]
            if k_count:
                parts.append(f"{k_count} novos conhecimentos salvos")

            c = await conn.execute(
                "SELECT COUNT(*) FROM decisions WHERE app_id = ? AND created_at >= ?",
                (app_id, yesterday),
            )
            d_count = (await c.fetchone())[0]
            if d_count:
                parts.append(f"{d_count} decisões registradas")
    except Exception as e:
        logger.warning("Failed to get activity for '%s': %s", app_id, e)

    return "\n".join(parts) if parts else "Nenhuma atividade recente."


async def _get_pending_risks(app_id: str) -> str:
    from aion.memory import sqlite_store
    risks = []

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content FROM knowledge WHERE app_id = ? AND tags LIKE '%critical%' OR tags LIKE '%urgent%' LIMIT 5",
                (app_id,),
            )
            rows = await c.fetchall()
            for r in rows:
                risks.append(r[0][:150])

            thirty_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).isoformat()
            c = await conn.execute(
                "SELECT content FROM knowledge WHERE app_id = ? AND created_at < ? AND tags NOT LIKE '%preflight%' LIMIT 5",
                (app_id, thirty_days_ago),
            )
            rows = await c.fetchall()
            for r in rows:
                risks.append(f"Conhecimento antigo sem revisão: {r[0][:100]}")
    except Exception as e:
        logger.warning("Failed to get risks for '%s': %s", app_id, e)

    return "\n".join(risks) if risks else "Nenhum risco detectado."


async def _call_llm(
    llm: Callable[[list], Awaitable[str]],
    prompt: str,
    timeout: float = 25.0,
) -> str:
    try:
        return await asyncio.wait_for(
            llm([{"role": "user", "content": prompt}]),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("Briefing LLM call timed out")
        return ""
    except Exception as e:
        logger.warning("Briefing LLM call failed: %s", e)
        return ""


async def get_today_briefing(app_id: str) -> Optional[MorningBriefing]:
    if app_id in _cache:
        return _cache[app_id]
    await _ensure_table(app_id)
    today = datetime.date.today().isoformat()
    from aion.memory import sqlite_store
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                f"SELECT * FROM {BRIEFING_TABLE} WHERE app_id = ? AND date = ? ORDER BY id DESC LIMIT 1",
                (app_id, today),
            )
            row = await c.fetchone()
            if not row:
                return None
            briefing = MorningBriefing(
                app_id=row["app_id"],
                date=row["date"],
                summary=row["summary"],
                priorities=json.loads(row["priorities"] or "[]"),
                risks=json.loads(row["risks"] or "[]"),
                opportunities=json.loads(row["opportunities"] or "[]"),
                strategic_note=row["strategic_note"],
                sources_used=json.loads(row["sources_used"] or "[]"),
                generated_at=row["generated_at"],
                shown_at=row["shown_at"],
            )
            _cache[app_id] = briefing
            return briefing
    except Exception:
        return None


async def should_generate_briefing(app_id: str) -> bool:
    existing = await get_today_briefing(app_id)
    return existing is None


async def mark_briefing_shown(app_id: str) -> None:
    await _ensure_table(app_id)
    now = datetime.datetime.utcnow().isoformat()
    today = datetime.date.today().isoformat()
    from aion.memory import sqlite_store
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                f"UPDATE {BRIEFING_TABLE} SET shown_at = ? WHERE app_id = ? AND date = ?",
                (now, app_id, today),
            )
            await conn.commit()
        if app_id in _cache:
            _cache[app_id].shown_at = now
    except Exception as e:
        logger.warning("Failed to mark briefing shown for '%s': %s", app_id, e)


async def generate_briefing(
    app_id: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> MorningBriefing:
    from aion.memory import sqlite_store, embeddings, vector_store

    today = datetime.date.today().isoformat()
    now = datetime.datetime.utcnow().isoformat()

    brief = MorningBriefing(
        app_id=app_id,
        date=today,
        generated_at=now,
    )

    if not await sqlite_store.is_tenant_provisioned(app_id):
        brief.summary = "Tenant ainda não possui base de conhecimento."
        await _save_briefing(app_id, brief)
        return brief

    if llm is None:
        from aion.llm import factory as llm_factory
        try:
            llm = await llm_factory.get_llm_provider()
        except Exception as e:
            logger.warning("No LLM available for briefing: %s", e)
            brief.summary = "Briefing não gerado — LLM indisponível."
            brief.priorities = ["Revisar pendências manualmente"]
            await _save_briefing(app_id, brief)
            return brief

    activity_text = await _get_activity_summary(app_id)
    risks_text = await _get_pending_risks(app_id)

    # Pattern insights
    try:
        from aion.analysis import pattern_detector
        pattern_insights = await pattern_detector.get_insights_for_briefing(app_id)
    except Exception:
        pattern_insights = []

    # Check if night research ran
    try:
        from aion.research import night_research
        nr = await night_research.get_last_report(app_id)
        night_research_summary = nr.summary if nr and nr.date == today else ""
    except Exception:
        night_research_summary = ""

    sources = ["actions_log", "knowledge", "decisions"]
    if pattern_insights:
        sources.append("pattern_detector")
    if night_research_summary:
        sources.append("night_research")

    context_parts = [
        f"Atividade recente de '{app_id}':",
        activity_text,
        "",
        "Pendências e riscos:",
        risks_text,
    ]
    if pattern_insights:
        context_parts.append("")
        context_parts.append("Padrões detectados:")
        for ins in pattern_insights:
            context_parts.append(f"  - {ins}")
    if night_research_summary:
        context_parts.append("")
        context_parts.append(f"Pesquisa noturna: {night_research_summary}")

    context = "\n".join(context_parts)

    prompt = (
        f"Você é o AION, assistente de IA especializado em análise de contexto.\n\n"
        f"Com base nos dados abaixo do tenant '{app_id}', gere um Morning Briefing "
        f"com as seções:\n"
        f"1. Sumário narrativo do dia anterior (2-3 frases)\n"
        f"2. Top 3 prioridades para hoje\n"
        f"3. Riscos identificados\n"
        f"4. Oportunidades ou insights\n"
         f"5. Se houver padrões detectados, use-os nas oportunidades e nota estratégica\n"
         f"6. Nota estratégica curta (1 frase)\n\n"
        f"Dados:\n{context}\n\n"
        f"Responda APENAS com um objeto JSON:\n"
        f"{'{'}\n"
        f'  "summary": "...",\n'
        f'  "priorities": ["...", "...", "..."],\n'
        f'  "risks": ["...", "..."],\n'
        f'  "opportunities": ["..."],\n'
        f'  "strategic_note": "..."\n'
        f"{'}'}"
    )

    raw = await _call_llm(llm, prompt)

    if raw:
        import re
        brace = re.search(r"\{[\s\S]*\}", raw)
        if brace:
            try:
                data = json.loads(brace.group())
                brief.summary = data.get("summary", "Briefing gerado.")
                brief.priorities = data.get("priorities", ["Revisar atividades"])
                brief.risks = data.get("risks", [])
                brief.opportunities = data.get("opportunities", [])
                brief.strategic_note = data.get("strategic_note", "")
            except (json.JSONDecodeError, TypeError):
                pass

    if not brief.summary:
        brief.summary = "Briefing gerado com base na atividade recente."
    if not brief.priorities:
        brief.priorities = ["Revisar pendências"]

    brief.sources_used = sources

    await _save_briefing(app_id, brief)
    logger.info("Morning briefing generated for '%s'", app_id)
    return brief
