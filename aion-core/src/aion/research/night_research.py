import os
import json
import asyncio
import logging
import datetime
from typing import List, Optional, Dict, Callable, Awaitable
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.research.night")

from aion.config import settings

MAX_TOPICS = settings.NIGHT_RESEARCH_MAX_TOPICS
REPORT_TABLE = "night_research_reports"
_TOPIC_CACHE: Dict[str, List[str]] = {}
_last_reports: Dict[str, "NightResearchReport"] = {}
_scheduled_jobs: Dict[str, object] = {}


class NightResearchReport(BaseModel):
    app_id: str = Field(default="")
    date: str = Field(default="")
    topics_researched: List[str] = Field(default_factory=list)
    insights_generated: List[str] = Field(default_factory=list)
    knowledge_saved: int = Field(default=0)
    summary: str = Field(default="")
    created_at: str = Field(default="")


async def _ensure_report_table(app_id: str) -> None:
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            f"CREATE TABLE IF NOT EXISTS {REPORT_TABLE} ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "app_id TEXT NOT NULL, date TEXT NOT NULL, "
            "topics_researched TEXT, insights_generated TEXT, "
            "knowledge_saved INTEGER DEFAULT 0, summary TEXT, "
            "created_at TEXT NOT NULL)"
        )
        await conn.commit()


async def _save_report(app_id: str, report: NightResearchReport) -> None:
    await _ensure_report_table(app_id)
    from aion.memory import sqlite_store
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            f"INSERT INTO {REPORT_TABLE} "
            "(app_id, date, topics_researched, insights_generated, knowledge_saved, summary, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                report.app_id, report.date,
                json.dumps(report.topics_researched),
                json.dumps(report.insights_generated),
                report.knowledge_saved, report.summary, report.created_at,
            ),
        )
        await conn.commit()
    _last_reports[app_id] = report


async def get_last_report(app_id: str) -> Optional[NightResearchReport]:
    if app_id in _last_reports:
        return _last_reports[app_id]
    await _ensure_report_table(app_id)
    from aion.memory import sqlite_store
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                f"SELECT * FROM {REPORT_TABLE} WHERE app_id = ? ORDER BY id DESC LIMIT 1",
                (app_id,),
            )
            row = await c.fetchone()
            if not row:
                return None
            report = NightResearchReport(
                app_id=row["app_id"],
                date=row["date"],
                topics_researched=json.loads(row["topics_researched"] or "[]"),
                insights_generated=json.loads(row["insights_generated"] or "[]"),
                knowledge_saved=row["knowledge_saved"],
                summary=row["summary"],
                created_at=row["created_at"],
            )
            _last_reports[app_id] = report
            return report
    except Exception:
        return None


async def _call_llm(
    llm: Callable[[list], Awaitable[str]],
    prompt: str,
    timeout: float = 20.0,
) -> str:
    try:
        return await asyncio.wait_for(
            llm([{"role": "user", "content": prompt}]),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("Night research LLM call timed out")
        return ""
    except Exception as e:
        logger.warning("Night research LLM call failed: %s", e)
        return ""


def _extract_topics_from_text(text: str) -> List[str]:
    words = text.split()
    topics = []
    for word in words:
        clean = word.strip(".,!?;:()[]{}'\"").lower()
        if len(clean) > 4 and clean.isalpha() and clean not in (
            "para", "como", "mais", "sobre", "quando", "onde", "quem",
            "qual", "quais", "esse", "esta", "isso", "aquele", "porque",
            "entre", "depois", "antes", "durante", "sempre", "nunca",
            "você", "voce", "meu", "seu", "nosso", "deles", "nisto",
            "por", "que", "com", "dos", "das", "aos", "nas", "nos",
        ):
            topics.append(clean)
    return topics


async def get_monitored_topics(app_id: str) -> List[str]:
    if app_id in _TOPIC_CACHE:
        return _TOPIC_CACHE[app_id]

    from aion.memory import sqlite_store
    topics: List[str] = []
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            for tbl in ("knowledge", "decisions"):
                c = await conn.execute(
                    f"SELECT content FROM {tbl} WHERE app_id = ? AND created_at >= ? LIMIT 50",
                    (app_id, cutoff),
                )
                rows = await c.fetchall()
                for row in rows:
                    topics.extend(_extract_topics_from_text(row[0]))

            c = await conn.execute(
                "SELECT input FROM actions_log WHERE app_id = ? AND created_at >= ? LIMIT 50",
                (app_id, cutoff),
            )
            rows = await c.fetchall()
            for row in rows:
                topics.extend(_extract_topics_from_text(row[0]))
    except Exception as e:
        logger.warning("Failed to extract topics for '%s': %s", app_id, e)

    unique = list(dict.fromkeys(topics))
    result = unique[:MAX_TOPICS]
    _TOPIC_CACHE[app_id] = result
    return result


async def _generate_research_questions(
    app_id: str,
    topics: List[str],
    llm: Callable[[list], Awaitable[str]],
) -> List[str]:
    topic_list = "\n".join(f"- {t}" for t in topics[:MAX_TOPICS])
    prompt = (
        f"Tenant '{app_id}' possui os seguintes tópicos de interesse:\n{topic_list}\n\n"
        f"Com base nesses tópicos, gere perguntas de pesquisa relevantes "
        f"que um assistente de IA deveria pesquisar para melhorar sua base de conhecimento. "
        f"Máximo de {MAX_TOPICS} perguntas. "
        f"Retorne apenas as perguntas, uma por linha, cada uma terminando com '?'."
    )
    text = await _call_llm(llm, prompt)
    if not text:
        return [f"O que há de novo sobre '{t}'?" for t in topics[:MAX_TOPICS]]

    questions = []
    for line in text.strip().split("\n"):
        line = line.strip().strip("-\"\"'*").strip()
        if line.endswith("?"):
            questions.append(line)
    return questions[:MAX_TOPICS]


async def _is_knowledge_duplicate(app_id: str, content: str) -> bool:
    from aion.memory import embeddings, vector_store
    try:
        emb = embeddings.embed(content)
        if not emb:
            return False
        results = await vector_store.semantic_search(
            app_id, emb, n_results=3, threshold=0.85
        )
        return len(results) > 0
    except Exception:
        return False


async def _save_research_result(
    app_id: str, question: str, answer: str, summary_lines: List[str],
) -> bool:
    from aion.memory import sqlite_store, embeddings, vector_store
    from aion.obsidian import writer as obsidian_writer

    content = f"Q: {question}\nR: {answer}"
    if await _is_knowledge_duplicate(app_id, content):
        logger.info("Skipping duplicate research result for '%s'", question[:50])
        return False

    kid = await sqlite_store.save_knowledge(
        app_id, content,
        tags=["night_research", "auto_discovery"],
        confidence=0.70,
    )
    emb = embeddings.embed(content)
    if emb:
        await vector_store.add_knowledge(
            app_id, kid, content, emb,
            {"tags": "night_research,auto_discovery", "question": question},
        )
    summary_lines.append(f"## {question}")
    summary_lines.append(answer)
    summary_lines.append("")
    return True


async def run_night_research(
    app_id: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> NightResearchReport:
    from aion.memory import sqlite_store, embeddings, vector_store
    from aion.obsidian import writer as obsidian_writer

    today = datetime.date.today().isoformat()
    report = NightResearchReport(
        app_id=app_id, date=today,
        created_at=datetime.datetime.utcnow().isoformat(),
    )

    if not await sqlite_store.is_tenant_provisioned(app_id):
        logger.info("Tenant '%s' not provisioned — skipping night research", app_id)
        return report

    if llm is None:
        from aion.llm import factory as llm_factory
        try:
            llm = await llm_factory.get_llm_provider()
        except Exception as e:
            logger.warning("No LLM available for night research: %s", e)
            report.summary = "Pesquisa noturna não realizada — LLM indisponível."
            await _save_report(app_id, report)
            return report

    topics = await get_monitored_topics(app_id)
    if not topics:
        logger.info("No topics found for '%s' — skipping night research", app_id)
        report.summary = "Nenhum tópico identificado para pesquisa."
        await _save_report(app_id, report)
        return report

    questions = await _generate_research_questions(app_id, topics, llm)
    report.topics_researched = questions

    summary_lines = [
        f"# Pesquisa Noturna — {app_id}",
        f"Data: {today}",
        f"Tópicos monitorados: {len(topics)}",
        f"Perguntas geradas: {len(questions)}",
        "",
    ]

    saved_count = 0
    for question in questions:
        try:
            answer = await _call_llm(
                llm,
                f"Responda como especialista: {question}",
            )
            if not answer:
                continue
            if await _save_research_result(app_id, question, answer, summary_lines):
                saved_count += 1
                report.insights_generated.append(question)
        except Exception as e:
            logger.warning("Night research failed for question '%s': %s", question[:50], e)

    report.knowledge_saved = saved_count
    report.summary = (
        f"Pesquisa noturna concluída: {saved_count} de {len(questions)} "
        f"perguntas geraram novos insights."
    )
    summary_lines.append(report.summary)
    summary = "\n".join(summary_lines)

    try:
        await obsidian_writer._write_file(
            os.path.join(
                obsidian_writer._get_vault_path() or "obsidian",
                app_id, "research", f"{today}.md",
            ),
            summary,
        )
    except Exception as e:
        logger.warning("Failed to write night research Obsidian file: %s", e)

    await _save_report(app_id, report)
    logger.info(
        "Night research for '%s': %d/%d saved",
        app_id, saved_count, len(questions),
    )
    return report


async def schedule_night_research(
    app_id: str,
    schedule_time: Optional[str] = None,
) -> None:
    if app_id in _scheduled_jobs:
        return

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler()
        time_str = schedule_time or settings.NIGHT_RESEARCH_TIME
        hour, minute = time_str.split(":")
        scheduler.add_job(
            run_night_research,
            CronTrigger(hour=int(hour), minute=int(minute)),
            args=[app_id],
            id=f"night_research_{app_id}",
            replace_existing=True,
        )
        scheduler.start()
        _scheduled_jobs[app_id] = scheduler
        logger.info(
            "Night research scheduled for '%s' at %s", app_id, schedule_time
        )
    except ImportError:
        logger.warning(
            "APScheduler not installed — night research for '%s' not scheduled", app_id
        )
    except Exception as e:
        logger.warning("Failed to schedule night research for '%s': %s", app_id, e)
