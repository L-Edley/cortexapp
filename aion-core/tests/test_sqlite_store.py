import os
import shutil
import pytest
import asyncio
from aion.memory import sqlite_store

@pytest.fixture(autouse=True)
def setup_and_teardown():
    """
    Fixture executada automaticamente para limpar o diretório 'data'
    antes e depois de cada cenário de teste, garantindo testes puros e isolados.
    """
    # Teardown inicial para evitar resquícios de rodadas passadas
    if os.path.exists("data"):
        try:
            shutil.rmtree("data")
        except Exception:
            pass
            
    yield
    
    # Teardown final para limpar dados criados durante os testes
    if os.path.exists("data"):
        try:
            shutil.rmtree("data")
        except Exception:
            pass

@pytest.mark.asyncio
async def test_tenant_provisioning_and_isolation():
    """
    Testa se o provisionamento cria as bases de forma independente
    e valida o isolamento físico absoluto de dados entre dois tenants distintos.
    """
    tenant_a = "tenant-cortex"
    tenant_b = "tenant-outropapp"
    
    # 1. Verifica estado inicial (não provisionado)
    assert await sqlite_store.is_tenant_provisioned(tenant_a) is False
    assert await sqlite_store.is_tenant_provisioned(tenant_b) is False
    
    # 2. Provisiona o Tenant A
    await sqlite_store.provision_tenant(tenant_a)
    assert await sqlite_store.is_tenant_provisioned(tenant_a) is True
    assert await sqlite_store.is_tenant_provisioned(tenant_b) is False
    
    # Verifica criação física isolada do arquivo
    assert os.path.exists(os.path.join("data", f"{tenant_a}.sqlite"))
    assert not os.path.exists(os.path.join("data", f"{tenant_b}.sqlite"))
    
    # 3. Salva dados no Tenant A
    meta = {"source": "voice", "device": "mobile"}
    mem_id_a = await sqlite_store.save_memory(tenant_a, "Lembrar de comprar pão", "todo", meta, 0.95)
    assert mem_id_a is not None
    
    # 4. Recupera e valida dados no Tenant A
    memories_a = await sqlite_store.get_memories(tenant_a)
    assert len(memories_a) == 1
    assert memories_a[0]["id"] == mem_id_a
    assert memories_a[0]["content"] == "Lembrar de comprar pão"
    assert memories_a[0]["metadata"] == meta
    assert memories_a[0]["confidence"] == 0.95
    
    # 5. Provisiona Tenant B e valida isolamento absoluto
    await sqlite_store.provision_tenant(tenant_b)
    assert await sqlite_store.is_tenant_provisioned(tenant_b) is True
    
    # Tenta obter as memórias do recém-criado Tenant B (deve estar vazio)
    memories_b = await sqlite_store.get_memories(tenant_b)
    assert len(memories_b) == 0  # Sem vazamento de dados do Tenant A!
    
    # 6. Salva dados no Tenant B e busca conhecimento
    k_id_b = await sqlite_store.save_knowledge(tenant_b, "Regra operacional: reuniões às quartas", ["reunioes", "regras"], 0.99)
    assert k_id_b is not None
    
    # Busca por termo no Tenant B
    results_b = await sqlite_store.search_knowledge(tenant_b, "reuniões")
    assert len(results_b) == 1
    assert results_b[0]["id"] == k_id_b
    assert results_b[0]["tags"] == ["reunioes", "regras"]
    
    # Busca pelo mesmo termo no Tenant A (deve retornar vazio!)
    results_a = await sqlite_store.search_knowledge(tenant_a, "reuniões")
    assert len(results_a) == 0

@pytest.mark.asyncio
async def test_decisions_and_actions_logging():
    """
    Testa a gravação e integridade de decisões e logs de ação por tenant.
    """
    tenant = "cortex-analytics"
    
    # 1. Salva Decisão
    dec_id = await sqlite_store.save_decision(tenant, "Habilitar modo noturno", "Foco em experiência visual premium em ambientes de baixa luminosidade.")
    assert dec_id is not None
    
    # Verifica a existência física consultando a base diretamente
    async with sqlite_store.tenant_db_connection(tenant) as conn:
        cursor = await conn.execute("SELECT * FROM decisions WHERE id = ?", (dec_id,))
        row = await cursor.fetchone()
        assert row is not None
        assert row["content"] == "Habilitar modo noturno"
        assert row["reasoning"] == "Foco em experiência visual premium em ambientes de baixa luminosidade."

    # 2. Registra Ação
    act_id = await sqlite_store.log_action(tenant, "web_search", "cotação do dólar hoje", "Dólar está a R$ 5,12", "success")
    assert act_id is not None
    
    async with sqlite_store.tenant_db_connection(tenant) as conn:
        cursor = await conn.execute("SELECT * FROM actions_log WHERE id = ?", (act_id,))
        row = await cursor.fetchone()
        assert row is not None
        assert row["action_type"] == "web_search"
        assert row["status"] == "success"

@pytest.mark.asyncio
async def test_concurrent_tenant_connections_safety():
    """
    Testa se o mecanismo de Lock de conexões por tenant funciona sob concorrência intensa,
    evitando erros de concorrência ou bloqueios ('database is locked') no SQLite.
    """
    tenant = "concurrency-tenant"
    await sqlite_store.provision_tenant(tenant)
    
    # Prepara gravação concorrente de 10 memórias em paralelo
    tasks = []
    for i in range(10):
        tasks.append(
            sqlite_store.save_memory(
                tenant,
                f"Gravação paralela número {i}",
                "concurrency_test",
                {"index": i}
            )
        )
        
    # Executa de forma simultânea via asyncio
    results = await asyncio.gather(*tasks)
    
    assert len(results) == 10
    assert len(set(results)) == 10  # Todos os IDs gerados devem ser únicos
    
    # Recupera tudo e valida a contagem
    memories = await sqlite_store.get_memories(tenant, limit=100)
    assert len(memories) == 10
