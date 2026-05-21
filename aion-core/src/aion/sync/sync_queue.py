"""
Fila de Sincronização Local (Local First Queue).

Mantém itens no SQLite do tenant para serem enviados para a nuvem quando
houver disponibilidade.
"""

import json
import uuid
import logging
import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from aion.study.study_mode import _contains_sensitive
from aion.memory import sqlite_store

logger = logging.getLogger("aion.sync")


# ---------------------------------------------------------------------------
# Tipos Pydantic
# ---------------------------------------------------------------------------


class SyncItem(BaseModel):
    id: str
    app_id: str
    record_type: str
    record_id: str
    payload: Dict[str, Any]
    status: str = "pending"
    priority: int = 5
    attempts: int = 0
    last_error: Optional[str] = None
    created_at: str
    updated_at: str
    synced_at: Optional[str] = None


class SyncStatus(BaseModel):
    app_id: str
    pending: int = 0
    syncing: int = 0
    synced: int = 0
    failed: int = 0
    last_sync_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Funções Principais
# ---------------------------------------------------------------------------


async def enqueue_sync(
    app_id: str,
    record_type: str,
    record_id: str,
    payload: Dict[str, Any],
    priority: int = 5,
) -> Optional[str]:
    """
    Enfileira um item para sincronização futura.
    Se o payload contiver dados sensíveis, recusa o enfileiramento.
    """
    payload_str = json.dumps(payload, ensure_ascii=False)

    if _contains_sensitive(payload_str):
        logger.warning(
            "Tentativa de sincronizar dado sensível bloqueada. "
            "Type: %s, ID: %s", record_type, record_id
        )
        return None

    item_id = f"sync_{uuid.uuid4()}"
    now = datetime.datetime.utcnow().isoformat()

    try:
        await sqlite_store.provision_tenant(app_id)
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                INSERT INTO sync_queue
                (id, app_id, record_type, record_id, payload, status, priority, attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    app_id,
                    record_type,
                    record_id,
                    payload_str,
                    "pending",
                    priority,
                    0,
                    now,
                    now,
                ),
            )
            await conn.commit()
        return item_id
    except Exception as e:
        logger.error("Falha ao enfileirar sync item %s: %s", record_id, e)
        return None


async def get_pending_sync(app_id: str, limit: int = 50) -> List[SyncItem]:
    """Recupera itens pendentes de sincronização do tenant."""
    if not await sqlite_store.is_tenant_provisioned(app_id):
        return []

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            # Puxa pendentes e failed (com menos de 3 tentativas)
            cursor = await conn.execute(
                """
                SELECT * FROM sync_queue
                WHERE app_id = ? AND status IN ('pending', 'failed') AND attempts < 3
                ORDER BY priority DESC, created_at ASC
                LIMIT ?
                """,
                (app_id, limit),
            )
            rows = await cursor.fetchall()

            items = []
            for row in rows:
                items.append(
                    SyncItem(
                        id=row["id"],
                        app_id=row["app_id"],
                        record_type=row["record_type"],
                        record_id=row["record_id"],
                        payload=json.loads(row["payload"]),
                        status=row["status"],
                        priority=row["priority"],
                        attempts=row["attempts"],
                        last_error=row["last_error"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                        synced_at=row["synced_at"],
                    )
                )
            return items
    except Exception as e:
        logger.error("Falha ao buscar itens pendentes para %s: %s", app_id, e)
        return []


async def mark_synced(app_id: str, item_id: str) -> None:
    """Marca um item como sincronizado com sucesso."""
    now = datetime.datetime.utcnow().isoformat()
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                UPDATE sync_queue
                SET status = 'synced', synced_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, item_id),
            )
            await conn.commit()
    except Exception as e:
        logger.error("Falha ao marcar %s como synced: %s", item_id, e)


async def mark_failed(app_id: str, item_id: str, error: str) -> None:
    """Marca um item como falho, incrementando tentativas."""
    now = datetime.datetime.utcnow().isoformat()
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                UPDATE sync_queue
                SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (error, now, item_id),
            )
            await conn.commit()
    except Exception as e:
        logger.error("Falha ao marcar %s como failed: %s", item_id, e)


async def get_sync_status(app_id: str) -> SyncStatus:
    """Gera um relatório consolidado da fila de sincronização."""
    if not await sqlite_store.is_tenant_provisioned(app_id):
        return SyncStatus(app_id=app_id)

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT status, COUNT(*) as count FROM sync_queue WHERE app_id = ? GROUP BY status",
                (app_id,),
            )
            rows = await cursor.fetchall()

            counts = {"pending": 0, "syncing": 0, "synced": 0, "failed": 0}
            for row in rows:
                if row["status"] in counts:
                    counts[row["status"]] = row["count"]

            cursor_last = await conn.execute(
                "SELECT synced_at FROM sync_queue WHERE app_id = ? AND status = 'synced' ORDER BY synced_at DESC LIMIT 1",
                (app_id,),
            )
            row_last = await cursor_last.fetchone()
            last_sync = row_last["synced_at"] if row_last else None

            return SyncStatus(
                app_id=app_id,
                pending=counts["pending"],
                syncing=counts["syncing"],
                synced=counts["synced"],
                failed=counts["failed"],
                last_sync_at=last_sync,
            )
    except Exception as e:
        logger.error("Falha ao obter status de sync para %s: %s", app_id, e)
        return SyncStatus(app_id=app_id)


async def retry_failed_sync(app_id: str) -> dict:
    """
    Encontra itens com status='failed' do tenant.
    Se não houver nenhum, retorna {"retried": 0}.
    Se houver, muda o status para 'pending', reseta attempts e last_error,
    e atualiza o updated_at.
    Garante o isolamento por tenant.
    """
    if not await sqlite_store.is_tenant_provisioned(app_id):
        return {"retried": 0}

    now = datetime.datetime.utcnow().isoformat()
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            # Verifica se a tabela existe
            cursor = await conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'"
            )
            table_exists = await cursor.fetchone()
            if not table_exists:
                return {"retried": 0}

            # Conta quantos itens estão com status='failed'
            cursor_count = await conn.execute(
                "SELECT COUNT(*) as count FROM sync_queue WHERE app_id = ? AND status = 'failed'",
                (app_id,),
            )
            row = await cursor_count.fetchone()
            count = row["count"] if row else 0

            if count > 0:
                await conn.execute(
                    """
                    UPDATE sync_queue
                    SET status = 'pending', attempts = 0, last_error = NULL, updated_at = ?
                    WHERE app_id = ? AND status = 'failed'
                    """,
                    (now, app_id),
                )
                await conn.commit()

            return {"retried": count}
    except Exception as e:
        logger.error("Falha ao tentar resetar itens failed para pending para %s: %s", app_id, e)
        return {"retried": 0}

