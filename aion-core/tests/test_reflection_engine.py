import pytest
from aion.cognitive.reflection_engine import ReflectionEngine
from aion.cognitive.goal_models import (
    GoalPlan, ExecutionStep, CapabilityMode, GoalAnalysis, TaskStatus, Reflection,
)


class TestReflectionEngine:
    def setup_method(self):
        self.engine = ReflectionEngine()

    def _make_plan(self) -> GoalPlan:
        return GoalPlan(
            goal_id="test-goal-1",
            app_id="cortex",
            user_id="user1",
            raw_input="test goal",
            analysis=GoalAnalysis(),
        )

    def _make_step(self, number: int = 1, mode: CapabilityMode = CapabilityMode.chat) -> ExecutionStep:
        return ExecutionStep(
            step_number=number,
            mode=mode,
            task_id="task-1",
            objective="test objective",
            prompt="test prompt",
        )

    @pytest.mark.asyncio
    async def test_successful_step_reflection(self):
        plan = self._make_plan()
        step = self._make_step()
        reflection = await self.engine.analyze_step("cortex", plan, step, "input", "output")
        assert reflection.success is True
        assert reflection.error_type is None
        assert reflection.lesson_learned is not None
        assert reflection.improvement_suggestion is not None

    @pytest.mark.asyncio
    async def test_failed_step_reflection(self):
        plan = self._make_plan()
        step = self._make_step()
        reflection = await self.engine.analyze_step("cortex", plan, step, "input", "output", error="TimeoutError: connection timed out")
        assert reflection.success is False
        assert reflection.error_type == "timeout"
        assert reflection.error_detail is not None

    @pytest.mark.asyncio
    async def test_classify_rate_limit(self):
        plan = self._make_plan()
        step = self._make_step()
        reflection = await self.engine.analyze_step("cortex", plan, step, "in", "out", error="429 Too Many Requests")
        assert reflection.error_type == "rate_limit"

    @pytest.mark.asyncio
    async def test_classify_auth_error(self):
        plan = self._make_plan()
        step = self._make_step()
        reflection = await self.engine.analyze_step("cortex", plan, step, "in", "out", error="401 Unauthorized: invalid token")
        assert reflection.error_type == "authorization"

    @pytest.mark.asyncio
    async def test_validate_step_output_valid(self):
        step = self._make_step()
        valid = await self.engine.validate_result(step, "This is a valid output with enough content")
        assert valid is True

    @pytest.mark.asyncio
    async def test_validate_step_output_empty(self):
        step = self._make_step()
        valid = await self.engine.validate_result(step, "")
        assert valid is False

    @pytest.mark.asyncio
    async def test_validate_step_output_none(self):
        step = self._make_step()
        valid = await self.engine.validate_result(step, None)
        assert valid is False

    def test_learned_strategies_recorded(self):
        plan = self._make_plan()
        step = self._make_step(mode=CapabilityMode.dev)
        import asyncio
        asyncio.run(self.engine.analyze_step("cortex", plan, step, "in", "out"))
        strategies = self.engine.get_learned_strategies("cortex")
        assert len(strategies) >= 1
        assert strategies[0].recommended_mode == CapabilityMode.dev

    def test_learned_strategies_increment_usage(self):
        plan = self._make_plan()
        step = self._make_step(mode=CapabilityMode.dev)
        import asyncio
        asyncio.run(self.engine.analyze_step("cortex", plan, step, "in", "out1"))
        asyncio.run(self.engine.analyze_step("cortex", plan, step, "in", "out2"))
        strategies = self.engine.get_learned_strategies("cortex")
        dev_strategies = [s for s in strategies if s.recommended_mode == CapabilityMode.dev]
        assert len(dev_strategies) >= 1
        assert dev_strategies[0].usage_count >= 2


class TestReflectionEdgeCases:
    def setup_method(self):
        self.engine = ReflectionEngine()

    @pytest.mark.asyncio
    async def test_generate_summary_complete(self):
        plan = GoalPlan(
            goal_id="g1", app_id="cortex", user_id="u1",
            raw_input="test plan",
            analysis=GoalAnalysis(),
            total_steps=2,
            completed_steps=2,
            execution_plan=[
                ExecutionStep(step_number=1, mode=CapabilityMode.chat, task_id="t1", objective="step1", prompt="p1", status=TaskStatus.completed),
                ExecutionStep(step_number=2, mode=CapabilityMode.chat, task_id="t2", objective="step2", prompt="p2", status=TaskStatus.completed),
            ],
        )
        reflections = [
            Reflection(reflection_id="r1", goal_id="g1", app_id="cortex", step_number=1, success=True, lesson_learned="step1 ok"),
            Reflection(reflection_id="r2", goal_id="g1", app_id="cortex", step_number=2, success=True, lesson_learned="step2 ok"),
        ]
        summary = await self.engine.generate_summary(plan, reflections)
        assert "concluído" in summary
        assert "2/2" in summary

    @pytest.mark.asyncio
    async def test_generate_summary_with_failures(self):
        plan = GoalPlan(
            goal_id="g1", app_id="cortex", user_id="u1",
            raw_input="test plan",
            analysis=GoalAnalysis(),
            total_steps=2,
            completed_steps=1,
            failed_steps=1,
            execution_plan=[
                ExecutionStep(step_number=1, mode=CapabilityMode.chat, task_id="t1", objective="step1", prompt="p1", status=TaskStatus.completed),
                ExecutionStep(step_number=2, mode=CapabilityMode.chat, task_id="t2", objective="step2", prompt="p2", status=TaskStatus.failed),
            ],
        )
        reflections = [
            Reflection(reflection_id="r1", goal_id="g1", app_id="cortex", step_number=1, success=True),
            Reflection(reflection_id="r2", goal_id="g1", app_id="cortex", step_number=2, success=False, error_type="timeout"),
        ]
        summary = await self.engine.generate_summary(plan, reflections)
        assert "falharam" in summary or "1/2" in summary


class TestGoalAnalyzerSensitive:
    def test_requires_approval_for_destructive_action(self):
        from aion.cognitive.execution_plan import GoalAnalyzer
        a = GoalAnalyzer()
        analysis = a.analyze("cortex", "quero deletar todos os dados")
        assert analysis.requires_approval

    def test_requires_approval_for_delete_request(self):
        from aion.cognitive.execution_plan import GoalAnalyzer
        a = GoalAnalyzer()
        analysis = a.analyze("cortex", "preciso apagar todos os arquivos")
        assert analysis.requires_approval

class TestSafety:
    @pytest.mark.asyncio
    async def test_orchestrator_does_not_auto_execute(self):
        from aion.cognitive.cognitive_orchestrator import CognitiveOrchestrator
        orch = CognitiveOrchestrator()
        result = await orch.process("cortex", "user1", "quero deletar todos os dados", {})
        assert result.activated
        assert result.plan is not None
        assert result.plan.analysis.requires_approval

    def test_orchestrator_limits_steps(self):
        from aion.cognitive.execution_plan import GoalAnalyzer
        analyzer = GoalAnalyzer()
        analysis = analyzer.analyze("cortex", "quero construir um sistema completo com 50 funcionalidades")
        assert analysis.estimated_steps <= 50
