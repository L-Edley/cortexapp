import pytest
from aion.persona.response_formatter import format_response, generate_follow_up
from aion.config import settings

def test_generate_follow_up():
    assert generate_follow_up("analysis", "aqui está a análise", {}) == "Quer que eu transforme os principais pontos em tarefas no seu backlog?"
    assert generate_follow_up("create_tasks_plan", "aqui estão as tarefas", {}) == "Posso agendar essas tarefas na sua lista principal. Prosseguir?"
    assert generate_follow_up("request_alt_plan", "ok", {}) == "Esse novo formato atende melhor suas expectativas?"
    assert generate_follow_up("unknown", "oi", {}) is None

def test_format_response_standard():
    raw_response = "Deploy falhou na Vercel. Corrija o bundle antes de abrir nova feature."
    intent = "analysis"
    context = {}
    
    settings.DEBUG = True
    
    response = format_response(
        tenant_id="cortex",
        raw_response=raw_response,
        intent=intent,
        context=context,
        confidence=0.91,
        used_cache=False,
        reasoning_lines=["Step 1: Check logs", "Step 2: Found Vercel error"],
        gap_type="strategic_analysis",
        provider_used="groq",
        emotional_state="focused"
    )
    
    assert response.status == "success"
    assert response.tenant_id == "cortex"
    assert response.ui_reply == raw_response
    assert response.voice_reply == "Deploy falhou na Vercel. Corrija o bundle antes de abrir nova feature."
    assert response.should_speak is True
    
    assert len(response.available_actions) == 1
    assert response.available_actions[0].id == "create_tasks_plan"
    
    assert response.follow_up == "Quer que eu transforme os principais pontos em tarefas no seu backlog?"
    
    assert response.data["used_cache"] is False
    assert response.data["confidence"] == 0.91
    
    assert response.debug is not None
    assert response.debug.intent == "analysis"
    assert response.debug.gap_type == "strategic_analysis"
    assert response.debug.provider_used == "groq"
    assert response.debug.emotional_state == "focused"
    assert "Step 1: Check logs" in response.debug.reasoning_log
    
    # Legacy fields
    assert response.reasoning_log == response.debug.reasoning_log
    assert response.action_executed is None
    assert response.response_source == "provider"

def test_format_response_no_debug():
    settings.DEBUG = False
    
    response = format_response(
        tenant_id="cortex",
        raw_response="Ação rápida",
        intent="create_task",
        context={},
        confidence=0.85,
        used_cache=False,
        reasoning_lines=[]
    )
    
    assert response.debug is None
    assert response.action_executed == "create_task"
    assert len(response.available_actions) == 0
    assert response.follow_up is None
