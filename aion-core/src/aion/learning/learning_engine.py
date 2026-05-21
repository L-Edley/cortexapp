import json
import asyncio
import logging
import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from aion.agent.reasoner import (
    build_rag_context,
    compute_rag_confidence,
    decide_response_source,
    extract_reply,
)
from aion.learning.knowledge_gap import (
    detect_gap,
    should_call_provider,
    classify_learning,
    LearningClassification,
)

logger = logging.getLogger("aion.learning.engine")


class LearningResult(BaseModel):
    answer: str = Field(default="")
    raw_response: str = Field(default="")
    source: str = Field(default="provider")
    gap_type: str = Field(default="stable_knowledge")
    learned: bool = Field(default=False)
    confidence: float = Field(default=0.0)
    provider_used: Optional[str] = None
    debug: Dict[str, Any] = Field(default_factory=dict)


async def _embed_text(text: str) -> list:
    from aion.memory import embeddings
    return embeddings.embed(text)


async def _check_recent_cache(app_id: str, input: str) -> Optional[str]:
    from aion.memory import sqlite_store
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(hours=1)).isoformat()
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT output FROM actions_log "
                "WHERE app_id = ? AND input = ? AND created_at >= ? AND status = 'success' "
                "ORDER BY created_at DESC LIMIT 1",
                (app_id, input, cutoff),
            )
            row = await cursor.fetchone()
            if row:
                return row["output"]
    except Exception:
        pass
    return None


async def _save_to_knowledge_and_vector(
    app_id: str, content: str, tags: list, confidence: float, expires_at: Optional[str] = None
) -> str:
    from aion.memory import sqlite_store, vector_store
    k_id = await sqlite_store.save_knowledge(app_id, content, tags, confidence, expires_at)
    emb = await _embed_text(content)
    if emb:
        meta = {"tags": ",".join(tags)}
        await vector_store.add_knowledge(app_id, k_id, content, emb, meta)
    return k_id


async def _save_to_memory_and_vector(
    app_id: str, content: str, type_str: str, metadata: Optional[dict], confidence: float
) -> str:
    from aion.memory import sqlite_store, vector_store
    mem_id = await sqlite_store.save_memory(app_id, content, type_str, metadata, confidence)
    emb = await _embed_text(content)
    if emb:
        await vector_store.add_memory(app_id, mem_id, content, emb, metadata)
    return mem_id


async def save_to_brain(
    app_id: str,
    input: str,
    classification: LearningClassification,
    response: str,
) -> Dict[str, Any]:
    action = classification.action
    if action == "discard":
        return {"saved": False, "target": "none", "id": None}

    result = {"saved": True, "target": classification.target, "id": None, "tags": classification.tags}

    if action == "save_memory":
        mem_id = await _save_to_memory_and_vector(
            app_id,
            classification.content or response,
            classification.target,
            {"tags": classification.tags},
            classification.confidence,
        )
        result["id"] = mem_id

    elif action == "save_knowledge":
        expires = None
        if classification.expires_in_hours:
            expires = (
                datetime.datetime.utcnow() + datetime.timedelta(hours=classification.expires_in_hours)
            ).isoformat()
        kid = await _save_to_knowledge_and_vector(
            app_id,
            classification.content or response,
            classification.tags,
            classification.confidence,
            expires,
        )
        result["id"] = kid

    elif action == "update_cache":
        return {"saved": False, "target": "cache", "id": None}

    return result


async def run(
    app_id: str,
    user_id: str,
    input: str,
    context: Optional[Dict[str, Any]] = None,
) -> LearningResult:
    from aion.llm import factory as llm_factory
    from aion.obsidian import writer
    from aion.memory import sqlite_store

    context = context or {}
    debug = {}

    rag_text = await build_rag_context(app_id, input)
    confidence = compute_rag_confidence(rag_text)
    debug["rag_confidence"] = confidence

    gap = detect_gap(app_id, input, confidence)
    debug["gap_type"] = gap.gap_type.value

    if not should_call_provider(gap):
        answer = rag_text if rag_text else "Já conheço essa informação."
        return LearningResult(
            answer=f"[Cached from RAG]\n\n{answer}",
            raw_response=answer,
            source="cache",
            gap_type=gap.gap_type.value,
            learned=False,
            confidence=confidence,
            debug=debug,
        )

    if gap.gap_type.value != "current_event":
        cached = await _check_recent_cache(app_id, input)
        if cached is not None:
            debug["cache_hit"] = True
            return LearningResult(
                answer=cached,
                raw_response=cached,
                source="cache",
                gap_type=gap.gap_type.value,
                learned=False,
                confidence=confidence,
                debug=debug,
            )

    try:
        provider_complete = await llm_factory.get_llm_provider()
        provider_name = provider_complete.__module__.rsplit(".", 1)[-1]
    except Exception:
        provider_complete = None
        provider_name = "mock"

    from aion.config import settings as aion_settings
    sys_prompt = context.get("system_prompt", aion_settings.system_prompt)
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": input},
    ]

    debug["provider"] = provider_name
    try:
        llm_reply = await provider_complete(messages)
        debug["provider_ok"] = True
    except Exception as e:
        logger.warning("Provider failed in learning engine: %s", e)
        debug["provider_ok"] = False
        debug["provider_error"] = str(e)
        try:
            from aion.llm.providers import mock
            llm_reply = await mock.complete(messages)
            provider_name = "mock"
            debug["provider"] = "mock_fallback"
        except Exception as e2:
            return LearningResult(
                answer="Desculpe, não foi possível processar sua solicitação.",
                raw_response="",
                source="fallback",
                gap_type=gap.gap_type.value,
                learned=False,
                confidence=0.0,
                provider_used="none",
                debug=debug,
            )

    answer = extract_reply(llm_reply)
    classification = classify_learning(input, llm_reply)
    debug["classification"] = classification.model_dump()

    if gap.gap_type.value == "current_event":
        try:
            from aion.research import research_on_demand
            research_result = await research_on_demand.run_on_demand_research(
                app_id, input, provider_complete
            )
            if research_result:
                answer = research_result
                llm_reply = research_result
                debug["on_demand_research"] = True
                logger.info("On-demand research augmented response for '%s'", app_id)
            else:
                debug["on_demand_research"] = False
                disclaimer = (
                    "\n\n---\n⚠️ **Aviso**: Esta resposta foi gerada com base no conhecimento "
                    "de treinamento do modelo (data de corte). Configure TAVILY_API_KEY "
                    "para obter informações atualizadas da web."
                )
                answer = answer + disclaimer
        except Exception as e:
            logger.warning("On-demand research failed for '%s': %s", app_id, e)
            debug["on_demand_research"] = False

    brain_result = await save_to_brain(app_id, input, classification, llm_reply)
    debug["brain"] = brain_result

    asyncio.create_task(writer.write_memory(app_id, input, {"user_id": user_id}))

    await sqlite_store.log_action(
        app_id, "chat_completion", input, llm_reply[:200], "success"
    )

    return LearningResult(
        answer=answer,
        raw_response=llm_reply,
        source="provider",
        gap_type=gap.gap_type.value,
        learned=brain_result["saved"],
        confidence=classification.confidence,
        provider_used=provider_name,
        debug=debug,
    )
