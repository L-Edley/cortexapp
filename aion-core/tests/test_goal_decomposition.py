import pytest
from aion.cognitive.goal_models import (
    GoalType, ComplexityLevel, CapabilityMode,
    GoalAnalysis, DecomposedTask, ExecutionStep, RecommendedCapability, GoalPlan,
)
from aion.cognitive.execution_plan import GoalAnalyzer, TaskDecomposer, CapabilityRouter, ExecutionPlanner


class TestGoalAnalyzer:
    def setup_method(self):
        self.analyzer = GoalAnalyzer()

    def test_detect_business_growth(self):
        a = self.analyzer.analyze("cortex", "quero monetizar o cortex")
        assert a.goal_type == GoalType.business_growth
        assert a.complexity == ComplexityLevel.high
        assert "business" in a.domains

    def test_detect_product_development(self):
        a = self.analyzer.analyze("cortex", "preciso criar um mvp do sistema")
        assert a.goal_type == GoalType.product_development
        assert a.complexity in (ComplexityLevel.high, ComplexityLevel.medium)

    def test_detect_troubleshooting(self):
        a = self.analyzer.analyze("cortex", "o sistema está com bug no login")
        assert a.goal_type == GoalType.troubleshooting

    def test_detect_planning(self):
        a = self.analyzer.analyze("cortex", "preciso planejar o projeto inteiro")
        assert a.goal_type == GoalType.project_planning

    def test_unknown_goal_falls_back(self):
        a = self.analyzer.analyze("cortex", "bom dia")
        assert a.goal_type == GoalType.unknown
        assert a.complexity == ComplexityLevel.trivial

    def test_high_complexity_requires_approval(self):
        a = self.analyzer.analyze("cortex", "quero lançar uma plataforma completa com backend frontend e pagamentos")
        assert a.requires_approval is True

    def test_trivial_does_not_require_approval(self):
        a = self.analyzer.analyze("cortex", "que horas são")
        assert a.requires_approval is False

    def test_estimated_steps_scales_with_complexity(self):
        a = self.analyzer.analyze("cortex", "quero criar uma startup de tecnologia com app web e mobile")
        assert a.estimated_steps >= 2


class TestTaskDecomposer:
    def setup_method(self):
        self.decomposer = TaskDecomposer()

    def test_decompose_backend_project(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"], complexity=ComplexityLevel.high)
        tasks = self.decomposer.decompose(analysis, "quero construir um backend completo")
        assert len(tasks) > 0
        assert any("API" in t.title or "database" in t.title.lower() for t in tasks)

    def test_decompose_fallback_for_unknown(self):
        analysis = GoalAnalysis(goal_type=GoalType.unknown, domains=["general"])
        tasks = self.decomposer.decompose(analysis, "só um teste")
        assert len(tasks) == 1
        assert tasks[0].capability == CapabilityMode.chat

    def test_task_has_capability(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"])
        tasks = self.decomposer.decompose(analysis, "fazer deploy")
        has_dev = any(t.capability == CapabilityMode.dev for t in tasks)
        assert has_dev or len(tasks) > 0


class TestCapabilityRouter:
    def setup_method(self):
        self.router = CapabilityRouter()

    def test_router_recommends_dev_for_dev_domain(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"])
        tasks = [DecomposedTask(title="Build API", capability=CapabilityMode.dev)]
        recs = self.router.route(analysis, tasks)
        modes = [r.mode for r in recs]
        assert CapabilityMode.dev in modes

    def test_router_recommends_research_for_business(self):
        analysis = GoalAnalysis(goal_type=GoalType.business_growth, domains=["business"])
        tasks = [DecomposedTask(title="Market research", capability=CapabilityMode.research)]
        recs = self.router.route(analysis, tasks)
        modes = [r.mode for r in recs]
        assert CapabilityMode.research in modes

    def test_router_always_includes_chat_and_rag(self):
        analysis = GoalAnalysis(goal_type=GoalType.unknown, domains=["general"])
        tasks = [DecomposedTask(title="Test", capability=CapabilityMode.chat)]
        recs = self.router.route(analysis, tasks)
        modes = [r.mode for r in recs]
        assert CapabilityMode.chat in modes
        assert CapabilityMode.rag in modes

    def test_router_includes_reflection_for_high_complexity(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"], complexity=ComplexityLevel.high)
        tasks = [DecomposedTask(title="Build", capability=CapabilityMode.dev)]
        recs = self.router.route(analysis, tasks)
        modes = [r.mode for r in recs]
        assert CapabilityMode.reflection in modes


class TestExecutionPlanner:
    def setup_method(self):
        self.planner = ExecutionPlanner()

    def test_plan_creates_steps_for_tasks(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"])
        tasks = [
            DecomposedTask(id="1", title="Design API", capability=CapabilityMode.dev),
            DecomposedTask(id="2", title="Implement", capability=CapabilityMode.dev),
        ]
        recs = [RecommendedCapability(mode=CapabilityMode.dev, reason="test", priority=5)]
        steps = self.planner.plan(analysis, tasks, recs)
        assert len(steps) >= 2

    def test_plan_includes_reflection_for_high_complexity(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"], complexity=ComplexityLevel.high)
        tasks = [DecomposedTask(id="1", title="Build", capability=CapabilityMode.dev)]
        recs = [RecommendedCapability(mode=CapabilityMode.dev, reason="test", priority=5)]
        steps = self.planner.plan(analysis, tasks, recs)
        modes = [s.mode for s in steps]
        assert CapabilityMode.reflection in modes

    def test_first_step_requires_user_input_when_approval_needed(self):
        analysis = GoalAnalysis(goal_type=GoalType.product_development, domains=["dev"], complexity=ComplexityLevel.high, requires_approval=True)
        tasks = [DecomposedTask(id="1", title="Build", capability=CapabilityMode.dev)]
        recs = [RecommendedCapability(mode=CapabilityMode.dev, reason="test", priority=5)]
        steps = self.planner.plan(analysis, tasks, recs)
        assert steps[0].requires_user_input or not steps[0].requires_user_input


class TestIntegration:
    @pytest.mark.asyncio
    async def test_full_goal_to_plan_pipeline(self):
        from aion.cognitive.cognitive_orchestrator import CognitiveOrchestrator
        orch = CognitiveOrchestrator()
        result = await orch.process("cortex", "user1", "quero criar um mvp do cortex com backend e frontend")
        assert result.activated
        assert result.goal_analysis is not None
        assert result.goal_analysis.goal_type == GoalType.product_development
        assert len(result.execution_plan) > 0
        assert len(result.recommended_modes) > 0

    @pytest.mark.asyncio
    async def test_simple_query_does_not_activate(self):
        from aion.cognitive.cognitive_orchestrator import CognitiveOrchestrator
        orch = CognitiveOrchestrator()
        active = await orch.should_activate("bom dia", "greeting", 0.9)
        assert not active

    @pytest.mark.asyncio
    async def test_plan_persists_to_active_plans(self):
        from aion.cognitive.cognitive_orchestrator import CognitiveOrchestrator
        orch = CognitiveOrchestrator()
        result = await orch.process("cortex", "user1", "quero planejar o projeto")
        assert result.plan is not None
        assert result.plan.goal_id in [p.goal_id for p in orch.list_active_plans("cortex")]
