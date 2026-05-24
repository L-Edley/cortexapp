import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.workspace.memory_graph")

DOMAIN_COLORS = {
    "productivity": "#4CAF50",
    "technology": "#2196F3",
    "personal": "#FF9800",
    "business": "#9C27B0",
    "knowledge": "#00BCD4",
    "training": "#F44336",
    "aion_orchestration": "#607D8B",
    "general": "#9E9E9E",
}


class MemoryGraphNode(BaseModel):
    id: str = ""
    label: str = ""
    type: str = "memory"
    domain: str = "general"
    niche: str = "general"
    color: str = "#9E9E9E"
    size: int = 1


class MemoryGraphEdge(BaseModel):
    source: str = ""
    target: str = ""
    label: str = ""
    weight: float = 1.0


class MemoryGraph(BaseModel):
    nodes: List[MemoryGraphNode] = Field(default_factory=list)
    edges: List[MemoryGraphEdge] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class MemoryGraphBuilder:
    async def build(self, app_id: str, limit: int = 200) -> MemoryGraph:
        from aion.memory.sqlite_store import get_memories, search_knowledge

        memories = await get_memories(app_id, limit=limit)
        knowledge = await search_knowledge(app_id, "", limit=limit * 2)

        nodes: Dict[str, MemoryGraphNode] = {}
        edges: List[MemoryGraphEdge] = []
        domain_counts: Dict[str, int] = {}
        niche_counts: Dict[str, int] = {}

        for mem in memories[:100]:
            nid = mem.get("id", "")
            if not nid:
                continue
            domain = mem.get("domain", "general")
            niche = mem.get("niche", "general")
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            niche_counts[niche] = niche_counts.get(niche, 0) + 1
            nodes[nid] = MemoryGraphNode(
                id=nid,
                label=(mem.get("content", "") or "")[:60],
                type="memory",
                domain=domain,
                niche=niche,
                color=DOMAIN_COLORS.get(domain, "#9E9E9E"),
                size=2,
            )

        for kn in knowledge[:200]:
            nid = kn.get("id", "")
            if not nid or nid in nodes:
                continue
            domain = kn.get("domain", "general")
            niche = kn.get("niche", "general")
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            niche_counts[niche] = niche_counts.get(niche, 0) + 1
            nodes[nid] = MemoryGraphNode(
                id=nid,
                label=(kn.get("content", "") or "")[:60],
                type="knowledge",
                domain=domain,
                niche=niche,
                color=DOMAIN_COLORS.get(domain, "#9E9E9E"),
                size=2,
            )

        node_list = list(nodes.values())
        for i in range(len(node_list)):
            for j in range(i + 1, len(node_list)):
                a, b = node_list[i], node_list[j]
                if a.domain == b.domain and a.domain != "general":
                    edges.append(MemoryGraphEdge(
                        source=a.id, target=b.id,
                        label=a.domain, weight=0.5,
                    ))
                if a.niche == b.niche and a.niche != "general":
                    edges.append(MemoryGraphEdge(
                        source=a.id, target=b.id,
                        label=a.niche, weight=0.8,
                    ))

        if len(edges) > 500:
            edges = edges[:500]

        return MemoryGraph(
            nodes=node_list,
            edges=edges,
            stats={
                "total_nodes": len(node_list),
                "total_edges": len(edges),
                "domains": {
                    d: {"count": c, "color": DOMAIN_COLORS.get(d, "#9E9E9E")}
                    for d, c in sorted(domain_counts.items(), key=lambda x: -x[1])
                },
                "niches": dict(sorted(niche_counts.items(), key=lambda x: -x[1])[:10]),
            },
        )


_memory_graph_instance: Optional[MemoryGraphBuilder] = None


def get_memory_graph() -> MemoryGraphBuilder:
    global _memory_graph_instance
    if _memory_graph_instance is None:
        _memory_graph_instance = MemoryGraphBuilder()
    return _memory_graph_instance
