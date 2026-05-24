import time
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.manager")

RUNTIME_MODES = {"idle", "active", "paused", "error", "emergency_stop"}


class RuntimeState(BaseModel):
    running: bool = False
    active_sessions: int = 0
    active_jobs: int = 0
    scheduled_tasks: int = 0
    uptime_seconds: float = 0.0
    runtime_mode: str = "idle"
    started_at: Optional[str] = None
    total_jobs_completed: int = 0
    total_sessions_created: int = 0
    total_errors: int = 0
    last_error: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class RuntimeManager:
    def __init__(self):
        self._state = RuntimeState()
        self._start_time: Optional[float] = None
        self._active_jobs: Dict[str, Dict[str, Any]] = {}

    def start(self) -> None:
        if self._state.running:
            logger.warning("Runtime already running")
            return
        self._start_time = time.time()
        self._state.running = True
        self._state.runtime_mode = "active"
        self._state.started_at = datetime.datetime.utcnow().isoformat()
        self._touch()
        logger.info("Runtime started")

    def pause(self) -> None:
        if self._state.runtime_mode == "paused":
            return
        self._state.runtime_mode = "paused"
        self._touch()
        logger.info("Runtime paused")

    def resume(self) -> None:
        if self._state.runtime_mode != "paused":
            return
        self._state.runtime_mode = "active"
        self._touch()
        logger.info("Runtime resumed")

    def stop(self) -> None:
        self._state.running = False
        self._state.runtime_mode = "idle"
        self._state.active_jobs = 0
        self._state.active_sessions = 0
        self._active_jobs.clear()
        self._touch()
        logger.info("Runtime stopped")

    def register_job(self, job_id: str, job_type: str, description: str = "") -> bool:
        from aion.runtime.safety_governor import get_safety_governor
        governor = get_safety_governor()
        if not governor.check_can_start_job(len(self._active_jobs)):
            return False
        governor.register_job_start(job_id)
        self._active_jobs[job_id] = {
            "id": job_id,
            "type": job_type,
            "description": description,
            "started_at": datetime.datetime.utcnow().isoformat(),
            "status": "running",
        }
        self._state.active_jobs = len(self._active_jobs)
        self._touch()
        return True

    def complete_job(self, job_id: str, error: Optional[str] = None) -> None:
        from aion.runtime.safety_governor import get_safety_governor
        governor = get_safety_governor()
        governor.release_job(job_id)
        job = self._active_jobs.pop(job_id, None)
        if job:
            job["status"] = "failed" if error else "completed"
            job["error"] = error
            self._state.total_jobs_completed += 1
            if error:
                self._state.total_errors += 1
                self._state.last_error = error
        self._state.active_jobs = len(self._active_jobs)
        self._touch()

    def register_session(self) -> None:
        self._state.active_sessions += 1
        self._state.total_sessions_created += 1
        self._touch()

    def unregister_session(self) -> None:
        self._state.active_sessions = max(0, self._state.active_sessions - 1)
        self._touch()

    def get_state(self) -> RuntimeState:
        if self._start_time and self._state.running:
            self._state.uptime_seconds = round(time.time() - self._start_time, 1)
        return self._state

    def get_active_jobs(self) -> List[Dict[str, Any]]:
        return list(self._active_jobs.values())

    def set_mode(self, mode: str) -> None:
        if mode in RUNTIME_MODES:
            self._state.runtime_mode = mode
            self._touch()

    def check_timeouts(self) -> List[str]:
        from aion.runtime.safety_governor import get_safety_governor
        governor = get_safety_governor()
        timed_out: List[str] = []
        for job_id in list(self._active_jobs.keys()):
            if governor.check_job_timeout(job_id):
                self.complete_job(job_id, error=f"Timeout: job exceeded {governor.limits.job_timeout_seconds}s")
                timed_out.append(job_id)
        return timed_out

    def get_telemetry(self) -> Dict[str, Any]:
        state = self.get_state()
        return {
            "uptime_seconds": state.uptime_seconds,
            "active_sessions": state.active_sessions,
            "active_jobs": state.active_jobs,
            "mode": state.runtime_mode,
            "running": state.running,
            "total_jobs_completed": state.total_jobs_completed,
            "total_errors": state.total_errors,
            "last_error": state.last_error,
        }

    def _touch(self) -> None:
        self._state.updated_at = datetime.datetime.utcnow().isoformat()


_runtime_instance: Optional[RuntimeManager] = None


def get_runtime_manager() -> RuntimeManager:
    global _runtime_instance
    if _runtime_instance is None:
        _runtime_instance = RuntimeManager()
    return _runtime_instance
