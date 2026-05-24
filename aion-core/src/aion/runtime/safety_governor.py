import logging
import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.safety_governor")


class SafetyLimits(BaseModel):
    max_background_jobs: int = Field(default=5, ge=1, le=20)
    max_session_duration_hours: float = Field(default=2.0, ge=0.5, le=24.0)
    max_provider_calls_per_job: int = Field(default=20, ge=1, le=100)
    max_research_depth: int = Field(default=10, ge=1, le=50)
    max_reflection_chain: int = Field(default=3, ge=1, le=10)
    max_memory_per_job_mb: float = Field(default=50.0, ge=1.0, le=500.0)
    job_timeout_seconds: int = Field(default=300, ge=30, le=3600)
    max_concurrent_sessions: int = Field(default=10, ge=1, le=50)
    max_goal_milestones: int = Field(default=20, ge=1, le=100)
    max_notifications: int = Field(default=200, ge=10, le=1000)


class SafetyGovernor:
    def __init__(self, limits: Optional[SafetyLimits] = None):
        self.limits = limits or SafetyLimits()
        self._job_timestamps: Dict[str, float] = {}
        self._provider_call_counts: Dict[str, int] = {}
        self._reflection_chain_counts: Dict[str, int] = {}
        self._emergency_stop: bool = False

    def check_can_start_job(self, active_jobs: int) -> bool:
        if self._emergency_stop:
            logger.warning("Emergency stop active — no new jobs allowed")
            return False
        if active_jobs >= self.limits.max_background_jobs:
            logger.warning("Max background jobs reached (%d)", self.limits.max_background_jobs)
            return False
        return True

    def register_job_start(self, job_id: str) -> None:
        self._job_timestamps[job_id] = time.time()
        self._provider_call_counts[job_id] = 0
        self._reflection_chain_counts[job_id] = 0

    def check_job_timeout(self, job_id: str) -> bool:
        start = self._job_timestamps.get(job_id)
        if start is None:
            return False
        elapsed = time.time() - start
        if elapsed > self.limits.job_timeout_seconds:
            logger.warning("Job %s timed out after %ds (limit %ds)", job_id[:12], elapsed, self.limits.job_timeout_seconds)
            return True
        return False

    def check_provider_call(self, job_id: str) -> bool:
        count = self._provider_call_counts.get(job_id, 0)
        if count >= self.limits.max_provider_calls_per_job:
            logger.warning("Provider call limit reached for job %s", job_id[:12])
            return False
        self._provider_call_counts[job_id] = count + 1
        return True

    def check_reflection_chain(self, job_id: str) -> bool:
        count = self._reflection_chain_counts.get(job_id, 0)
        if count >= self.limits.max_reflection_chain:
            logger.warning("Reflection chain limit reached for job %s", job_id[:12])
            return False
        self._reflection_chain_counts[job_id] = count + 1
        return True

    def release_job(self, job_id: str) -> None:
        self._job_timestamps.pop(job_id, None)
        self._provider_call_counts.pop(job_id, None)
        self._reflection_chain_counts.pop(job_id, None)

    def emergency_stop(self) -> None:
        self._emergency_stop = True
        logger.warning("EMERGENCY STOP ACTIVATED — runtime frozen")

    def emergency_resume(self) -> None:
        self._emergency_stop = False
        logger.info("Emergency stop deactivated — runtime resumed")

    @property
    def is_emergency_stopped(self) -> bool:
        return self._emergency_stop


_safety_instance: Optional[SafetyGovernor] = None


def get_safety_governor() -> SafetyGovernor:
    global _safety_instance
    if _safety_instance is None:
        _safety_instance = SafetyGovernor()
    return _safety_instance
