import os
import json
import asyncio
import logging
from typing import List, Optional, Set, Dict, Callable, Awaitable
import datetime

logger = logging.getLogger("aion.teaching.self_teacher")

_initialized_tenants: Set[str] = set()
_preflight_summaries: Dict[str, str] = {}
_teaching_locks: Dict[str, asyncio.Lock] = {}
_lock_registry = asyncio.Lock()


def _get_db_path(app_id: str) -> str:
    safe = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
    return os.path.join("data", f"{safe}.sqlite")


async def is_initialized(app_id: str) -> bool:
    if app_id in _initialized_tenants:
        return True
    db_path = _get_db_path(app_id)
    if not os.path.exists(db_path):
        return False
    from aion.memory import sqlite_store
    if not await sqlite_store.is_tenant_provisioned(app_id):
        return False
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        cursor = await conn.execute(
            "SELECT id FROM knowledge WHERE tags LIKE '%preflight_complete%' LIMIT 1"
        )
        row = await cursor.fetchone()
        if row:
            _initialized_tenants.add(app_id)
            return True
    return False


def get_preflight_summary(app_id: str) -> Optional[str]:
    return _preflight_summaries.get(app_id)


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
        logger.warning("LLM call timed out after %.1fs", timeout)
        return ""
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return ""


def _parse_questions(text: str) -> List[str]:
    if not text:
        return []
    questions = []
    for line in text.strip().split("\n"):
        line = line.strip().strip("-\"\"'*").strip()
        if not line:
            continue
        if line.endswith("?"):
            questions.append(line)
    return questions[:5]


async def generate_domain_questions(
    app_description: str,
    llm: Callable[[list], Awaitable[str]],
) -> List[str]:
    prompt = (
        f"Você é um analista de domínio. Dada a descrição de aplicação abaixo, "
        f"gere exatamente 5 perguntas-chave cujas respostas dariam contexto "
        f"essencial para um assistente de IA entender o negócio e os usuários.\n\n"
        f"Descrição: {app_description}\n\n"
        f"Retorne apenas as 5 perguntas, uma por linha, cada uma terminando com '?'."
    )
    text = await _call_llm(llm, prompt)
    questions = _parse_questions(text)
    if not questions:
        questions = [
            f"Quais são os principais casos de uso da aplicação '{app_description}'?",
            f"Que tipo de usuário utiliza a aplicação '{app_description}'?",
            f"Quais são os termos técnicos mais relevantes para '{app_description}'?",
            f"Como um assistente de IA pode ajudar usuários de '{app_description}'?",
            f"Quais integrações são comuns em aplicações como '{app_description}'?",
        ]
    return questions


async def run_preflight(
    app_id: str,
    app_description: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> None:
    if await is_initialized(app_id):
        logger.info("Tenant '%s' already initialized — skipping preflight", app_id)
        return

    async with _lock_registry:
        if app_id not in _teaching_locks:
            _teaching_locks[app_id] = asyncio.Lock()

    lock = _teaching_locks[app_id]
    async with lock:
        if await is_initialized(app_id):
            return

        logger.info("Running preflight for tenant '%s' (desc: '%s')", app_id, app_description)

        try:
            await asyncio.wait_for(
                _run_preflight_inner(app_id, app_description, llm),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            logger.warning("Preflight timed out for tenant '%s'", app_id)
        except Exception as e:
            logger.warning("Preflight failed for tenant '%s': %s", app_id, e)


async def _run_preflight_inner(
    app_id: str,
    app_description: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> None:
    from aion.memory import sqlite_store, embeddings, vector_store
    from aion.obsidian import writer as obsidian_writer

    if llm is None:
        from aion.llm import factory as llm_factory
        llm = await llm_factory.get_llm_provider()

    questions = await generate_domain_questions(app_description, llm)
    if not questions:
        logger.warning("No questions generated for tenant '%s'", app_id)
        return

    qa_pairs = []
    for i, question in enumerate(questions):
        logger.info("Preflight Q%d for '%s': %s", i + 1, app_id, question)
        answer = await _call_llm(llm, f"Responda como especialista no domínio '{app_description}': {question}")
        if not answer:
            answer = f"Conhecimento sobre: {question}"

        kid = await sqlite_store.save_knowledge(
            app_id,
            f"Q: {question}\nR: {answer}",
            tags=["preflight", "domain_discovery", f"preflight_q{i+1}"],
            confidence=0.70,
        )
        emb = embeddings.embed(f"{question} {answer}")
        if emb:
            await vector_store.add_knowledge(
                app_id, kid, f"{question} {answer}", emb,
                {"tags": "preflight,domain_discovery", "question": question},
            )
        qa_pairs.append({"question": question, "answer": answer})

    marker_id = await sqlite_store.save_knowledge(
        app_id,
        "preflight_complete",
        tags=["preflight_complete"],
        confidence=1.0,
    )
    emb_marker = embeddings.embed("preflight_complete")
    if emb_marker:
        await vector_store.add_knowledge(
            app_id, marker_id, "preflight_complete", emb_marker,
            {"tags": "preflight_complete"},
        )

    summary_lines = [
        f"# Preflight — {app_description}",
        f"Realizado em: {datetime.datetime.utcnow().isoformat()}",
        f"Total de perguntas: {len(qa_pairs)}",
        "",
    ]
    for i, pair in enumerate(qa_pairs, 1):
        summary_lines.append(f"## Pergunta {i}")
        summary_lines.append(f"**{pair['question']}**")
        summary_lines.append("")
        summary_lines.append(pair["answer"])
        summary_lines.append("")

    summary = "\n".join(summary_lines)
    _preflight_summaries[app_id] = summary

    try:
        await obsidian_writer._write_file(
            os.path.join(
                obsidian_writer._get_vault_path() or "obsidian",
                app_id, "knowledge", "preflight.md",
            ),
            summary,
        )
    except Exception as e:
        logger.warning("Failed to write preflight Obsidian file: %s", e)

    _initialized_tenants.add(app_id)
    logger.info("Preflight completed for tenant '%s'", app_id)
