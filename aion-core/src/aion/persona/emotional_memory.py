import datetime
import uuid
import logging
from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.persona.emotional")

StateLiteral = Literal["focused", "stressed", "productive", "blocked", "energized", "neutral"]

class EmotionalState(BaseModel):
    state: StateLiteral
    confidence: float

class EmotionalContext(BaseModel):
    current_state: StateLiteral
    confidence: float
    trend: Literal["improving", "stable", "declining", "none"]
    last_updated: Optional[str]
    context_note: str

def detect_emotional_state(recent_messages: List[str]) -> EmotionalState:
    """
    Analisa as últimas mensagens para detectar o estado emocional do usuário.
    Não analisa uma mensagem isolada - exige padrão (ou pelo menos fallback para neutral se muito curto).
    """
    if not recent_messages:
        return EmotionalState(state="neutral", confidence=1.0)
        
    text = " ".join(recent_messages).lower()
    
    # Heurísticas simples baseadas nos requisitos (para v1, poderia ser LLM)
    stressed_words = ["travado", "não consigo", "muito", "difícil", "urgente", "estressado"]
    energized_words = ["ideia", "novo projeto", "muitas ideias", "criar", "vamos", "pensando"]
    productive_words = ["tarefa", "feito", "concluído", "adicionar", "salvar", "registrar"]
    blocked_words = ["erro", "como faço", "por que não", "não entendi", "tentando mas"]
    
    counts = {
        "stressed": sum(1 for w in stressed_words if w in text),
        "energized": sum(1 for w in energized_words if w in text),
        "productive": sum(1 for w in productive_words if w in text),
        "blocked": sum(1 for w in blocked_words if w in text),
    }
    
    max_state = max(counts, key=counts.get)
    max_count = counts[max_state]
    
    if max_count >= 2:
        return EmotionalState(state=max_state, confidence=0.8 + (0.05 * min(max_count, 4)))
    
    # Focused: mensagens curtas e objetivas
    avg_length = sum(len(m.split()) for m in recent_messages) / len(recent_messages)
    if avg_length < 10 and len(recent_messages) >= 3:
        return EmotionalState(state="focused", confidence=0.75)
        
    return EmotionalState(state="neutral", confidence=0.9)


async def save_emotional_snapshot(app_id: str, user_id: str, state: EmotionalState, context_summary: str) -> None:
    """
    Salva snapshot no SQLite. Limita a 1 por hora por usuário.
    """
    from aion.memory import sqlite_store
    
    now = datetime.datetime.utcnow()
    one_hour_ago = (now - datetime.timedelta(hours=1)).isoformat()
    
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            # Verifica se já existe snapshot na última hora
            cursor = await conn.execute(
                "SELECT id FROM emotional_states WHERE app_id = ? AND user_id = ? AND created_at >= ?",
                (app_id, user_id, one_hour_ago)
            )
            row = await cursor.fetchone()
            if row:
                logger.debug(f"Snapshot emocional ignorado. Já existe um recente para {user_id} em {app_id}")
                return
                
            snapshot_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO emotional_states (id, app_id, user_id, state, confidence, context_summary, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (snapshot_id, app_id, user_id, state.state, state.confidence, context_summary, now.isoformat())
            )
            await conn.commit()
    except Exception as e:
        logger.error(f"Erro ao salvar snapshot emocional: {e}")

async def get_emotional_context(app_id: str, user_id: str) -> EmotionalContext:
    """
    Retorna estado atual e tendência, e gera a context_note (regras de comportamento)
    baseada no estado.
    """
    from aion.memory import sqlite_store
    
    states_history = []
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT state, confidence, created_at FROM emotional_states "
                "WHERE app_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 3",
                (app_id, user_id)
            )
            states_history = await cursor.fetchall()
    except Exception as e:
        logger.error(f"Erro ao recuperar histórico emocional: {e}")
        
    if not states_history:
        return EmotionalContext(
            current_state="neutral",
            confidence=1.0,
            trend="none",
            last_updated=None,
            context_note="Usuário em estado neutro."
        )
        
    current = states_history[0]
    
    # Calcula trend basico
    trend = "stable"
    if len(states_history) >= 2:
        prev = states_history[1]
        # Heurística simples de melhora/piora (ex: stressed -> neutral é improving)
        negative_states = ["stressed", "blocked"]
        positive_states = ["energized", "productive", "focused"]
        
        if prev["state"] in negative_states and current["state"] not in negative_states:
            trend = "improving"
        elif prev["state"] not in negative_states and current["state"] in negative_states:
            trend = "declining"
        elif prev["state"] == current["state"]:
            trend = "stable"
            
    state_str = current["state"]
    
    # Regras de comportamento:
    rules = {
        "stressed": "AJA: Respostas mais curtas, diretas, sem sugestões extras. NUNCA mencione que ele está estressado.",
        "blocked": "AJA: Faça UMA pergunta para identificar o nó real do problema. NUNCA mencione que ele está bloqueado.",
        "energized": "AJA: Pode fazer follow-up e expandir a ideia mencionada. Acompanhe a energia.",
        "focused": "AJA: Mínimo de interrupção, resposta 100% objetiva.",
        "productive": "AJA: Continue suportando os registros de forma rápida e eficiente.",
        "neutral": "AJA: Siga a personalidade base normalmente."
    }
    
    note = f"ESTADO DETECTADO: {state_str}. {rules.get(state_str, rules['neutral'])}"
    
    return EmotionalContext(
        current_state=state_str,
        confidence=current["confidence"],
        trend=trend,
        last_updated=current["created_at"],
        context_note=note
    )
