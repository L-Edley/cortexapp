import os
import json
import uuid
import datetime
import asyncio
import logging
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import aiosqlite
from aion.config import settings

logger = logging.getLogger("aion.memory.sqlite_store")

# Dicionário global de locks por inquilino.
# Garante o requisito crítico: "Nunca abrir duas conexões simultâneas do mesmo tenant".
_tenant_locks: Dict[str, asyncio.Lock] = {}
_lock_registry_lock = asyncio.Lock()

async def get_tenant_lock(app_id: str) -> asyncio.Lock:
    """
    Recupera ou registra de forma thread-safe um asyncio.Lock associado ao app_id.
    """
    async with _lock_registry_lock:
        if app_id not in _tenant_locks:
            _tenant_locks[app_id] = asyncio.Lock()
        return _tenant_locks[app_id]

def get_db_path(app_id: str) -> str:
    """
    Gera o caminho seguro para o arquivo SQLite de um tenant.
    Garante o requisito: Um arquivo .sqlite por tenant (data/[app_id].sqlite).
    """
    safe_app_id = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
    if not safe_app_id:
        raise ValueError("Identificador do tenant/app_id inválido ou vazio.")
        
    base_dir = "data"
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, f"{safe_app_id}.sqlite")

@asynccontextmanager
async def tenant_db_connection(app_id: str):
    """
    Context manager assíncrono que adquire o lock do tenant
    e abre a conexão SQLite com aiosqlite, fechando-a automaticamente ao sair.
    Satisfaz a exigência: Nunca abre conexões concorrentes para o mesmo tenant.
    """
    lock = await get_tenant_lock(app_id)
    async with lock:
        db_path = get_db_path(app_id)
        async with aiosqlite.connect(db_path) as conn:
            # Garante que as linhas retornadas sejam mapeáveis por chave
            conn.row_factory = aiosqlite.Row
            yield conn

async def provision_tenant(app_id: str) -> None:
    """
    Cria fisicamente data/[app_id].sqlite se ele não existir
    e provisiona as tabelas base (memories, knowledge, decisions, actions_log).
    """
    async with tenant_db_connection(app_id) as conn:
        # Ativa WAL e checagem de chaves estrangeiras no banco
        await conn.execute("PRAGMA journal_mode=WAL;")
        await conn.execute("PRAGMA foreign_keys=ON;")
        
        # 1. Tabela: memories
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL,
                metadata TEXT, -- Serializado como JSON string
                confidence REAL NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        
        # 2. Tabela: knowledge
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                content TEXT NOT NULL,
                tags TEXT NOT NULL, -- Serializado como JSON string
                confidence REAL NOT NULL,
                expires_at TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # 3. Tabela: decisions
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                content TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        
        # 4. Tabela: actions_log
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS actions_log (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                input TEXT NOT NULL,
                output TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        
        # 5. Tabela: emotional_states
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS emotional_states (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                state TEXT NOT NULL,
                confidence REAL NOT NULL,
                context_summary TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # 6. Tabela: study_reports
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS study_reports (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                topics TEXT NOT NULL,
                summary TEXT NOT NULL,
                knowledge_saved INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                provider_used TEXT,
                duration_seconds REAL NOT NULL DEFAULT 0,
                warnings TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # 7. Tabela: study_jobs
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS study_jobs (
                id TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                report_id TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                finished_at TEXT
            )
        """)
        await conn.commit()
        logger.info(f"Tenant database provisioned successfully: '{app_id}'")

async def is_tenant_provisioned(app_id: str) -> bool:
    """
    Verifica se o arquivo do tenant existe e se todas as 4 tabelas foram criadas.
    """
    try:
        db_path = get_db_path(app_id)
    except ValueError:
        return False
        
    if not os.path.exists(db_path):
        return False
        
    try:
        async with tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memories', 'knowledge', 'decisions', 'actions_log')"
            )
            rows = await cursor.fetchall()
            return len(rows) == 4
    except Exception as e:
        logger.error(f"Erro ao verificar se o tenant '{app_id}' está provisionado: {e}")
        return False

async def save_memory(app_id: str, content: str, type: str, metadata: Optional[Dict[str, Any]], confidence: float = 1.0) -> str:
    """
    Salva uma nova memória na tabela memories. Retorna o ID gerado (UUID4).
    """
    await provision_tenant(app_id)
    mem_id = str(uuid.uuid4())
    created_at = datetime.datetime.utcnow().isoformat()
    metadata_json = json.dumps(metadata) if metadata is not None else None
    
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT INTO memories (id, app_id, content, type, metadata, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (mem_id, app_id, content, type, metadata_json, confidence, created_at)
        )
        await conn.commit()
        
    if settings.SUPABASE_ENABLED and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        from aion.memory.supabase_store import SupabaseStore
        store = SupabaseStore(app_id, settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        asyncio.create_task(store.sync_memory(mem_id, content, type, metadata, confidence))
        
    return mem_id

async def get_memories(app_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retorna memórias recentes de um inquilino ordenadas por created_at de forma decrescente.
    """
    if not await is_tenant_provisioned(app_id):
        return []
        
    async with tenant_db_connection(app_id) as conn:
        cursor = await conn.execute(
            """
            SELECT id, app_id, content, type, metadata, confidence, created_at
            FROM memories
            WHERE app_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (app_id, limit)
        )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            meta = None
            if r["metadata"]:
                try:
                    meta = json.loads(r["metadata"])
                except Exception:
                    meta = r["metadata"]
                    
            result.append({
                "id": r["id"],
                "app_id": r["app_id"],
                "content": r["content"],
                "type": r["type"],
                "metadata": meta,
                "confidence": r["confidence"],
                "created_at": r["created_at"]
            })
        return result

async def save_knowledge(app_id: str, content: str, tags: List[str], confidence: float = 1.0, expires_at: Optional[str] = None) -> str:
    """
    Salva um fragmento de conhecimento na tabela knowledge. Retorna o ID gerado (UUID4).
    """
    await provision_tenant(app_id)
    k_id = str(uuid.uuid4())
    created_at = datetime.datetime.utcnow().isoformat()
    tags_json = json.dumps(tags)
    
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT INTO knowledge (id, app_id, content, tags, confidence, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (k_id, app_id, content, tags_json, confidence, expires_at, created_at)
        )
        await conn.commit()
        
    if settings.SUPABASE_ENABLED and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        from aion.memory.supabase_store import SupabaseStore
        store = SupabaseStore(app_id, settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        asyncio.create_task(store.sync_knowledge(k_id, content, tags, confidence, expires_at))
        
    return k_id

async def search_knowledge(app_id: str, query: str) -> List[Dict[str, Any]]:
    """
    Busca por conhecimento contendo uma substring no conteúdo ou nas tags.
    Exclui entradas expiradas (expires_at no passado).
    """
    if not await is_tenant_provisioned(app_id):
        return []
        
    async with tenant_db_connection(app_id) as conn:
        like_query = f"%{query}%"
        now = datetime.datetime.utcnow().isoformat()
        cursor = await conn.execute(
            """
            SELECT id, app_id, content, tags, confidence, expires_at, created_at
            FROM knowledge
            WHERE app_id = ?
              AND (content LIKE ? OR tags LIKE ?)
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY created_at DESC
            """,
            (app_id, like_query, like_query, now)
        )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            parsed_tags = []
            if r["tags"]:
                try:
                    parsed_tags = json.loads(r["tags"])
                except Exception:
                    parsed_tags = [r["tags"]]
            result.append({
                "id": r["id"],
                "app_id": r["app_id"],
                "content": r["content"],
                "tags": parsed_tags,
                "confidence": r["confidence"],
                "expires_at": r["expires_at"],
                "created_at": r["created_at"]
            })
        return result

async def save_decision(app_id: str, content: str, reasoning: str) -> str:
    """
    Salva uma decisão estratégica ou de raciocínio. Retorna o ID gerado (UUID4).
    """
    await provision_tenant(app_id)
    dec_id = str(uuid.uuid4())
    created_at = datetime.datetime.utcnow().isoformat()
    
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT INTO decisions (id, app_id, content, reasoning, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (dec_id, app_id, content, reasoning, created_at)
        )
        await conn.commit()
        
    if settings.SUPABASE_ENABLED and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        from aion.memory.supabase_store import SupabaseStore
        store = SupabaseStore(app_id, settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        asyncio.create_task(store.sync_decision(dec_id, content, reasoning))
        
    return dec_id

async def log_action(app_id: str, action_type: str, input: str, output: str, status: str) -> str:
    """
    Registra uma ação executada pelo agente (actions_log). Retorna o ID gerado (UUID4).
    """
    await provision_tenant(app_id)
    act_id = str(uuid.uuid4())
    created_at = datetime.datetime.utcnow().isoformat()
    
    async with tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT INTO actions_log (id, app_id, action_type, input, output, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (act_id, app_id, action_type, input, output, status, created_at)
        )
        await conn.commit()
    return act_id
