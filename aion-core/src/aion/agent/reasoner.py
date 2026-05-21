import re
import logging
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger("aion.agent.reasoner")


def compute_rag_confidence(rag_context: str) -> float:
    if not rag_context or not rag_context.strip():
        return 0.0
    confs = re.findall(r"confidence:\s*([\d.]+)", rag_context)
    if not confs:
        return 0.0
    return max(float(c) for c in confs)


def decide_response_source(confidence: float, input: str = "", app_id: str = "") -> str:
    if input:
        from aion.learning.knowledge_gap import detect_gap
        gap = detect_gap(app_id, input, confidence)
        if gap.gap_type in ("already_known", "personal_memory"):
            return "cache"
        if gap.gap_type in ("ignore", "current_event"):
            return "llm"
    if confidence >= 0.75:
        return "cache"
    elif confidence >= 0.50:
        return "enrich"
    return "llm"


async def build_rag_context(app_id: str, input: str) -> str:
    from aion.memory import sqlite_store, embeddings, vector_store

    memories = await sqlite_store.get_memories(app_id, limit=5)
    knowledge = await sqlite_store.search_knowledge(app_id, input)

    parts = []
    if memories:
        lines = ["## Relevant Memories"]
        for m in memories:
            mtype = m.get("type", "unknown")
            mcontent = m.get("content", "")
            mconf = m.get("confidence", 0)
            lines.append(f"- [{mtype}] (confidence: {mconf}) {mcontent}")
        parts.append("\n".join(lines))

    knowledge = [k for k in knowledge if "volatile" not in k.get("tags", [])]
    if knowledge:
        lines = ["## Relevant Knowledge"]
        for k in knowledge:
            ktags = ", ".join(k.get("tags", []))
            kcontent = k.get("content", "")
            kconf = k.get("confidence", 0)
            lines.append(f"- (confidence: {kconf}, tags: {ktags}) {kcontent}")
        parts.append("\n".join(lines))

    query_emb = embeddings.embed(input)
    if query_emb:
        semantic = await vector_store.semantic_search(app_id, query_emb, n_results=3)
        if semantic:
            slines = ["## Semantic Matches"]
            for s in semantic:
                stag = s["metadata"].get("tags", "")
                if "volatile" in stag:
                    continue
                stype = s["metadata"].get("type", "unknown")
                scontent = s.get("content", "")
                ssim = s.get("similarity", 0)
                slines.append(f"- [{stype}] (similarity: {ssim:.3f}) {scontent}")
            parts.append("\n".join(slines))

    return "\n".join(parts)


def build_cache_reply(rag_context: str, input: str) -> str:
    return f"[Cached from RAG]\n\nWith your context and memory:\n\n{rag_context}"


def extract_reply(response: str) -> str:
    import json
    try:
        data = json.loads(response)
        if isinstance(data, dict):
            if "content" in data and data["content"]:
                return data["content"]
    except (json.JSONDecodeError, TypeError):
        pass
    return response


def try_parse_tool_calls(response: str) -> List[Dict[str, Any]]:
    import json
    try:
        data = json.loads(response)
        if isinstance(data, dict):
            if "tool_calls" in data and isinstance(data["tool_calls"], list):
                return data["tool_calls"]
            if "tool" in data:
                return [{"name": data["tool"], "arguments": data.get("params", {})}]
    except (json.JSONDecodeError, TypeError):
        pass
    return []
