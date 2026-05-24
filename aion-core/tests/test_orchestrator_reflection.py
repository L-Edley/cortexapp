import pytest
from unittest.mock import patch, AsyncMock

from aion.orchestrator.execution_memory import ExecutionRecord


class TestOrchestratorReflection:
    def test_reflect_success(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec1",
            goal="criar app",
            goal_type="product_development",
            modes_used=["dev"],
            providers_used=["openrouter/deepseek"],
            success=True,
            duration_seconds=3.0,
            confidence_score=0.9,
        )
        ref = engine.reflect(rec)
        assert ref.execution_id == "exec1"
        assert ref.detected_patterns
        assert ref.success_pattern is not None
        pattern_text = " ".join(ref.detected_patterns)
        assert "adequado" in pattern_text or "confiança" in pattern_text
        assert "Alta confiança" in pattern_text
        assert ref.suggested_improvements == []

    def test_reflect_failure(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec2",
            goal="deletar dados",
            goal_type="troubleshooting",
            modes_used=["chat"],
            providers_used=["provider1"],
            success=False,
            duration_seconds=10.0,
            errors=["timeout: connection refused"],
            confidence_score=0.3,
        )
        ref = engine.reflect(rec)
        assert ref.execution_id == "exec2"
        assert ref.detected_errors
        assert ref.weakness is not None
        assert ref.suggested_improvements
        assert any("provedor" in i.lower() or "cache" in i.lower() for i in ref.suggested_improvements)

    def test_reflect_mixed_failure_no_errors_still_detects(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec3",
            goal="teste",
            goal_type="test",
            success=False,
            duration_seconds=1.0,
        )
        ref = engine.reflect(rec)
        assert ref.detected_errors
        assert any("execution_failed" in e for e in ref.detected_errors)

    def test_detect_failures_empty_errors_on_success(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec4",
            goal="teste",
            goal_type="test",
            success=True,
        )
        failures = engine.detect_failures(rec)
        assert failures == []

    def test_detect_failures_categorizes_timeout(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec5",
            goal="teste",
            goal_type="test",
            success=False,
            errors=["timed out after 30 seconds"],
        )
        failures = engine.detect_failures(rec)
        assert any("timeout" in f for f in failures)

    def test_detect_failures_categorizes_rate_limit(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec6",
            goal="teste",
            goal_type="test",
            success=False,
            errors=["rate limit exceeded (429)"],
        )
        failures = engine.detect_failures(rec)
        assert any("rate_limit" in f for f in failures)

    def test_detect_failures_deduplicates_by_category(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec7",
            goal="teste",
            goal_type="test",
            success=False,
            errors=["timeout error", "another timeout", "rate limit error"],
        )
        failures = engine.detect_failures(rec)
        timeout_failures = [f for f in failures if f.startswith("timeout")]
        rate_limit_failures = [f for f in failures if f.startswith("rate_limit")]
        assert len(timeout_failures) == 1
        assert len(rate_limit_failures) == 1

    def test_detect_success_patterns_no_patterns_on_failure(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec8",
            goal="teste",
            goal_type="test",
            success=False,
        )
        patterns = engine.detect_success_patterns(rec)
        assert patterns == []

    def test_detect_success_patterns_high_confidence(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec9",
            goal="teste",
            goal_type="test",
            success=True,
            confidence_score=0.9,
            duration_seconds=1.0,
        )
        patterns = engine.detect_success_patterns(rec)
        pattern_text = " ".join(patterns)
        assert "rápida" in pattern_text.lower()
        assert "confiança" in pattern_text.lower()

    def test_generate_improvements_from_rate_limit(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec10",
            goal="teste",
            goal_type="test",
            success=False,
            errors=["rate limit: too many requests"],
        )
        errors = engine.detect_failures(rec)
        improvements = engine.generate_improvements(rec, errors)
        assert any("backoff" in i.lower() or "alternar" in i.lower() for i in improvements)

    def test_generate_improvements_from_high_duration(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec11",
            goal="teste",
            goal_type="test",
            success=True,
            duration_seconds=60.0,
        )
        improvements = engine.generate_improvements(rec, [])
        assert any("cache" in i.lower() for i in improvements)

    def test_generate_improvements_low_confidence(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec12",
            goal="teste",
            goal_type="test",
            success=True,
            confidence_score=0.2,
        )
        improvements = engine.generate_improvements(rec, [])
        assert any("confiança" in i.lower() or "confianc" in i.lower() for i in improvements)

    def test_generate_improvements_capped_at_five(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec13",
            goal="teste",
            goal_type="test",
            success=False,
            duration_seconds=60.0,
            confidence_score=0.2,
            errors=["timeout", "rate limit", "unauthorized", "not found", "validation error"],
        )
        errors = engine.detect_failures(rec)
        improvements = engine.generate_improvements(rec, errors)
        assert len(improvements) <= 5

    @pytest.mark.asyncio
    async def test_reflect_and_persist(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(
            id="exec_persist",
            goal="teste persistência",
            goal_type="test",
            success=True,
        )

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
        ):
            ref = await engine.reflect_and_persist("cortex", rec)
            assert ref.execution_id == "exec_persist"


class TestSafety:
    def test_reflection_never_executes(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine, ExecutionReflection
        engine = OrchestratorReflectionEngine()
        ref = ExecutionReflection()
        assert not hasattr(ref, "execute")
        assert not hasattr(ref, "shell")
        assert not hasattr(ref, "run")

    def test_reflection_is_passive(self):
        from aion.orchestrator.reflection_engine import OrchestratorReflectionEngine
        engine = OrchestratorReflectionEngine()
        rec = ExecutionRecord(id="safe", goal="x", goal_type="x", success=True)
        ref = engine.reflect(rec)
        assert isinstance(ref.detected_errors, list)
        assert isinstance(ref.suggested_improvements, list)
        assert isinstance(ref.detected_patterns, list)
        assert all(isinstance(e, str) for e in ref.detected_errors)
        assert all(isinstance(i, str) for i in ref.suggested_improvements)
        assert all(isinstance(p, str) for p in ref.detected_patterns)
