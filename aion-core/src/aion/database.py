import os
import sqlite3
import logging
from aion.config import settings

logger = logging.getLogger("aion.database")

def init_tenant_db(conn: sqlite3.Connection):
    """
    Cria a estrutura inicial das tabelas necessárias do Cortex/Aion
    se elas não existirem no arquivo SQLite do tenant.
    """
    cursor = conn.cursor()
    
    # 1. Tabela: records
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS records (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT NOT NULL,
            project TEXT,
            amount REAL,
            category TEXT,
            dueDate TEXT,
            nextAction TEXT,
            status TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            syncedAt TEXT,
            rawInput TEXT
        )
    """)
    
    # 2. Tabela: brain_items
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS brain_items (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT NOT NULL, -- Serializado como JSON Array
            source TEXT NOT NULL,
            confidence REAL NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            lastUsedAt TEXT,
            expiresAt TEXT
        )
    """)
    
    # 3. Tabela: search_cache
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_cache (
            id TEXT PRIMARY KEY,
            query TEXT NOT NULL,
            response TEXT NOT NULL,
            tags TEXT NOT NULL, -- Serializado como JSON Array
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL
        )
    """)
    
    conn.commit()

def provision_tenant(tenant_id: str) -> str:
    """
    Garante que o banco de dados do tenant esteja provisionado e com o esquema correto.
    Retorna o caminho absoluto do arquivo sqlite criado/carregado.
    """
    db_dir = os.path.join(settings.DATABASE_DIR, tenant_id)
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "cortex.db")
    
    try:
        conn = sqlite3.connect(db_path, timeout=30.0)
        # Otimizações de concorrência e integridade do SQLite
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        init_tenant_db(conn)
        conn.close()
        logger.info(f"Database provisioned successfully for tenant '{tenant_id}' at {db_path}")
    except sqlite3.Error as e:
        logger.error(f"Failed to provision database for tenant '{tenant_id}': {e}")
        raise e
        
    return db_path
