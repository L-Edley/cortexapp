import pytest
from aion.persona.emotional_memory import detect_emotional_state, get_emotional_context

def test_detect_emotional_state():
    # Test neutral / default
    res = detect_emotional_state(["olá", "tudo bem"])
    assert res.state == "focused" or res.state == "neutral"

    # Test stressed
    res = detect_emotional_state([
        "estou travado nisso", 
        "muito difícil", 
        "não consigo resolver de jeito nenhum"
    ])
    assert res.state == "stressed"

    # Test blocked
    res = detect_emotional_state([
        "por que não funciona?",
        "erro de novo",
        "como faço isso?"
    ])
    assert res.state == "blocked"

    # Test energized
    res = detect_emotional_state([
        "tive uma ideia incrível",
        "vamos criar um novo projeto",
        "estou pensando em adicionar isso"
    ])
    assert res.state == "energized"

    # Test productive
    res = detect_emotional_state([
        "tarefa concluída",
        "adicionar novo registro",
        "feito"
    ])
    assert res.state == "productive"


@pytest.mark.asyncio
async def test_get_emotional_context_and_rules():
    # Sem banco real aqui, vamos testar o mock do SQLite ou só 
    # instanciar a nota baseada no estado se possível,
    # mas o método usa sqlite_store nativamente.
    # Vamos fazer um mock do sqlite_store pra retornar um estado.
    import aion.memory.sqlite_store
    
    class MockCursor:
        async def fetchall(self):
            return [{"state": "stressed", "confidence": 0.9, "created_at": "2024-01-01T12:00:00Z"}]
            
    class MockConn:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def execute(self, query, params):
            return MockCursor()
            
    # Patcheia temporariamente para o teste
    original = aion.memory.sqlite_store.tenant_db_connection
    try:
        aion.memory.sqlite_store.tenant_db_connection = lambda x: MockConn()
        ctx = await get_emotional_context("test_app", "user123")
        
        assert ctx.current_state == "stressed"
        # Garante a regra de NÃO mencionar
        assert "NUNCA mencione que ele está estressado" in ctx.context_note
        # Garante a instrução de ação
        assert "Respostas mais curtas" in ctx.context_note
        assert "Percebi que você está" not in ctx.context_note # O sistema não fala com o user no context_note, fala a regra pro LLM
    finally:
        aion.memory.sqlite_store.tenant_db_connection = original
