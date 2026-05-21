import pytest
from typing import Dict, Any

from aion.agent.agent import run as agent_run
from aion.persona.response_formatter import AionResponse
from aion.config import settings

@pytest.mark.asyncio
async def test_full_persona_integration_flow():
    app_id = "test_persona_app"
    user_id = "u_456"
    
    settings.DEBUG = True
    
    # Simula 3 requests seguidos
    inputs = [
        "me faça uma análise estratégica da tesla vs byd",
        "salva essa ideia de investir mais no mercado chinês",
        "qual foi a minha última ideia que salvei?"
    ]
    
    for idx, inp in enumerate(inputs):
        response: AionResponse = await agent_run(app_id, user_id, inp, context={})
        
        # Validando estruturação
        assert response.status == "success"
        assert response.tenant_id == app_id
        assert response.should_speak is True
        assert len(response.voice_reply) > 0
        
        # O debug deve conter as informações de personalidade injetadas
        assert response.debug is not None
        assert response.debug.emotional_state is not None
        assert len(response.debug.reasoning_log) > 0
        
        # Valida regra fundamental (não inicia com expressões chatas)
        ui_lower = response.ui_reply.lower().strip()
        assert not ui_lower.startswith("claro!"), "AION não deve iniciar com 'Claro!'"
        assert not ui_lower.startswith("claro,"), "AION não deve iniciar com 'Claro,'"
        assert not ui_lower.startswith("ótimo!"), "AION não deve iniciar com 'Ótimo!'"
        assert not ui_lower.startswith("ótimo,"), "AION não deve iniciar com 'Ótimo,'"
        assert not ui_lower.startswith("com certeza"), "AION não deve iniciar com 'Com certeza'"
