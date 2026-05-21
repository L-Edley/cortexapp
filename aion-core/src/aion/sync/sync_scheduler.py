"""
Agendador de Sincronização em Background.

Periodicamente dispara o push_to_supabase sem travar o Event Loop principal.
"""

import logging
from typing import Dict, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from aion.sync.cloud_sync import sync_pending_to_supabase

logger = logging.getLogger("aion.sync.scheduler")

# Instância global do agendador
_scheduler = AsyncIOScheduler()
_scheduler_started = False


async def run_scheduled_sync(app_id: str) -> None:
    """Wrapper assíncrono chamado pelo scheduler para rodar o sync."""
    try:
        report = await sync_pending_to_supabase(app_id)
        if report.attempted > 0:
            logger.info(
                "Background Sync [Tenant: %s] finalizado: %d tentados, %d sucesso, %d erro. (%.2fs)",
                app_id, report.attempted, report.synced, report.failed, report.duration_seconds
            )
    except Exception as e:
        logger.error("Erro fatal no background sync do tenant %s: %s", app_id, e)


def schedule_cloud_sync(app_id: str, interval_minutes: int = 15) -> None:
    """Agenda sincronização recorrente para um tenant específico."""
    global _scheduler_started

    if not _scheduler_started:
        _scheduler.start()
        _scheduler_started = True

    job_id = f"sync_{app_id}"

    # Remove se já existir para não duplicar
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    _scheduler.add_job(
        run_scheduled_sync,
        IntervalTrigger(minutes=interval_minutes),
        args=[app_id],
        id=job_id,
        name=f"Cloud Sync para {app_id}",
        replace_existing=True,
    )
    logger.info("Cloud Sync agendado para o tenant '%s' a cada %d minutos.", app_id, interval_minutes)


def get_sync_schedule_status(app_id: str) -> Dict[str, Any]:
    """Retorna o status do agendamento para um tenant."""
    job_id = f"sync_{app_id}"
    job = _scheduler.get_job(job_id)

    if not job:
        return {"app_id": app_id, "scheduled": False}

    return {
        "app_id": app_id,
        "scheduled": True,
        "interval_minutes": job.trigger.interval.total_seconds() / 60 if hasattr(job.trigger, 'interval') else None,
        "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
    }
