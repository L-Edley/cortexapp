import os
import sqlite3
import logging
from typing import Generator
from fastapi import Header, HTTPException, status
from app.config import settings

logger = logging.getLogger("aion.database")

def init_tenant_db(conn: sqlite3.Connection):
    """
    Inicializa o banco de dados do tenant criando as tabelas necessárias
    se elas não existirem, garantindo compatibilidade com o esquema do Cortex.
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

def get_db(x_tenant_id: str = Header(..., alias="X-Tenant-ID")) -> Generator[sqlite3.Connection, None, None]:
    """
    Injeta dinamicamente a conexão com o banco de dados SQLite correspondente ao tenant.
    Extrai o ID do tenant a partir do cabeçalho 'X-Tenant-ID'.
    """
    if not x_tenant_id or x_tenant_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O cabeçalho 'X-Tenant-ID' é obrigatório e não pode ser vazio."
        )
        
    # Sanitização básica de caminho para o tenant_id
    safe_tenant_id = "".join(c for c in x_tenant_id if c.isalnum() or c in ("-", "_")).strip()
    if not safe_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID de Tenant inválido."
        )

    # Garante que a pasta de dados do tenant exista
    db_dir = os.path.join(settings.DATABASE_DIR, safe_tenant_id)
    os.makedirs(db_dir, exist_ok=True)
    
    db_path = os.path.join(db_dir, "cortex.db")
    
    try:
        # Estabelece conexão com timeout para lidar com acessos simultâneos
        conn = sqlite3.connect(db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        
        # Otimizações de desempenho e concorrência SQLite
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        
        # Garante que as tabelas necessárias estejam criadas
        init_tenant_db(conn)
        
        yield conn
        
    except sqlite3.Error as e:
        logger.error(f"Erro de banco de dados para tenant {safe_tenant_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno de acesso ao banco de dados: {str(e)}"
        )
    finally:
        conn.close()
