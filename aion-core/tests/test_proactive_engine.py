import pytest
import datetime
from aion.persona.proactive_engine import (
    ProactiveTrigger, 
    get_proactive_trigger, 
    mark_trigger_used, 
    reset_cooldown,
    _inject_mock_trigger,
    _clear_mock_triggers
)

@pytest.mark.asyncio
async def test_proactive_engine():
    app_id = "test_app"
    user_id = "u123"
    
    _clear_mock_triggers()
    reset_cooldown(app_id, user_id)
    
    # Adiciona triggers com prioridades diferentes
    future_date = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
    
    t_daily = ProactiveTrigger(
        type="daily_briefing",
        priority=4,
        context_data={"tasks_count": 5},
        expires_at=future_date
    )
    t_alert = ProactiveTrigger(
        type="alert_critical",
        priority=1,
        context_data={"issue": "server down"},
        expires_at=future_date
    )
    
    _inject_mock_trigger(t_daily)
    _inject_mock_trigger(t_alert)
    
    # 1. Deve retornar o de maior prioridade (alert_critical)
    trigger = await get_proactive_trigger(app_id, user_id)
    assert trigger is not None
    assert trigger.type == "alert_critical"
    
    # 2. Marca como usado (ativa cooldown)
    mark_trigger_used(app_id, user_id, trigger)
    
    # 3. Tenta buscar de novo, deve retornar None por conta do cooldown
    trigger2 = await get_proactive_trigger(app_id, user_id)
    assert trigger2 is None
    
    # 4. Reseta o cooldown (simulando input de usuário no chat)
    reset_cooldown(app_id, user_id)
    
    # 5. Deve retornar agora, e continua sendo alert_critical porque não removemos do mock list
    # Em produção ele sairia da lista/BD, mas aqui focamos no cooldown/priority
    trigger3 = await get_proactive_trigger(app_id, user_id)
    assert trigger3 is not None
    assert trigger3.type == "alert_critical"
    
    _clear_mock_triggers()
