import json
import asyncio
import logging
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.agent")


class AionResponse(BaseModel):
    status: str = Field(default="success")
    tenant_id: str = Field(..., description="ID do tenant associado")
    reasoning_log: str = Field(default="", description="Log da cadeia de raciocínio")
    action_executed: Optional[str] = Field(default=None, description="Tool executada, se houver")
    ui_reply: str = Field(..., description="Resposta formatada para o usuário")
    response_source: str = Field(default="llm", description="Fonte: cache, enrich ou llm")
    confidence: float = Field(default=0.0, description="Nível de confiança do RAG")


async def run(app_id: str, user_id: str, input: str, context: Optional[Dict[str, Any]] = None) -> AionResponse:
    from aion.agent.reasoner import (
        build_rag_context,
        decide_response_source,
        compute_rag_confidence,
        build_cache_reply,
        try_parse_tool_calls,
    )
    from aion.tools.registry import registry

    context = context or {}
    lines = []

    rag_context = await build_rag_context(app_id, input)
    confidence = compute_rag_confidence(rag_context)
    source = decide_response_source(confidence, input, app_id)
    lines.append(f"[Reasoning] RAG confidence: {confidence:.2f}, source: {source}")

    if source == "cache":
        reply = build_cache_reply(rag_context, input)
        lines.append("[Reasoning] Returning cached response from RAG context.")
        return AionResponse(
            tenant_id=app_id,
            reasoning_log="\n".join(lines),
            ui_reply=reply,
            response_source=source,
            confidence=confidence,
        )

    from aion.learning.learning_engine import run as learning_run
    lr = await learning_run(app_id, user_id, input, context)
    lines.append(f"[Reasoning] Learning engine: source={lr.source}, gap={lr.gap_type}, learned={lr.learned}")

    action_executed = None
    tool_calls = try_parse_tool_calls(lr.raw_response)
    if tool_calls:
        for tc in tool_calls:
            tname = tc.get("name", "")
            tparams = tc.get("arguments", {})
            if registry.validate_tool_call(tname, tparams):
                result = await registry.execute_tool(tname, tparams, {"app_id": app_id})
                lines.append(f"[Reasoning] Tool '{tname}' executed: {json.dumps(result)}")
                action_executed = tname
            else:
                lines.append(f"[Reasoning] Tool '{tname}' validation failed")

    return AionResponse(
        tenant_id=app_id,
        reasoning_log="\n".join(lines),
        action_executed=action_executed,
        ui_reply=lr.answer,
        response_source=lr.source,
        confidence=lr.confidence,
    )
