import os
import json
import asyncio
import logging
import datetime
from typing import List, Optional, Set, Dict, Callable, Awaitable
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.teaching.reteacher")

_scheduled_tasks: Dict[str, asyncio.Task] = {}
_reteaching_locks: Dict[str, asyncio.Lock] = {}
_lock_registry = asyncio.Lock()


class KnowledgeHealth(BaseModel):
    tenant_id: str = Field(default="")
    total_knowledge: int = Field(default=0)
    expired_count: int = Field(default=0)
    low_confidence_count: int = Field(default=0)
    healthy_count: int = Field(default=0)
    last_reteaching: Optional[str] = None
    days_since_last_reteaching: Optional[float] = None


class ReteachingReport(BaseModel):
    tenant_id: str = Field(default="")
    questions_generated: int = Field(default=0)
    knowledge_saved: int = Field(default=0)
    vectors_added: int = Field(default=0)
    duration_seconds: float = Field(default=0.0)
    errors: List[str] = Field(default_factory=list)


async def _get_db_path(app_id: str) -> str:
    safe = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
    return os.path.join("data", f"{safe}.sqlite")


async def get_knowledge_health(app_id: str) -> KnowledgeHealth:
    from aion.memory import sqlite_store

    health = KnowledgeHealth(tenant_id=app_id)
    if not await sqlite_store.is_tenant_provisioned(app_id):
        return health

    now = datetime.datetime.utcnow().isoformat()

    async with sqlite_store.tenant_db_connection(app_id) as conn:
        c = await conn.execute(
            "SELECT COUNT(*) FROM knowledge WHERE app_id = ?", (app_id,)
        )
        health.total_knowledge = (await c.fetchone())[0]

        c = await conn.execute(
            "SELECT COUNT(*) FROM knowledge WHERE app_id = ? AND expires_at IS NOT NULL AND expires_at < ?",
            (app_id, now),
        )
        health.expired_count = (await c.fetchone())[0]

        c = await conn.execute(
            "SELECT COUNT(*) FROM knowledge WHERE app_id = ? AND confidence < 0.5",
            (app_id,),
        )
        health.low_confidence_count = (await c.fetchone())[0]

        health.healthy_count = health.total_knowledge - health.expired_count - health.low_confidence_count
        if health.healthy_count < 0:
            health.healthy_count = 0

        c = await conn.execute(
            "SELECT MAX(created_at) FROM knowledge WHERE app_id = ? AND tags LIKE '%reteaching%'",
            (app_id,),
        )
        last = (await c.fetchone())[0]
        if last:
            health.last_reteaching = last
            try:
                last_dt = datetime.datetime.fromisoformat(last)
                delta = datetime.datetime.utcnow() - last_dt
                health.days_since_last_reteaching = delta.total_seconds() / 86400.0
            except Exception:
                pass

    return health


async def _call_llm(
    llm: Callable[[list], Awaitable[str]],
    prompt: str,
    timeout: float = 15.0,
) -> str:
    try:
        return await asyncio.wait_for(
            llm([{"role": "user", "content": prompt}]),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("Reteaching LLM call timed out after %.1fs", timeout)
        return ""
    except Exception as e:
        logger.warning("Reteaching LLM call failed: %s", e)
        return ""


async def _identify_weak_topics(
    app_id: str,
    llm: Callable[[list], Awaitable[str]],
    app_description: str,
) -> List[str]:
    from aion.memory import sqlite_store

    health = await get_knowledge_health(app_id)
    topics = []

    if health.low_confidence_count > 0:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT content FROM knowledge WHERE app_id = ? AND confidence < 0.5 ORDER BY created_at DESC LIMIT 5",
                (app_id,),
            )
            rows = await c.fetchall()
            for row in rows:
                topics.append(f"Fragmented knowledge: {row['content'][:100]}")

    prompt = (
        f"O tenant '{app_id}' ({app_description}) possui {health.total_knowledge} registros de conhecimento "
        f"({health.expired_count} expirados, {health.low_confidence_count} com baixa confiança). "
        f"Gere exatamente 5 perguntas de domínio que UM ASSISTENTE DE IA PRECISA SABER "
        f"para responder com precisão sobre este negócio. "
        f"As perguntas devem preencher lacunas de conhecimento críticas. "
        f"Retorne apenas as 5 perguntas, uma por linha, cada uma terminando com '?'."
    )

    text = await _call_llm(llm, prompt)
    if text:
        for line in text.strip().split("\n"):
            line = line.strip().strip("-\"\"'*").strip()
            if line.endswith("?"):
                topics.append(line)

    if not topics:
        topics = [
            f"Quais funcionalidades principais da aplicação '{app_description}' precisam de revisão?",
            f"Quais são as dúvidas mais frequentes dos usuários de '{app_description}'?",
            f"Que mudanças recentes ocorreram no domínio de '{app_description}'?",
            f"Quais integrações ou APIs são usadas por '{app_description}'?",
            f"Qual o perfil de erro mais comum em '{app_description}'?",
        ]

    return topics[:5]


async def run_reteaching(
    app_id: str,
    app_description: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> ReteachingReport:
    from aion.memory import sqlite_store, embeddings, vector_store
    from aion.obsidian import writer as obsidian_writer

    report = ReteachingReport(tenant_id=app_id)
    start = asyncio.get_event_loop().time()

    if llm is None:
        from aion.llm import factory as llm_factory
        try:
            llm = await llm_factory.get_llm_provider()
        except Exception as e:
            report.errors.append(f"Failed to get LLM provider: {e}")
            return report

    topics = await _identify_weak_topics(app_id, llm, app_description)
    report.questions_generated = len(topics)

    for topic in topics:
        try:
            answer = await _call_llm(
                llm,
                f"Responda como especialista no domínio '{app_description}': {topic}",
            )
            if not answer:
                continue

            content = f"Q: {topic}\nR: {answer}"
            kid = await sqlite_store.save_knowledge(
                app_id,
                content,
                tags=["reteaching", "domain_revision"],
                confidence=0.75,
            )
            report.knowledge_saved += 1

            emb = embeddings.embed(f"{topic} {answer}")
            if emb:
                await vector_store.add_knowledge(
                    app_id, kid, f"{topic} {answer}", emb,
                    {"tags": "reteaching,domain_revision", "topic": topic},
                )
                report.vectors_added += 1

        except Exception as e:
            report.errors.append(f"Topic '{topic[:50]}': {e}")
            logger.warning("Reteaching failed for topic '%s': %s", topic[:50], e)

    await sqlite_store.save_knowledge(
        app_id,
        "reteaching_complete",
        tags=["reteaching_complete"],
        confidence=1.0,
    )

    try:
        summary_lines = [
            f"# Reteaching — {app_description}",
            f"Realizado em: {datetime.datetime.utcnow().isoformat()}",
            f"Perguntas geradas: {report.questions_generated}",
            f"Conhecimento salvo: {report.knowledge_saved}",
            f"Vetores adicionados: {report.vectors_added}",
            f"Erros: {len(report.errors)}",
            "",
        ]
        for i, topic in enumerate(topics, 1):
            summary_lines.append(f"## Tópico {i}")
            summary_lines.append(topic)
            summary_lines.append("")

        summary = "\n".join(summary_lines)
        await obsidian_writer._write_file(
            os.path.join(
                obsidian_writer._get_vault_path() or "obsidian",
                app_id, "knowledge", f"reteaching-{datetime.datetime.utcnow().strftime('%Y-%m-%d-%H-%M')}.md",
            ),
            summary,
        )
    except Exception as e:
        logger.warning("Failed to write reteaching Obsidian file: %s", e)

    report.duration_seconds = asyncio.get_event_loop().time() - start
    logger.info(
        "Reteaching for '%s' complete: %d topics, %d saved, %.1fs",
        app_id, report.questions_generated, report.knowledge_saved, report.duration_seconds,
    )
    return report


async def _reteaching_loop(
    app_id: str,
    app_description: str,
    interval_hours: float = 24.0,
) -> None:
    while True:
        try:
            await asyncio.sleep(interval_hours * 3600)
            logger.info("Scheduled reteaching triggered for '%s'", app_id)
            await run_reteaching(app_id, app_description)
        except asyncio.CancelledError:
            logger.info("Reteaching loop cancelled for '%s'", app_id)
            break
        except Exception as e:
            logger.warning("Reteaching loop error for '%s': %s", app_id, e)


async def schedule_reteaching(
    app_id: str,
    app_description: str,
    interval_hours: float = 24.0,
) -> None:
    async with _lock_registry:
        if app_id not in _reteaching_locks:
            _reteaching_locks[app_id] = asyncio.Lock()

    if app_id in _scheduled_tasks and not _scheduled_tasks[app_id].done():
        logger.info("Reteaching already scheduled for '%s'", app_id)
        return

    task = asyncio.create_task(
        _reteaching_loop(app_id, app_description, interval_hours)
    )
    _scheduled_tasks[app_id] = task
    logger.info(
        "Reteaching scheduled for '%s' every %.1f hours", app_id, interval_hours
    )


async def cancel_reteaching(app_id: str) -> bool:
    task = _scheduled_tasks.get(app_id)
    if task and not task.done():
        task.cancel()
        _scheduled_tasks.pop(app_id, None)
        logger.info("Reteaching cancelled for '%s'", app_id)
        return True
    return False


def is_reteaching_scheduled(app_id: str) -> bool:
    task = _scheduled_tasks.get(app_id)
    return task is not None and not task.done()
