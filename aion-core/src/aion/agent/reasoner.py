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
    from aion.memory.memory_taxonomy import infer_query_niche, should_search_niche, classify_memory_niche

    query_niche = infer_query_niche(app_id, input)

    memories = await sqlite_store.get_memories(app_id, limit=10)
    knowledge = await sqlite_store.search_knowledge(app_id, input)

    parts = []
    if memories:
        lines = ["## Relevant Memories"]
        for m in memories:
            mtype = m.get("type", "unknown")
            mcontent = m.get("content", "")
            mconf = m.get("confidence", 0)
            mmd = m.get("metadata") or {}
            mem_tax = classify_memory_niche(app_id, mcontent, mmd)
            if not should_search_niche(query_niche, mem_tax):
                continue
            lines.append(f"- [{mtype}] (confidence: {mconf}) {mcontent}")
        if len(lines) > 1:
            parts.append("\n".join(lines))

    knowledge = [k for k in knowledge if "volatile" not in k.get("tags", [])]
    if knowledge:
        lines = ["## Relevant Knowledge"]
        for k in knowledge:
            ktags = ", ".join(k.get("tags", []))
            kcontent = k.get("content", "")
            kconf = k.get("confidence", 0)
            kniche = classify_memory_niche(app_id, kcontent, {"tags": k.get("tags", [])})
            if not should_search_niche(query_niche, kniche):
                continue
            lines.append(f"- (confidence: {kconf}, tags: {ktags}) {kcontent}")
        if len(lines) > 1:
            parts.append("\n".join(lines))

    query_emb = embeddings.embed(input)
    if query_emb:
        semantic = await vector_store.semantic_search(app_id, query_emb, n_results=5)
        if semantic:
            slines = ["## Semantic Matches"]
            for s in semantic:
                stag = s["metadata"].get("tags", "")
                if "volatile" in stag:
                    continue
                stype = s["metadata"].get("type", "unknown")
                scontent = s.get("content", "")
                ssim = s.get("similarity", 0)
                smeta = s.get("metadata", {})
                sniche_val = smeta.get("niche", "general")
                sniche_tax = classify_memory_niche(app_id, scontent, smeta)
                sniche_tax.niche = sniche_val
                if not should_search_niche(query_niche, sniche_tax):
                    continue
                slines.append(f"- [{stype}] (similarity: {ssim:.3f}) {scontent}")
            if len(slines) > 1:
                parts.append("\n".join(slines))

    return "\n".join(parts)


def build_cache_answer(
    input: str,
    memories: Optional[List[Dict[str, Any]]] = None,
    knowledge: Optional[List[Dict[str, Any]]] = None,
    semantic_results: Optional[List[Dict[str, Any]]] = None,
) -> str:
    from aion.memory.memory_taxonomy import infer_query_niche, classify_memory_niche

    query_niche = infer_query_niche("", input)

    candidates = []

    if memories:
        for m in memories:
            mmd = m.get("metadata") or {}
            tax = classify_memory_niche("", m.get("content", ""), mmd)
            if tax.niche == query_niche.niche or tax.niche == "general" or query_niche.niche == "general" or query_niche.confidence < 0.4:
                candidates.append({
                    "content": m.get("content", ""),
                    "confidence": m.get("confidence", 0),
                    "source": "memory",
                })

    if knowledge:
        for k in knowledge:
            if "volatile" in k.get("tags", []):
                continue
            tax = classify_memory_niche("", k.get("content", ""), {"tags": k.get("tags", [])})
            if tax.niche == query_niche.niche or tax.niche == "general" or query_niche.niche == "general" or query_niche.confidence < 0.4:
                candidates.append({
                    "content": k.get("content", ""),
                    "confidence": k.get("confidence", 0),
                    "source": "knowledge",
                })

    if semantic_results:
        for s in semantic_results:
            stag = s["metadata"].get("tags", "")
            if "volatile" in stag:
                continue
            sniche = s["metadata"].get("niche", "general")
            if sniche == query_niche.niche or sniche == "general" or query_niche.niche == "general" or s.get("similarity", 0) >= 0.85:
                candidates.append({
                    "content": s.get("content", ""),
                    "confidence": s.get("similarity", 0),
                    "source": "semantic",
                })

    if not candidates:
        best = None
        for src_name, src_list in [("memory", memories), ("knowledge", knowledge), ("semantic", semantic_results)]:
            if src_list:
                best = {
                    "content": src_list[0].get("content", "") if isinstance(src_list[0], dict) else "",
                    "confidence": src_list[0].get("confidence", src_list[0].get("similarity", 0)) if isinstance(src_list[0], dict) else 0,
                    "source": src_name,
                }
                break
        if best and best.get("content"):
            candidates = [best]

    if not candidates:
        return ""

    best_candidate = max(candidates, key=lambda c: c["confidence"])
    content = best_candidate.get("content", "").strip()

    if not content:
        return ""

    if best_candidate["confidence"] < 0.4:
        return ""

    content_lower = content.lower()
    input_lower = input.lower()

    input_words = set(re.findall(r'\w+', input_lower))
    content_words = set(re.findall(r'\w+', content_lower))
    common = input_words & content_words

    if len(input_words) > 2 and len(common) == 0 and best_candidate["confidence"] < 0.6:
        return ""

    return content


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
