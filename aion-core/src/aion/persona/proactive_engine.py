import datetime
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from aion.voice.voice_reply_builder import build_voice_reply

logger = logging.getLogger("aion.persona.proactive")

class ProactiveTrigger(BaseModel):
    type: str
    priority: int
    context_data: Dict[str, Any]
    expires_at: str

class ProactiveMessage(BaseModel):
    text: str
    voice_reply: str
    trigger_type: str
    should_speak: bool = True
    actions_available: List[str]

# Estado em memória para controle de cooldown por usuário
# Chave: f"{app_id}::{user_id}"
# Valor: {"last_trigger_time": datetime, "waiting_user_input": bool}
_COOLDOWN_STATE: Dict[str, Dict[str, Any]] = {}

def reset_cooldown(app_id: str, user_id: str) -> None:
    """Chamado quando o usuário envia um input, liberando novos proativos."""
    key = f"{app_id}::{user_id}"
    if key in _COOLDOWN_STATE:
        _COOLDOWN_STATE[key]["waiting_user_input"] = False

async def get_proactive_trigger(app_id: str, user_id: str) -> Optional[ProactiveTrigger]:
    """
    Verifica triggers disponíveis em ordem de prioridade.
    Retorna None se houver cooldown ativo ou se nenhum trigger estiver válido.
    """
    key = f"{app_id}::{user_id}"
    state = _COOLDOWN_STATE.get(key, {})
    
    if state.get("waiting_user_input", False):
        logger.debug(f"Proactive cooldown ativo para {key}. Aguardando input do usuário.")
        return None
        
    # Na implementação real, consultaríamos bancos, integrações e jobs agendados.
    # Para o escopo atual, vamos simular a detecção baseada em dados dummy/mocks
    # ou deixar para o teste injetar os triggers.
    
    triggers = await _detect_triggers(app_id, user_id)
    if not triggers:
        return None
        
    # Ordena por prioridade (1 é mais urgente)
    triggers.sort(key=lambda t: t.priority)
    
    # Retorna o mais prioritário que não expirou
    now = datetime.datetime.utcnow().isoformat()
    for t in triggers:
        if t.expires_at > now:
            return t
            
    return None

def mark_trigger_used(app_id: str, user_id: str, trigger: ProactiveTrigger) -> None:
    """Marca o trigger como usado e ativa o cooldown."""
    key = f"{app_id}::{user_id}"
    _COOLDOWN_STATE[key] = {
        "last_trigger_time": datetime.datetime.utcnow(),
        "waiting_user_input": True,
        "last_trigger_type": trigger.type
    }
    logger.info(f"Trigger {trigger.type} marcado como usado para {key}.")

async def generate_proactive_message(trigger: ProactiveTrigger, context: Dict[str, Any]) -> ProactiveMessage:
    """
    Gera a mensagem via LLM (simulada ou real) usando a personalidade do AION e dados reais.
    """
    # Em produção, faríamos um call para o provider de LLM.
    # Aqui, construímos dinamicamente usando os context_data injetados pelo trigger
    # respeitando a regra: não genérica, max 3 frases.
    
    user_name = context.get("user_name", "Usuário")
    data = trigger.context_data
    
    if trigger.type == "alert_critical":
        issue = data.get("issue", "problema no sistema")
        text = f"{user_name}, temos um alerta crítico: {issue}. Recomendo verificar os logs imediatamente."
        actions = ["Verificar logs", "Ignorar"]
        
    elif trigger.type == "task_due":
        task_name = data.get("task_name", "tarefa pendente")
        hours = data.get("hours_left", 2)
        text = f"Atenção {user_name}, a tarefa '{task_name}' vence em {hours}h. Quer que eu prepare um rascunho base?"
        actions = ["Preparar rascunho", "Adiar 1h"]
        
    elif trigger.type == "pattern_detected":
        pattern = data.get("pattern", "queda de produtividade após o almoço")
        text = f"Notei um padrão recente: {pattern}. Podemos ajustar a agenda para mitigar isso."
        actions = ["Ver sugestão", "Ignorar"]
        
    elif trigger.type == "daily_briefing":
        tasks = data.get("tasks_count", 0)
        text = f"Bom dia, {user_name}. Você tem {tasks} tarefas para hoje e nenhuma reunião bloqueando sua manhã."
        actions = ["Ver lista completa"]
        
    elif trigger.type == "research_completed":
        topic = data.get("topic", "novo framework")
        text = f"Finalizei a pesquisa sobre '{topic}'. Encontrei 3 pontos chave que podem acelerar o projeto atual."
        actions = ["Ver resumo", "Salvar para depois"]
        
    elif trigger.type == "session_return":
        text = f"Bem-vindo de volta. Durante sua ausência, o sistema permaneceu estável e sem alertas."
        actions = []
        
    elif trigger.type == "weekly_report":
        text = f"Seu relatório semanal está pronto. O destaque foi a conclusão de 80% das metas estipuladas."
        actions = ["Abrir relatório"]
        
    else:
        text = f"Tenho uma nova atualização para você."
        actions = []

    # Se a mensagem passar de 3 frases, cortamos (regra do AION max 3 para proativo)
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)
    if len(sentences) > 3:
        text = " ".join(sentences[:3])
        
    voice = build_voice_reply(text)
    
    return ProactiveMessage(
        text=text,
        voice_reply=voice,
        trigger_type=trigger.type,
        should_speak=True,
        actions_available=actions
    )

# --- Para fins de teste/simulação de triggers ativos ---
_MOCK_ACTIVE_TRIGGERS: List[ProactiveTrigger] = []

def _inject_mock_trigger(trigger: ProactiveTrigger) -> None:
    _MOCK_ACTIVE_TRIGGERS.append(trigger)

def _clear_mock_triggers() -> None:
    _MOCK_ACTIVE_TRIGGERS.clear()

async def _detect_triggers(app_id: str, user_id: str) -> List[ProactiveTrigger]:
    # Retorna os mocks configurados. Na prática, bateria em BD e sistemas externos.
    return list(_MOCK_ACTIVE_TRIGGERS)
