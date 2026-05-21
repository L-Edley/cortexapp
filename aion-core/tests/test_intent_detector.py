import pytest
from unittest.mock import patch, AsyncMock
from aion.intent.intent_detector import detect_intent, IntentResult

@pytest.mark.asyncio
async def test_intent_pattern_matching():
    # Deve detectar via padrao, rápido e sem LLM (used_llm=False)
    
    test_cases = [
        ("bota isso em tarefa amigao", "create_task"),
        ("criar tarefa de pão", "create_task"),
        ("nova tarefa para hoje", "create_task"),
        ("add tarefa de mercado", "create_task"),
        ("preciso fazer compras", "create_task"),
        
        ("salva esse insight sobre IA", "save_insight"),
        ("ideia genial que eu tive", "save_insight"),
        ("guarda essa ideia", "save_insight"),
        
        ("salva isso no db", "save_memory"),
        ("anota ai pra mim", "save_memory"),
        ("registra isso logo", "save_memory"),
        ("não esquece o pao", "save_memory"),
        
        ("esquece esse briefing", "dismiss_briefing"),
        ("ignora o alerta", "dismiss_briefing"),
        ("dispensa mano", "dismiss_briefing"),
        
        ("vai nesse plano ai", "accept_plan"),
        ("confirma pra mim", "accept_plan"),
        ("fechado", "accept_plan"),
        ("pode mandar ver", "accept_plan"),
        
        ("faz um plano diferente", "request_alt_plan"),
        ("alternativo pfv", "request_alt_plan"),
        ("tenta de novo", "request_alt_plan"),
        
        ("transforma em tarefas", "create_tasks_plan"),
        ("bota tudo em tarefa", "create_tasks_plan"),
        
        ("já vi valeu", "mark_seen"),
        ("ok obrigado", "mark_seen"),
        ("blz", "mark_seen"),
        
        ("resume isso", "summarize"),
        ("o que voce percebeu", "summarize"),
        ("faz um resumo", "summarize"),
        
        ("continua", "continue_session"),
        ("de onde paramos ontem", "continue_session"),
    ]
    
    for phrase, expected_intent in test_cases:
        res = await detect_intent(phrase, {})
        assert res.intent == expected_intent, f"Falha na frase: '{phrase}', esperado: {expected_intent}, obteve: {res.intent}"
        assert res.used_llm is False, f"Frase '{phrase}' não deveria usar LLM"
        assert res.confidence >= 0.70

@pytest.mark.asyncio
async def test_intent_fallback_to_llm():
    # Frases que não dão match semântico caem no LLM
    with patch("aion.intent.intent_detector._detect_via_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = IntentResult(intent="unknown", confidence=0.0, used_llm=True)
        res = await detect_intent("qual foi o nosso gasto com aws?", {})
        assert res.used_llm is True
        assert res.intent == "unknown"
