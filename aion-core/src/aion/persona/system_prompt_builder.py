from typing import Dict, Any, List, Optional
from aion.persona.identity import AION_CORE_IDENTITY, AION_HARD_RULES

def build_system_prompt(
    tenant_context: str, 
    persona_state: Dict[str, Any], 
    rag_data: Optional[str] = None
) -> str:
    """
    Constrói o system prompt completo de forma dinâmica.
    Combina a identidade fixa do AION, contexto do tenant, estado do usuário,
    regras duras e dados do RAG em um texto conciso.
    """
    parts = []
    
    # 1. Identidade
    parts.append(AION_CORE_IDENTITY.strip())
    
    # 2. Contexto do Tenant (domínio da aplicação)
    if tenant_context:
        parts.append(f"\nCONTEXTO DO AMBIENTE (TENANT):\n  {tenant_context}")
        
    # 3 e 4. Perfil do Usuário e Estado Emocional
    user_profile = []
    if "user_name" in persona_state:
        user_profile.append(f"Nome do usuário: {persona_state['user_name']}")
    if "active_projects" in persona_state:
        user_profile.append(f"Projetos ativos: {', '.join(persona_state['active_projects'])}")
    if "user_patterns" in persona_state:
        user_profile.append(f"Padrões do usuário: {persona_state['user_patterns']}")
    if "user_emotion" in persona_state:
        user_profile.append(f"Estado emocional atual: {persona_state['user_emotion']}")
        
    if user_profile:
        parts.append("\nPERFIL DO USUÁRIO:")
        for up in user_profile:
            parts.append(f"  - {up}")
            
    # 5. Regras de Comportamento
    parts.append("\n" + AION_HARD_RULES.strip())
    
    # 6. Dados Relevantes do RAG (Memórias e Conhecimento)
    if rag_data and rag_data.strip():
        parts.append(f"\nCONTEXTO RECUPERADO (RAG - MEMÓRIA E CONHECIMENTO):\n{rag_data}")
        
    prompt = "\n".join(parts)
    
    # Limite prático para garantir que o system prompt não consuma todo o contexto (aprox. 3000 tokens)
    # Como heurística simples (1 token ~= 4 chars), cortamos no limite seguro de ~12000 chars
    max_chars = 12000
    if len(prompt) > max_chars:
        prompt = prompt[:max_chars] + "\n[Contexto truncado devido ao tamanho]"
        
    return prompt

def build_response_prompt(input_text: str, session_history: List[Dict[str, str]], context: Dict[str, Any]) -> str:
    """
    Constrói o prompt/mensagem final a ser enviado pelo usuário.
    Inclui as últimas 5 mensagens para continuidade e instruções de formato.
    """
    parts = []
    
    if session_history:
        # Pega no máximo as últimas 5 mensagens
        recent_history = session_history[-5:]
        parts.append("ÚLTIMAS MENSAGENS (Contexto da Sessão):")
        for msg in recent_history:
            role = "Usuário" if msg.get("role") == "user" else "AION"
            content = msg.get("content", "")
            parts.append(f"{role}: {content}")
        parts.append("") # Quebra de linha
        
    # Variáveis de contexto ambiente (ex: timezone, locale)
    if context:
        ctx_strs = []
        if "timezone" in context:
            ctx_strs.append(f"Timezone: {context['timezone']}")
        if "locale" in context:
            ctx_strs.append(f"Locale: {context['locale']}")
        if ctx_strs:
            parts.append(f"INFO DE AMBIENTE: {', '.join(ctx_strs)}\n")
            
    # Instrução de formato
    parts.append("Responda respeitando estritamente a PERSONALIDADE BASE e as REGRAS DURAS.")
    parts.append(f"\nMensagem atual do usuário:\n{input_text}")
    
    return "\n".join(parts)
