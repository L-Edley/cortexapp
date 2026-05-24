import pytest
from unittest.mock import patch, AsyncMock


class TestBackgroundResearch:
    def test_research_is_schedulable_task(self):
        from aion.runtime.cognitive_scheduler import SCHEDULABLE_TASKS
        assert "research" in SCHEDULABLE_TASKS

    def test_schedule_research_task(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("research", interval="daily", hour=3, params={"topic": "local-first architectures"})
        assert task.task == "research"
        assert task.params.get("topic") == "local-first architectures"

    def test_research_handler_execution(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        research_log = []
        async def research_handler(app_id, task):
            research_log.append({"app_id": app_id, "topic": task.params.get("topic")})
        sched.register_handler("research", research_handler)
        task = sched.schedule("research", interval="once", params={"topic": "AI safety"})
        with (
            patch("aion.runtime.runtime_manager.RuntimeManager.register_job", return_value=True),
            patch("aion.runtime.runtime_manager.RuntimeManager.complete_job"),
        ):
            import asyncio
            executed = asyncio.run(sched.run_due("cortex"))
            assert len(research_log) == 1
            assert research_log[0]["topic"] == "AI safety"

    def test_research_depth_respected(self):
        from aion.runtime.safety_governor import SafetyLimits
        limits = SafetyLimits(max_research_depth=10)
        assert limits.max_research_depth == 10

    def test_research_can_be_cancelled(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("research", interval="daily")
        assert sched.cancel(task.id)
        assert not sched.get_task(task.id).enabled

    def test_research_timeout_governor(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(job_timeout_seconds=30))
        gov.register_job_start("research_job")
        assert not gov.check_job_timeout("research_job")

    def test_research_provider_limits(self):
        from aion.runtime.safety_governor import SafetyGovernor, SafetyLimits
        gov = SafetyGovernor(limits=SafetyLimits(max_provider_calls_per_job=5))
        gov.register_job_start("research_job")
        for _ in range(5):
            assert gov.check_provider_call("research_job")
        assert not gov.check_provider_call("research_job")


class TestSafety:
    def test_research_never_executes_shell(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        assert not hasattr(sched, "execute_shell")
        assert not hasattr(sched, "run_command")

    def test_governor_limits_research(self):
        from aion.runtime.safety_governor import SafetyLimits
        limits = SafetyLimits()
        assert limits.max_research_depth <= 50
        assert limits.job_timeout_seconds <= 3600
