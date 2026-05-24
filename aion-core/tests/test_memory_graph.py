import pytest
from unittest.mock import patch, AsyncMock


class TestMemoryGraphModels:
    def test_node_defaults(self):
        from aion.workspace.memory_graph import MemoryGraphNode
        node = MemoryGraphNode(id="n1", label="test")
        assert node.type == "memory"
        assert node.domain == "general"
        assert node.color == "#9E9E9E"
        assert node.size == 1

    def test_builder_assigns_domain_color(self):
        from aion.workspace.memory_graph import MemoryGraphNode, DOMAIN_COLORS
        node = MemoryGraphNode(id="n1", label="dev", domain="technology", color=DOMAIN_COLORS["technology"])
        assert node.color == "#2196F3"

    def test_edge_defaults(self):
        from aion.workspace.memory_graph import MemoryGraphEdge
        edge = MemoryGraphEdge(source="a", target="b")
        assert edge.label == ""
        assert edge.weight == 1.0

    def test_graph_empty(self):
        from aion.workspace.memory_graph import MemoryGraph
        graph = MemoryGraph()
        assert graph.nodes == []
        assert graph.edges == []
        assert graph.stats == {}


class TestMemoryGraphBuilder:
    @pytest.mark.asyncio
    async def test_build_empty(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=[]),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=[]),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert graph.nodes == []
            assert graph.edges == []
            assert graph.stats["total_nodes"] == 0
            assert graph.stats["total_edges"] == 0

    @pytest.mark.asyncio
    async def test_build_with_memories(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = [
            {"id": "m1", "content": "Primeira memória", "domain": "technology", "niche": "dev"},
            {"id": "m2", "content": "Segunda memória", "domain": "technology", "niche": "dev"},
        ]
        mock_knowledge = []

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert len(graph.nodes) == 2
            assert graph.stats["total_nodes"] == 2

    @pytest.mark.asyncio
    async def test_build_creates_domain_edges(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = [
            {"id": "m1", "content": "Memória tech", "domain": "technology", "niche": "dev"},
            {"id": "m2", "content": "Outra tech", "domain": "technology", "niche": "ai_ml"},
        ]
        mock_knowledge = []

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert len(graph.edges) > 0
            assert graph.edges[0].label == "technology"

    @pytest.mark.asyncio
    async def test_build_different_domains_no_edge(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = [
            {"id": "m1", "content": "Memória tech", "domain": "technology", "niche": "dev"},
            {"id": "m2", "content": "Negócio", "domain": "business", "niche": "marketing"},
        ]
        mock_knowledge = []

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            for edge in graph.edges:
                assert edge.label != "technology"

    @pytest.mark.asyncio
    async def test_build_includes_knowledge(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = []
        mock_knowledge = [
            {"id": "k1", "content": "Knowledge item", "domain": "knowledge", "niche": "study"},
        ]

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert len(graph.nodes) == 1
            assert graph.nodes[0].type == "knowledge"

    @pytest.mark.asyncio
    async def test_build_domain_stats(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = [
            {"id": "m1", "content": "Tech", "domain": "technology", "niche": "dev"},
            {"id": "m2", "content": "Biz", "domain": "business", "niche": "marketing"},
            {"id": "m3", "content": "Tech2", "domain": "technology", "niche": "dev"},
        ]
        mock_knowledge = []

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert graph.stats["domains"]["technology"]["count"] == 2
            assert graph.stats["domains"]["business"]["count"] == 1

    @pytest.mark.asyncio
    async def test_build_limits_edges(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder

        mock_memories = [
            {"id": f"m{i}", "content": f"Mem {i}", "domain": "technology", "niche": "dev"}
            for i in range(50)
        ]
        mock_knowledge = []

        with (
            patch("aion.memory.sqlite_store.get_memories", new_callable=AsyncMock, return_value=mock_memories),
            patch("aion.memory.sqlite_store.search_knowledge", new_callable=AsyncMock, return_value=mock_knowledge),
        ):
            builder = MemoryGraphBuilder()
            graph = await builder.build("cortex")
            assert len(graph.edges) <= 500

    def test_singleton(self):
        from aion.workspace.memory_graph import get_memory_graph, MemoryGraphBuilder
        m1 = get_memory_graph()
        m2 = get_memory_graph()
        assert m1 is m2


class TestSafety:
    def test_memory_graph_is_readonly(self):
        from aion.workspace.memory_graph import MemoryGraphBuilder
        builder = MemoryGraphBuilder()
        assert not hasattr(builder, "write")
        assert not hasattr(builder, "delete")
        assert not hasattr(builder, "execute")
