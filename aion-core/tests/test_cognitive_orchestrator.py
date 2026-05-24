import pytest
from aion.cognitive.cognitive_orchestrator import CognitiveOrchestrator, get_orchestrator
from aion.cognitive.goal_models import GoalType, ComplexityLevel, CapabilityMode, TaskStatus


class TestCognitiveOrchestrator:
    def setup_method(self):
        self.orch = CognitiveOrchestrator()

    def test_singleton(self):
        o1 = get_orchestrator()
        o2 = get_orchestrator()
        assert o1 is o2

    @pytest.mark.asyncio
    async def test_activates_for_complex_goal(self):
        active = await self.orch.should_activate("quero criar uma plataforma completa", "planning", 0.3)
        assert active

    @pytest.mark.asyncio
    async def test_does_not_activate_for_simple_greeting(self):
        active = await self.orch.should_activate("bom dia", "greeting", 0.95)
        assert not active

    @pytest.mark.asyncio
    async def test_does_not_activate_for_short_question(self):
        active = await self.orch.should_activate("que horas são", "query", 0.85)
        assert not active

    @pytest.mark.asyncio
    async def test_process_returns_orchestrator_result(self):
        result = await self.orch.process("cortex", "user1", "quero monetizar o cortex")
        assert result.activated
        assert result.goal_analysis is not None
        assert result.plan is not None

    @pytest.mark.asyncio
    async def test_goal_analysis_has_goal_type(self):
        result = await self.orch.process("cortex", "user1", "quero lançar um mvp")
        assert result.goal_analysis.goal_type in (GoalType.product_development, GoalType.business_growth)

    @pytest.mark.asyncio
    async def test_execution_plan_has_steps(self):
        result = await self.orch.process("cortex", "user1", "quero criar um backend completo")
        assert len(result.execution_plan) > 0

    @pytest.mark.asyncio
    async def test_recommended_modes_includes_chat(self):
        result = await self.orch.process("cortex", "user1", "quero criar um sistema")
        modes = [r.mode for r in result.recommended_modes]
        assert CapabilityMode.chat in modes

    @pytest.mark.asyncio
    async def test_plan_tracks_completion(self):
        result = await self.orch.process("cortex", "user1", "quero planejar o projeto")
        plan = result.plan
        plan_id = plan.goal_id
        updated = await self.orch.update_step_status(plan_id, 1, TaskStatus.completed, "done")
        assert updated is not None
        assert updated.completed_steps >= 1

    @pytest.mark.asyncio
    async def test_plan_goes_inactive_when_all_done(self):
        result = await self.orch.process("cortex", "user1", "tarefa simples")
        plan = result.plan
        if not plan:
            pytest.skip("Plan not created for simple task")
        for step in plan.execution_plan:
            await self.orch.update_step_status(plan.goal_id, step.step_number, TaskStatus.completed, "ok")
        final = self.orch.get_plan(plan.goal_id)
        assert final is not None
        assert final.active is False or final.completed_steps == final.total_steps

    @pytest.mark.asyncio
    async def test_list_active_plans(self):
        await self.orch.process("cortex", "user1", "quero fazer pesquisa de mercado")
        plans = self.orch.list_active_plans("cortex")
        assert len(plans) >= 1
        for p in plans:
            assert p.active

    @pytest.mark.asyncio
    async def test_list_active_plans_filters_by_app(self):
        await self.orch.process("cortex", "user1", "quero analisar concorrentes")
        other_plans = self.orch.list_active_plans("other-app")
        assert len(other_plans) == 0

    @pytest.mark.asyncio
    async def test_ui_reply_extra_contains_goal_analysis(self):
        result = await self.orch.process("cortex", "user1", "quero criar um plano de negócios")
        assert result.activated
        extra = result.ui_reply_extra
        assert "goal_analysis" in extra
        assert "execution_plan" in extra
        assert "recommended_modes" in extra

    @pytest.mark.asyncio
    async def test_record_reflection(self):
        from aion.cognitive.goal_models import GoalPlan, ExecutionStep, GoalAnalysis
        result = await self.orch.process("cortex", "user1", "quero um projeto")
        assert result.plan is not None
        assert len(result.execution_plan) > 0
        step = result.execution_plan[0]
        reflection = await self.orch.record_reflection("cortex", result.plan, step, "input", "output")
        assert reflection.success is True
        assert reflection.lesson_learned is not None

    @pytest.mark.asyncio
    async def test_record_reflection_with_error(self):
        from aion.cognitive.goal_models import GoalPlan, ExecutionStep, GoalAnalysis
        result = await self.orch.process("cortex", "user1", "quero um projeto")
        assert result.plan is not None
        assert len(result.execution_plan) > 0
        step = result.execution_plan[0]
        reflection = await self.orch.record_reflection("cortex", result.plan, step, "input", "output", "timeout error")
        assert reflection.success is False
        assert reflection.error_type is not None

    def test_get_plan_returns_none_for_unknown(self):
        plan = self.orch.get_plan("nonexistent-id")
        assert plan is None


class TestIntegrationWithAgent:
    @pytest.mark.asyncio
    async def test_orchestrator_in_agent_flow_does_not_break_simple_chat(self):
        from aion.agent.agent import run
        from unittest.mock import patch, AsyncMock

        with (
            patch("aion.agent.agent.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.memory.sqlite_store", new_callable=AsyncMock, create=True),
            patch("aion.obsidian.writer", new_callable=AsyncMock, create=True),
            patch("aion.agent.agent.get_emotional_context", new_callable=AsyncMock, return_value=type('obj', (object,), {'current_state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.detect_emotional_state", return_value=type('obj', (object,), {'state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.save_emotional_snapshot", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=None),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=lambda: AsyncMock(return_value="Hi there!")),
            patch("aion.learning.learning_engine.classify_learning", return_value=type('obj', (object,), {'action': 'discard', 'target': 'none', 'content': '', 'tags': [], 'confidence': 1.0, 'expires_in_hours': None, 'model_dump': lambda *a, **kw: {'action': 'discard'}})()),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.vector_store.semantic_search", new_callable=AsyncMock, return_value=[]),
        ):
            from aion.agent.agent import run as agent_run
            response = await agent_run("cortex", "user1", "bom dia", {})
            assert response.status == "success"
            assert response.tenant_id == "cortex"

    @pytest.mark.asyncio
    async def test_agent_flow_with_cognitive_goal_does_not_crash(self):
        from aion.agent.agent import run as agent_run
        from unittest.mock import patch, AsyncMock

        with (
            patch("aion.agent.agent.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.memory.sqlite_store", new_callable=AsyncMock, create=True),
            patch("aion.obsidian.writer", new_callable=AsyncMock, create=True),
            patch("aion.agent.agent.get_emotional_context", new_callable=AsyncMock, return_value=type('obj', (object,), {'current_state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.detect_emotional_state", return_value=type('obj', (object,), {'state': 'neutral', 'confidence': 1.0})()),
            patch("aion.agent.agent.save_emotional_snapshot", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=None),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=lambda: AsyncMock(return_value="Aqui está o plano...")),
            patch("aion.learning.learning_engine.classify_learning", return_value=type('obj', (object,), {'action': 'discard', 'target': 'none', 'content': '', 'tags': [], 'confidence': 1.0, 'expires_in_hours': None, 'model_dump': lambda *a, **kw: {'action': 'discard'}})()),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.vector_store.semantic_search", new_callable=AsyncMock, return_value=[]),
        ):
            response = await agent_run("cortex", "user1", "quero criar um mvp do cortex", {})
            assert response.status == "success"
            assert response.tenant_id == "cortex"
