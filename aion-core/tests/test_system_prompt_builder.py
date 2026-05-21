import pytest
from aion.persona.system_prompt_builder import build_system_prompt, build_response_prompt

def test_build_system_prompt():
    tenant_context = "App de Produtividade Pessoal"
    persona_state = {
        "user_name": "Edley",
        "active_projects": ["AION Core", "Córtex"],
        "user_emotion": "frustrado com bugs",
    }
    rag_data = "Memória 1: Gosta de respostas rápidas."
    
    prompt1 = build_system_prompt(tenant_context, persona_state, rag_data)
    
    # Validações estruturais do system prompt
    assert "Você é o AION. Direto, econômico com palavras." in prompt1
    assert "REGRAS DURAS" in prompt1
    assert "Nunca mais de 4 frases numa resposta casual." in prompt1
    assert "CONTEXTO DO AMBIENTE (TENANT)" in prompt1
    assert "App de Produtividade Pessoal" in prompt1
    assert "Nome do usuário: Edley" in prompt1
    assert "Estado emocional atual: frustrado com bugs" in prompt1
    assert "CONTEXTO RECUPERADO (RAG - MEMÓRIA E CONHECIMENTO)" in prompt1
    assert "Gosta de respostas rápidas." in prompt1
    
    # Request seguido com as mesmas entradas deve gerar o mesmo system prompt (stateless logic)
    prompt2 = build_system_prompt(tenant_context, persona_state, rag_data)
    assert prompt1 == prompt2

def test_build_response_prompt():
    session_history = [
        {"role": "user", "content": "Oi AION, qual o status?"},
        {"role": "assistant", "content": "Tudo operacional, Edley."},
        {"role": "user", "content": "Ótimo. O que eu ia fazer mesmo?"}
    ]
    context = {"timezone": "America/Sao_Paulo", "locale": "pt-BR"}
    input_text = "E agora?"
    
    prompt1 = build_response_prompt(input_text, session_history, context)
    
    # Validações estruturais
    assert "ÚLTIMAS MENSAGENS (Contexto da Sessão):" in prompt1
    assert "Usuário: Oi AION, qual o status?" in prompt1
    assert "AION: Tudo operacional, Edley." in prompt1
    assert "Timezone: America/Sao_Paulo" in prompt1
    assert "Locale: pt-BR" in prompt1
    assert "Responda respeitando estritamente a PERSONALIDADE BASE e as REGRAS DURAS." in prompt1
    assert "E agora?" in prompt1

    # Segunda chamada simulando o request em si garantindo que é determinístico
    prompt2 = build_response_prompt(input_text, session_history, context)
    assert prompt1 == prompt2
