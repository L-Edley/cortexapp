import pytest
from unittest.mock import patch, AsyncMock


class TestScheduledTask:
    def test_default_task(self):
        from aion.runtime.cognitive_scheduler import ScheduledTask
        t = ScheduledTask()
        assert t.task == "study"
        assert t.interval == "daily"
        assert t.hour == 3
        assert t.enabled


class TestCognitiveScheduler:
    def test_schedule(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("study", interval="daily", hour=2)
        assert task.id != ""
        assert task.task == "study"
        assert task.hour == 2
        assert task.interval == "daily"
        assert task.enabled

    def test_schedule_invalid_task_falls_back(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("invalid_task")
        assert task.task == "study"

    def test_schedule_invalid_interval_falls_back(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("sync", interval="yearly")
        assert task.interval == "daily"

    def test_cancel(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("study")
        assert sched.cancel(task.id)
        assert not sched.get_task(task.id).enabled

    def test_cancel_nonexistent(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        assert not sched.cancel("nonexistent")

    def test_remove(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        task = sched.schedule("study")
        assert sched.remove(task.id)
        assert sched.get_task(task.id) is None

    def test_list_tasks(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        sched.schedule("study", interval="daily", hour=8)
        sched.schedule("sync", interval="daily", hour=2)
        tasks = sched.list_tasks()
        assert len(tasks) == 2
        assert tasks[0].hour == 2

    def test_list_tasks_enabled_only(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        t1 = sched.schedule("study")
        t2 = sched.schedule("sync")
        sched.cancel(t2.id)
        tasks = sched.list_tasks(enabled_only=True)
        assert len(tasks) == 1
        assert tasks[0].id == t1.id

    def test_get_due_tasks_empty(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        due = sched.get_due_tasks()
        assert due == []

    def test_run_due_no_handler(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        sched.schedule("study")
        with (
            patch("aion.runtime.runtime_manager.RuntimeManager.register_job", return_value=True),
            patch("aion.runtime.runtime_manager.RuntimeManager.complete_job"),
        ):
            import asyncio
            executed = asyncio.run(sched.run_due("cortex"))
            assert executed is not None

    def test_register_handler_and_run(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        called = False
        async def handler(app_id, task):
            nonlocal called
            called = True
        sched.register_handler("study", handler)
        sched.schedule("study", interval="once")
        with (
            patch("aion.runtime.runtime_manager.RuntimeManager.register_job", return_value=True),
            patch("aion.runtime.runtime_manager.RuntimeManager.complete_job"),
        ):
            import asyncio
            executed = asyncio.run(sched.run_due("cortex"))
            assert called

    def test_clear(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        sched.schedule("study")
        sched.clear()
        assert sched.list_tasks() == []

    def test_singleton(self):
        from aion.runtime.cognitive_scheduler import get_scheduler, CognitiveScheduler
        s1 = get_scheduler()
        s2 = get_scheduler()
        assert s1 is s2


class TestSafety:
    def test_scheduler_no_execute(self):
        from aion.runtime.cognitive_scheduler import CognitiveScheduler
        sched = CognitiveScheduler()
        assert not hasattr(sched, "execute")
        assert not hasattr(sched, "shell")
        assert not hasattr(sched, "run_arbitrary")
