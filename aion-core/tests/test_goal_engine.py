import pytest
from unittest.mock import patch, AsyncMock


class TestGoalModels:
    def test_default_milestone(self):
        from aion.runtime.goal_engine import GoalMilestone
        m = GoalMilestone()
        assert m.id == ""
        assert not m.completed

    def test_default_goal(self):
        from aion.runtime.goal_engine import LongTermGoal
        g = LongTermGoal()
        assert g.id == ""
        assert g.progress == 0.0
        assert g.active
        assert g.milestones == []


class TestGoalEngine:
    @pytest.mark.asyncio
    async def test_create_goal(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
        ):
            goal = await engine.create_goal(
                "cortex",
                "Launch Cortex",
                "Make Cortex a successful product",
                milestones=["MVP", "Beta", "Launch"],
            )
            assert goal.id != ""
            assert goal.title == "Launch Cortex"
            assert len(goal.milestones) == 3
            assert goal.progress == 0.0

    @pytest.mark.asyncio
    async def test_update_progress(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"):
            goal = await engine.create_goal("cortex", "Test", "desc")
            updated = await engine.update_progress("cortex", goal.id, 0.5)
            assert updated.progress == 0.5

    @pytest.mark.asyncio
    async def test_update_progress_clamps(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"):
            goal = await engine.create_goal("cortex", "Test", "desc")
            updated = await engine.update_progress("cortex", goal.id, 2.0)
            assert updated.progress == 1.0

    @pytest.mark.asyncio
    async def test_update_progress_nonexistent(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        result = await engine.update_progress("cortex", "nonexistent", 0.5)
        assert result is None

    @pytest.mark.asyncio
    async def test_complete_milestone(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"):
            goal = await engine.create_goal("cortex", "Test", "desc", milestones=["M1", "M2"])
            mid = goal.milestones[0].id
            updated = await engine.complete_milestone("cortex", goal.id, mid)
            assert updated.milestones[0].completed
            assert updated.progress == 0.5

    @pytest.mark.asyncio
    async def test_complete_milestone_nonexistent_goal(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        result = await engine.complete_milestone("cortex", "nonexistent", "mid")
        assert result is None

    @pytest.mark.asyncio
    async def test_add_reflection(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"):
            goal = await engine.create_goal("cortex", "Test", "desc")
            updated = await engine.add_reflection("cortex", goal.id, {"text": "reflection 1"})
            assert len(updated.reflections) == 1

    @pytest.mark.asyncio
    async def test_close_goal(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"):
            goal = await engine.create_goal("cortex", "Test", "desc")
            closed = await engine.close_goal("cortex", goal.id)
            assert not closed.active

    def test_get_goal(self):
        from aion.runtime.goal_engine import GoalEngine, LongTermGoal
        engine = GoalEngine()
        g = LongTermGoal(id="g1", title="Test", objective="desc")
        engine._goals["g1"] = g
        assert engine.get_goal("g1").id == "g1"
        assert engine.get_goal("nonexistent") is None

    def test_list_goals(self):
        from aion.runtime.goal_engine import GoalEngine, LongTermGoal
        engine = GoalEngine()
        engine._goals["g1"] = LongTermGoal(id="g1", title="A", active=True)
        engine._goals["g2"] = LongTermGoal(id="g2", title="B", active=False)
        active = engine.list_goals(active_only=True)
        assert len(active) == 1
        all_g = engine.list_goals(active_only=False)
        assert len(all_g) == 2

    def test_singleton(self):
        from aion.runtime.goal_engine import get_goal_engine, GoalEngine
        g1 = get_goal_engine()
        g2 = get_goal_engine()
        assert g1 is g2


class TestSafety:
    def test_goal_engine_no_execute(self):
        from aion.runtime.goal_engine import GoalEngine
        engine = GoalEngine()
        assert not hasattr(engine, "execute")
        assert not hasattr(engine, "shell")
