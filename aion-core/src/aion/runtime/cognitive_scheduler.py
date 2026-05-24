import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional, Callable
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.scheduler")

SCHEDULABLE_TASKS = {"study", "sync", "reflection", "provider_check", "memory_cleanup", "execution_review", "strategy_update", "research"}
INTERVALS = {"once", "hourly", "daily", "weekly"}


class ScheduledTask(BaseModel):
    id: str = ""
    task: str = "study"
    interval: str = "daily"
    hour: int = Field(default=3, ge=0, le=23)
    minute: int = Field(default=0, ge=0, le=59)
    params: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    last_run: Optional[str] = None
    success_count: int = 0
    failure_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class CognitiveScheduler:
    def __init__(self):
        self._tasks: Dict[str, ScheduledTask] = {}
        self._handlers: Dict[str, Callable] = {}

    def register_handler(self, task_type: str, handler: Callable) -> None:
        self._handlers[task_type] = handler

    def schedule(self, task: str, interval: str = "daily", hour: int = 3, minute: int = 0, params: Optional[Dict[str, Any]] = None) -> ScheduledTask:
        if task not in SCHEDULABLE_TASKS:
            task = "study"
        if interval not in INTERVALS:
            interval = "daily"
        scheduled = ScheduledTask(
            id=str(uuid.uuid4()),
            task=task,
            interval=interval,
            hour=hour,
            minute=minute,
            params=params or {},
        )
        self._tasks[scheduled.id] = scheduled
        logger.info("Scheduled task %s: %s at %02d:%02d (%s)", scheduled.id[:12], task, hour, minute, interval)
        return scheduled

    def cancel(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if task:
            task.enabled = False
            logger.info("Cancelled task %s: %s", task_id[:12], task.task)
            return True
        return False

    def remove(self, task_id: str) -> bool:
        return self._tasks.pop(task_id, None) is not None

    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        return self._tasks.get(task_id)

    def list_tasks(self, enabled_only: bool = False) -> List[ScheduledTask]:
        tasks = list(self._tasks.values())
        if enabled_only:
            tasks = [t for t in tasks if t.enabled]
        return sorted(tasks, key=lambda t: (t.hour, t.minute))

    def get_due_tasks(self) -> List[ScheduledTask]:
        now = datetime.datetime.utcnow()
        due: List[ScheduledTask] = []
        for task in self._tasks.values():
            if not task.enabled:
                continue
            if task.interval == "once" and task.last_run:
                continue
            if task.last_run:
                last = datetime.datetime.fromisoformat(task.last_run)
                if task.interval == "hourly" and (now - last).total_seconds() < 3600:
                    continue
                if task.interval == "daily" and (now - last).days < 1:
                    continue
                if task.interval == "weekly" and (now - last).days < 7:
                    continue
            if task.interval in ("daily", "weekly"):
                if now.hour < task.hour or (now.hour == task.hour and now.minute < task.minute):
                    continue
            due.append(task)
        return due

    async def run_due(self, app_id: str) -> List[str]:
        from aion.runtime.safety_governor import get_safety_governor
        from aion.runtime.runtime_manager import get_runtime_manager
        governor = get_safety_governor()
        runtime = get_runtime_manager()

        executed: List[str] = []
        for task in self.get_due_tasks():
            handler = self._handlers.get(task.task)
            if not handler:
                logger.debug("No handler for task type: %s", task.task)
                continue
            if not runtime.register_job(task.id, task.task, f"Scheduled: {task.task}"):
                logger.warning("Cannot run task %s: max jobs reached", task.id[:12])
                continue
            try:
                await handler(app_id, task)
                task.success_count += 1
                executed.append(task.id)
            except Exception as e:
                task.failure_count += 1
                logger.warning("Scheduled task %s failed: %s", task.id[:12], e)
                runtime.complete_job(task.id, error=str(e))
                continue
            task.last_run = datetime.datetime.utcnow().isoformat()
            runtime.complete_job(task.id)
        return executed

    def clear(self) -> None:
        self._tasks.clear()


_scheduler_instance: Optional[CognitiveScheduler] = None


def get_scheduler() -> CognitiveScheduler:
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = CognitiveScheduler()
    return _scheduler_instance
