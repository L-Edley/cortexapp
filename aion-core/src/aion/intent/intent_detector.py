import re
import json
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger("aion.intent")

class IntentResult(BaseModel):
    intent: str
    confidence: float
    params: Dict[str, Any] = {}
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    used_llm: bool = False

def _detect_by_pattern(text: str) -> Optional[IntentResult]:
    text_clean = text.lower().strip()
    # Remove pontuação básica para facilitar match
    text_normalized = re.sub(r'[^\w\s]', '', text_clean)
    
    # 0. create_tasks_plan (prioridade alta para não ser engolido por create_task genérico)
    if re.search(r"transforma em tarefas|bota tudo em tarefa|gera as tarefas", text_normalized):
        return IntentResult(intent="create_tasks_plan", confidence=0.85, params={})

    # 1. create_task
    if re.search(r"criar tarefa|bota .* em tarefa|bota em tarefa|preciso fazer|nova tarefa|add tarefa", text_normalized):
        return IntentResult(intent="create_task", confidence=0.85, params={})
        
    # 2. save_insight
    if re.search(r"salva esse insight|guarda essa ideia|novo insight|ideia genial", text_normalized):
        return IntentResult(intent="save_insight", confidence=0.85, params={})

    # 3. save_memory (mais generico, avaliar depois de save_insight)
    if re.search(r"salva|anota|registra|n[aã]o esquece|lembra disso", text_normalized):
        return IntentResult(intent="save_memory", confidence=0.80, params={})
        
    # 4. dismiss_briefing
    if re.search(r"esquece esse briefing|ignora|dispensa|n[aã]o precisa de briefing", text_normalized):
        return IntentResult(intent="dismiss_briefing", confidence=0.85, params={})
        
    # 5. accept_plan
    if re.search(r"aceita|confirma|vai nesse plano|fechado|pode mandar ver|aprovado", text_normalized):
        return IntentResult(intent="accept_plan", confidence=0.85, params={})
        
    # 6. request_alt_plan
    if re.search(r"plano diferente|alternativo|tenta de novo|outro plano|n[aã]o gostei desse", text_normalized):
        return IntentResult(intent="request_alt_plan", confidence=0.85, params={})
        
    # 8. mark_seen
    if re.search(r"ja vi|ciente|ok obrigado|ok|valeu|entendido|blz", text_normalized):
        return IntentResult(intent="mark_seen", confidence=0.90, params={})
        
    # 9. summarize
    if re.search(r"resume|o que voce percebeu|o que voc[eê] percebeu|me conta|resumo de|faz um resumo", text_normalized):
        return IntentResult(intent="summarize", confidence=0.85, params={})
        
    # 10. continue_session
    if re.search(r"continua|de onde paramos|retoma|continuando", text_normalized):
        return IntentResult(intent="continue_session", confidence=0.85, params={})
        
    return None

async def _detect_via_llm(text: str, context: Dict[str, Any]) -> IntentResult:
    """Usa LLM para classificar intenções complexas e extrair parâmetros."""
    try:
        from aion.llm import factory as llm_factory
        provider = await llm_factory.get_llm_provider()
    except Exception:
        # Fallback sem provider
        return IntentResult(intent="unknown", confidence=0.0, used_llm=True)

    prompt = f"""
Você é um classificador de intenções. Dado o input do usuário, classifique a intenção em UMA destas categorias estritas:
- query: pergunta geral sobre dados/projetos/conhecimento.
- analysis: pede análise estratégica ou opinião elaborada.
- record_finance: registra um gasto ou receita financeira (extraia valor e descrição).
- record_habit: registra um hábito (extraia o hábito).
- unknown: se não for nada disso.

Retorne APENAS um JSON válido.
Formato:
{{
  "intent": "nome",
  "confidence": 0.0 a 1.0,
  "params": {{}},
  "needs_clarification": false,
  "clarification_question": null
}}

Input: "{text}"
"""
    messages = [
        {"role": "system", "content": "Return only raw JSON."},
        {"role": "user", "content": prompt}
    ]
    
    try:
        response_text = await provider(messages)
        # Limpa possível markdown
        response_text = response_text.replace("```json", "").replace("```", "").strip()
        data = json.loads(response_text)
        
        return IntentResult(
            intent=data.get("intent", "unknown"),
            confidence=float(data.get("confidence", 0.5)),
            params=data.get("params", {}),
            needs_clarification=data.get("needs_clarification", False),
            clarification_question=data.get("clarification_question"),
            used_llm=True
        )
    except Exception as e:
        logger.warning(f"Erro ao classificar intenção via LLM: {e}")
        return IntentResult(intent="unknown", confidence=0.0, used_llm=True)


async def detect_intent(input_text: str, context: Dict[str, Any]) -> IntentResult:
    """
    Detecta a intenção principal do input do usuário.
    Tenta primeiro por padrões sintáticos/semânticos locais.
    Se a confiança for baixa, escala para LLM.
    """
    if not input_text or not input_text.strip():
        return IntentResult(intent="unknown", confidence=1.0)
        
    result_pattern = _detect_by_pattern(input_text)
    
    if result_pattern and result_pattern.confidence >= 0.70:
        return result_pattern
        
    # Se padrão falhou, vai pro LLM
    result_llm = await _detect_via_llm(input_text, context)
    return result_llm
