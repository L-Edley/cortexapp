import logging
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

from aion.voice.voice_reply_builder import build_voice_reply
from aion.config import settings

logger = logging.getLogger("aion.persona.formatter")

class Action(BaseModel):
    id: str
    label: str

class DebugInfo(BaseModel):
    intent: str
    gap_type: Optional[str] = None
    provider_used: Optional[str] = None
    reasoning_log: str = ""
    emotional_state: Optional[str] = None

class AionResponse(BaseModel):
    status: str = "success"
    tenant_id: str
    ui_reply: str
    voice_reply: str
    should_speak: bool = True
    available_actions: List[Action] = []
    follow_up: Optional[str] = None
    data: Dict[str, Any]
    debug: Optional[DebugInfo] = None
    
    # Manter compatibilidade legada por enquanto se tiver dependência interna
    reasoning_log: str = ""
    action_executed: Optional[str] = None
    response_source: str = "llm"
    confidence: float = 0.0

def generate_follow_up(intent: str, response: str, context: Dict[str, Any]) -> Optional[str]:
    """
    Retorna uma pergunta natural de acompanhamento baseada na intenção.
    Apenas quando genuinamente faz sentido (não forçado).
    """
    # Exemplo: se acabamos de apresentar uma análise profunda, podemos perguntar se quer que transforme em task.
    if intent == "analysis":
        return "Quer que eu transforme os principais pontos em tarefas no seu backlog?"
    
    # Se gerou uma lista de tarefas ou rascunho de plano
    if intent == "create_tasks_plan":
        return "Posso agendar essas tarefas na sua lista principal. Prosseguir?"
        
    if intent == "request_alt_plan":
        return "Esse novo formato atende melhor suas expectativas?"
        
    return None

def _get_available_actions(intent: str) -> List[Action]:
    actions = []
    if intent in ["analysis", "query"]:
        actions.append(Action(id="create_tasks_plan", label="Transformar em tarefas"))
    elif intent == "create_tasks_plan":
        actions.append(Action(id="accept_plan", label="Aceitar plano"))
        actions.append(Action(id="request_alternative", label="Plano alternativo"))
    return actions

def format_response(
    tenant_id: str,
    raw_response: str,
    intent: str,
    context: Dict[str, Any],
    confidence: float,
    used_cache: bool,
    reasoning_lines: List[str],
    gap_type: Optional[str] = None,
    provider_used: Optional[str] = None,
    emotional_state: Optional[str] = None,
    action_executed: Optional[str] = None
) -> AionResponse:
    """
    Formata a resposta de texto crua para o schema estruturado do AION Core.
    """
    ui_reply = raw_response.strip()
    voice_reply = build_voice_reply(ui_reply)
    follow_up = generate_follow_up(intent, ui_reply, context)
    actions = _get_available_actions(intent)
    
    debug_info = None
    if settings.DEBUG:
        debug_info = DebugInfo(
            intent=intent,
            gap_type=gap_type,
            provider_used=provider_used,
            reasoning_log="\n".join(reasoning_lines),
            emotional_state=emotional_state
        )
        
    return AionResponse(
        status="success",
        tenant_id=tenant_id,
        ui_reply=ui_reply,
        voice_reply=voice_reply,
        should_speak=True,
        available_actions=actions,
        follow_up=follow_up,
        data={
            "used_cache": used_cache,
            "confidence": confidence
        },
        debug=debug_info,
        
    # Campos de transição
        reasoning_log="\n".join(reasoning_lines),
        action_executed=action_executed if action_executed else (intent if intent in ["create_task", "save_memory", "save_insight", "dismiss_briefing", "accept_plan", "request_alt_plan", "mark_seen"] else None),
        response_source="cache" if used_cache else "provider",
        confidence=confidence
    )
