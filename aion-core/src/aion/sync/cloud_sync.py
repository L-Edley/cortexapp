"""
Cloud Sync (Supabase Push).

Puxa os itens pendentes da fila local e empurra para a nuvem de forma resiliente.
"""

import time
import logging
import datetime
from typing import List
from pydantic import BaseModel, Field

from aion.config import settings
from aion.memory import supabase_store
from aion.sync.sync_queue import SyncItem, get_pending_sync, mark_synced, mark_failed

logger = logging.getLogger("aion.sync.cloud")


# ---------------------------------------------------------------------------
# Tipos Pydantic
# ---------------------------------------------------------------------------


class SyncReport(BaseModel):
    app_id: str
    attempted: int = 0
    synced: int = 0
    failed: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0
    errors: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


# ---------------------------------------------------------------------------
# Funções Principais
# ---------------------------------------------------------------------------


async def is_supabase_available() -> bool:
    """Verifica se o Supabase está ativado e disponível."""
    if not settings.SUPABASE_ENABLED or not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        return False

    # SupabaseStore já implementa fallback gracioso, então apenas instanciar
    # e testar conectividade básica via um método leve seria o ideal.
    # Por ora, se as chaves estão lá, assumimos disponibilidade inicial e 
    # deixamos o try/except cuidar das falhas de rede por registro.
    return True


async def push_item_to_supabase(item: SyncItem) -> bool:
    """
    Tenta empurrar um item individual para a nuvem.
    Retorna True se sucesso, False em caso de erro.
    """
    store = supabase_store.SupabaseStore(
        item.app_id, settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY
    )

    try:
        if item.record_type == "knowledge":
            await store.sync_knowledge(
                knowledge_id=item.record_id,
                content=item.payload.get("content", ""),
                tags=item.payload.get("tags", []),
                confidence=item.payload.get("confidence", 1.0),
                expires_at=item.payload.get("expires_at"),
            )
        elif item.record_type == "memory":
            await store.sync_memory(
                memory_id=item.record_id,
                content=item.payload.get("content", ""),
                mem_type=item.payload.get("type", "memory"),
                metadata=item.payload.get("metadata", {}),
                confidence=item.payload.get("confidence", 1.0),
            )
        elif item.record_type == "decision":
            await store.sync_decision(
                decision_id=item.record_id,
                content=item.payload.get("content", ""),
                reasoning=item.payload.get("reasoning", ""),
            )
        elif item.record_type == "study_report":
            ok = await store.save_study_report(item.app_id, item.payload)
            if not ok:
                return False
        elif item.record_type == "desktop_study_report":
            ok = await store.save_desktop_study_report(item.app_id, item.payload)
            if not ok:
                return False
        elif item.record_type == "teacher_knowledge":
            ok = await store.save_teacher_lesson(item.app_id, item.payload)
            if not ok:
                return False
        elif item.record_type == "dev_lesson":
            ok = await store.save_dev_lesson(item.app_id, item.payload)
            if not ok:
                return False
        else:
            logger.warning("Tipo de registro não reconhecido para sync nuvem: %s", item.record_type)
            return False

        return True
    except Exception as e:
        logger.error("Falha no push para Supabase (Item %s): %s", item.record_id, str(e))
        return False


async def sync_once(app_id: str, limit: int = 50) -> SyncReport:
    """
    Ciclo unitário de sincronização. Puxa pendentes, tenta empurrar, atualiza status local.
    """
    start_time = time.time()
    report = SyncReport(app_id=app_id)

    if not await is_supabase_available():
        logger.info("Supabase indisponível ou desativado. Sync pulado para tenant '%s'.", app_id)
        # Se não está habilitado, considera que pulou todos os pendentes
        pending = await get_pending_sync(app_id, limit=limit)
        report.skipped = len(pending)
        report.duration_seconds = round(time.time() - start_time, 2)
        return report

    items = await get_pending_sync(app_id, limit=limit)
    if not items:
        report.duration_seconds = round(time.time() - start_time, 2)
        return report

    report.attempted = len(items)

    for item in items:
        success = await push_item_to_supabase(item)
        if success:
            await mark_synced(app_id, item.id)
            report.synced += 1
        else:
            err = "Falha de conexão com a nuvem ou erro de parsing"
            await mark_failed(app_id, item.id, error=err)
            report.failed += 1
            if err not in report.errors:
                report.errors.append(err)

    report.duration_seconds = round(time.time() - start_time, 2)
    return report


async def sync_pending_to_supabase(app_id: str, limit: int = 50) -> SyncReport:
    """Orquestrador do push pra nuvem."""
    return await sync_once(app_id, limit)
