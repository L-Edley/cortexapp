import pytest
from unittest.mock import patch, AsyncMock


class TestBrainObservatory:
    @pytest.mark.asyncio
    async def test_get_stats_empty(self):
        from aion.workspace.brain_observatory import BrainObservatory

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.vector_store.count_vectors", new_callable=AsyncMock, return_value=0),
        ):
            obs = BrainObservatory()
            stats = await obs.get_stats("cortex")
            assert stats.memory_count == 0
            assert stats.knowledge_count == 0
            assert stats.execution_count == 0
            assert stats.reflection_count == 0
            assert stats.study_sessions == 0

    @pytest.mark.asyncio
    async def test_get_stats_with_data(self):
        from aion.workspace.brain_observatory import BrainObservatory

        mock_memories = [{"id": f"m{i}", "created_at": "2026-05-24T00:00:00"} for i in range(5)]
        mock_knowledge = [
            {"id": "k1", "source_mode": "study", "tags": [], "niche": "", "content": "{}"},
            {"id": "k2", "source_mode": "reflection", "tags": ["reflection", "orchestrator"], "niche": "", "content": "{}"},
            {"id": "k3", "source_mode": "", "tags": ["execution_memory"], "niche": "execution_memory", "content": '{"success":true,"duration_seconds":2.0,"modes_used":["dev"],"providers_used":["p1"],"errors":[],"improvements":[],"confidence_score":0.9,"error_count":0,"improvement_count":0,"created_at":"2026-01-01"}'},
            {"id": "k4", "source_mode": "", "tags": ["execution_memory"], "niche": "execution_memory", "content": '{"success":false,"duration_seconds":5.0,"modes_used":["study"],"providers_used":["p2"],"errors":["timeout"],"improvements":[],"confidence_score":0.3,"error_count":1,"improvement_count":0,"created_at":"2026-01-01"}'},
        ]

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
            patch("aion.memory.vector_store.count_vectors", new_callable=AsyncMock, return_value=10),
        ):
            obs = BrainObservatory()
            stats = await obs.get_stats("cortex")
            assert stats.memory_count == 5
            assert stats.knowledge_count == 4
            assert stats.execution_count == 2
            assert stats.execution_success_rate == 0.5
            assert stats.average_duration == 3.5
            assert stats.vector_count == 10

    @pytest.mark.asyncio
    async def test_get_health_healthy(self):
        from aion.workspace.brain_observatory import BrainObservatory

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=True),
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=[{"id": "m1"}]),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.vector_store.count_vectors", new_callable=AsyncMock, return_value=5),
        ):
            obs = BrainObservatory()
            health = await obs.get_health("cortex")
            assert health["status"] == "healthy"
            assert health["provisioned"]
            assert health["issues"] == []

    @pytest.mark.asyncio
    async def test_get_health_degraded(self):
        from aion.workspace.brain_observatory import BrainObservatory

        with (
            patch("aion.memory.sqlite_store.is_tenant_provisioned", new_callable=AsyncMock, return_value=False),
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.vector_store.count_vectors", new_callable=AsyncMock, return_value=0),
        ):
            obs = BrainObservatory()
            health = await obs.get_health("cortex")
            assert health["status"] == "degraded"
            assert len(health["issues"]) > 0

    @pytest.mark.asyncio
    async def test_get_providers(self):
        from aion.workspace.brain_observatory import BrainObservatory

        mock_knowledge = [
            {"niche": "execution_memory", "content": '{"success":true,"duration_seconds":2.0,"providers_used":["p1"],"modes_used":[],"errors":[],"improvements":[],"confidence_score":0.9,"error_count":0,"improvement_count":0,"created_at":"2026-01-01"}'},
            {"niche": "execution_memory", "content": '{"success":false,"duration_seconds":5.0,"providers_used":["p1","p2"],"modes_used":[],"errors":["timeout"],"improvements":[],"confidence_score":0.3,"error_count":1,"improvement_count":0,"created_at":"2026-01-01"}'},
            {"niche": "other", "content": "{}"},
        ]

        with (
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            obs = BrainObservatory()
            providers = await obs.get_providers("cortex")
            assert len(providers) == 2
            p1 = [p for p in providers if p["provider"] == "p1"][0]
            assert p1["total_calls"] == 2
            assert p1["success_rate"] == 0.5


class TestWorkspaceDashboard:
    @pytest.mark.asyncio
    async def test_dashboard_integration(self):
        from aion.orchestrator.learning_system import OrchestratorLearningSystem
        system = OrchestratorLearningSystem()

        mock_records = [
            {"content": '{"id":"r1","goal":"g1","goal_type":"dev","success":true,"duration_seconds":2.0,"modes_used":["dev"],"providers_used":["p1"],"errors":[],"improvements":[],"confidence_score":0.9,"error_count":0,"improvement_count":0,"created_at":"2026-01-01"}'},
        ]

        with (
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k123"),
            patch("aion.obsidian.writer.write_knowledge", new_callable=AsyncMock),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_records),
        ):
            dash = await system.get_dashboard_data("cortex")
            assert "total_executions" in dash
            assert "strategies" in dash
            assert "strategy_confidence" in dash


class TestSafety:
    def test_brain_observatory_readonly(self):
        from aion.workspace.brain_observatory import BrainObservatory
        obs = BrainObservatory()
        assert not hasattr(obs, "execute")
        assert not hasattr(obs, "delete")
        assert not hasattr(obs, "write")
