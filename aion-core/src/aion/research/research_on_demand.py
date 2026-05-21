import os
import json
import asyncio
import logging
import datetime
from typing import List, Optional, Dict, Callable, Awaitable

logger = logging.getLogger("aion.research.on_demand")

from aion.config import settings


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
        logger.warning("On-demand research LLM call timed out")
        return ""
    except Exception as e:
        logger.warning("On-demand research LLM call failed: %s", e)
        return ""


async def _generate_research_questions(
    query: str,
    llm: Callable[[list], Awaitable[str]],
) -> List[str]:
    prompt = (
        f"Um usuário perguntou: '{query}'\n\n"
        f"Gere de 1 a 3 perguntas de pesquisa na web que ajudariam "
        f"a responder essa pergunta com informações atualizadas. "
        f"Retorne apenas as perguntas, uma por linha, cada uma terminando com '?'."
    )
    text = await _call_llm(llm, prompt)
    if not text:
        return [query]

    questions = []
    for line in text.strip().split("\n"):
        line = line.strip().strip("-\"'*").strip()
        if line.endswith("?"):
            questions.append(line)
    return questions[:3]


async def _search_question(question: str) -> str:
    from aion.research import web_search
    results = await web_search.search_web(question, max_results=5)
    if not results:
        return ""
    lines = []
    for r in results[:3]:
        lines.append(f"- {r['title']}: {r['snippet']}")
    return "\n".join(lines)


async def run_on_demand_research(
    app_id: str,
    query: str,
    llm: Optional[Callable[[list], Awaitable[str]]] = None,
) -> str:
    if llm is None:
        from aion.llm import factory as llm_factory
        try:
            llm = await llm_factory.get_llm_provider()
        except Exception:
            logger.warning("No LLM available for on-demand research")
            return ""

    questions = await _generate_research_questions(query, llm)
    if not questions:
        return ""

    context_parts = []
    for q in questions:
        search_text = await _search_question(q)
        if search_text:
            context_parts.append(f"## Pesquisa: {q}\n{search_text}")

    if not context_parts:
        return ""

    research_context = "\n\n".join(context_parts)

    synthesis_prompt = (
        f"Com base nas informações pesquisadas abaixo, responda à pergunta do usuário "
        f"de forma clara e objetiva. Se as informações estiverem desatualizadas ou "
        f"incompletas, mencione isso.\n\n"
        f"Pergunta original: {query}\n\n"
        f"Informações pesquisadas:\n{research_context}"
    )
    synthesis = await _call_llm(llm, synthesis_prompt, timeout=30.0)

    if not synthesis:
        return ""

    try:
        await _save_research_results(app_id, query, research_context, synthesis)
    except Exception as e:
        logger.warning("Failed to save on-demand research results: %s", e)

    return synthesis


async def _save_research_results(
    app_id: str,
    query: str,
    raw_context: str,
    synthesis: str,
) -> None:
    from aion.memory import sqlite_store, embeddings, vector_store

    content = f"Q: {query}\nR: {synthesis}"
    kid = await sqlite_store.save_knowledge(
        app_id, content,
        tags=["on_demand_research", "current_event"],
        confidence=0.70,
    )
    emb = embeddings.embed(content)
    if emb:
        await vector_store.add_knowledge(
            app_id, kid, content, emb,
            {"tags": "on_demand_research,current_event", "query": query},
        )
    logger.info("On-demand research saved for '%s': %s", app_id, query[:60])
