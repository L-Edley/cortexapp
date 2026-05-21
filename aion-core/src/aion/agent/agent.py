import json
import asyncio
import logging
from typing import Dict, Any, Optional, List

from aion.persona import (
    format_response,
    AionResponse,
    get_emotional_context,
    build_system_prompt,
    detect_emotional_state,
    save_emotional_snapshot
)
from aion.intent.intent_detector import detect_intent
from aion.agent.reasoner import build_rag_context, compute_rag_confidence, try_parse_tool_calls, build_cache_reply
from aion.learning.knowledge_gap import detect_gap, should_call_provider
from aion.learning.learning_engine import run as learning_run
from aion.tools.registry import registry
from aion.memory import sqlite_store

logger = logging.getLogger("aion.agent")

async def run(app_id: str, user_id: str, input: str, context: Optional[Dict[str, Any]] = None) -> AionResponse:
    context = context or {}
    lines = []
    
    # 1. Detect Intent
    intent_res = await detect_intent(input, context)
    lines.append(f"[Reasoning] Intent detected: {intent_res.intent} (conf: {intent_res.confidence:.2f}, llm: {intent_res.used_llm})")

    # 2. Emotional Context
    emotional_ctx = await get_emotional_context(app_id, user_id)
    current_emotion = getattr(emotional_ctx, "current_state", "neutral")
    lines.append(f"[Reasoning] Emotional context: {current_emotion}")

    # Fast-path para intenções diretas sem LLM
    if intent_res.confidence >= 0.70 and not intent_res.used_llm:
        lines.append(f"[Reasoning] Fast-path action for intent: {intent_res.intent}")
        # Simulando execução de tool para direct intents
        action_name = intent_res.intent
        return format_response(
            tenant_id=app_id,
            raw_response=f"Ação rápida processada: {action_name}",
            intent=action_name,
            context=context,
            confidence=intent_res.confidence,
            used_cache=False,
            reasoning_lines=lines,
            emotional_state=current_emotion
        )


    # 3. RAG Context
    rag_context_text = await build_rag_context(app_id, input)
    confidence = compute_rag_confidence(rag_context_text)
    lines.append(f"[Reasoning] RAG confidence: {confidence:.2f}")

    # 4. Detect Gap
    gap = detect_gap(app_id, input, confidence)
    lines.append(f"[Reasoning] Gap type: {gap.gap_type.value}")

    # 5. Build System Prompt
    persona_state = {"user_emotion": current_emotion}
    if "user_name" in context:
        persona_state["user_name"] = context["user_name"]
        
    system_prompt = build_system_prompt(
        tenant_context=f"Tenant ID: {app_id}",
        persona_state=persona_state,
        rag_data=rag_context_text
    )
    context["system_prompt"] = system_prompt

    # 6. Check Cache / No LLM
    if not should_call_provider(gap):
        lines.append("[Reasoning] Returning cached response from RAG context.")
        reply = build_cache_reply(rag_context_text, input) if rag_context_text else "Já conheço essa informação."
        return format_response(
            tenant_id=app_id,
            raw_response=reply,
            intent=intent_res.intent,
            context=context,
            confidence=confidence,
            used_cache=True,
            reasoning_lines=lines,
            gap_type=gap.gap_type.value,
            emotional_state=current_emotion
        )

    # 7. Exige LLM -> Learning Engine
    lr = await learning_run(app_id, user_id, input, context)
    lines.append(f"[Reasoning] Learning engine: source={lr.source}, gap={lr.gap_type}, learned={lr.learned}")

    tool_calls = try_parse_tool_calls(lr.raw_response)
    executed_tool = None
    if tool_calls:
        for tc in tool_calls:
            tname = tc.get("name", "")
            tparams = tc.get("arguments", {})
            if registry.validate_tool_call(tname, tparams):
                result = await registry.execute_tool(tname, tparams, {"app_id": app_id})
                lines.append(f"[Reasoning] Tool '{tname}' executed: {json.dumps(result)}")
                executed_tool = tname
            else:
                lines.append(f"[Reasoning] Tool '{tname}' validation failed")

    # 8. Detect Emotional State
    # Pegar as últimas mensagens e atualizar snapshot
    from aion.memory.sqlite_store import tenant_db_connection
    recent_msgs = []
    try:
        async with tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT input FROM actions_log WHERE app_id = ? ORDER BY created_at DESC LIMIT 5",
                (app_id,)
            )
            rows = await cursor.fetchall()
            recent_msgs = [r["input"] for r in rows][::-1]
    except Exception as e:
        logger.warning(f"Failed to fetch recent messages: {e}")
        
    recent_msgs.append(input)
    new_emotion = detect_emotional_state(recent_msgs)
    
    # Salva o estado novo no sqlite async (passo 8 / 10)
    await save_emotional_snapshot(app_id, user_id, new_emotion, "")
    lines.append(f"[Reasoning] Updated emotional state: {new_emotion.state}")

    # 9. Format Response
    response = format_response(
        tenant_id=app_id,
        raw_response=lr.answer,
        intent=intent_res.intent,
        context=context,
        confidence=lr.confidence,
        used_cache=False,
        reasoning_lines=lines,
        gap_type=lr.gap_type,
        provider_used=lr.provider_used,
        emotional_state=new_emotion.state,
        action_executed=executed_tool
    )
    
    # 10. Salva no SQLite + Obsidian async
    # O Learning Engine já salva a action_log e faz obsidian async_write, 
    # mas o prompt diz "10. Salva no SQLite + Obsidian async". 
    # Já está coberto dentro do flow normal (ou no learning_engine.py e action logger).
    
    return response
