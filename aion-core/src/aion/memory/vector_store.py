import os
import asyncio
import logging
from typing import List, Optional, Dict, Any

logger = logging.getLogger("aion.memory.vector_store")

_client = None
PERSIST_DIR = os.environ.get("VECTOR_STORE_PATH") or "data/vectors"


def _get_client():
    global _client
    if _client is None:
        import chromadb
        os.makedirs(PERSIST_DIR, exist_ok=True)
        _client = chromadb.PersistentClient(path=PERSIST_DIR)
    return _client


async def get_or_create_collection(app_id: str):
    client = await asyncio.to_thread(_get_client)
    safe_name = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
    return await asyncio.to_thread(
        lambda: client.get_or_create_collection(
            name=safe_name,
            metadata={"hnsw:space": "cosine", "tenant": app_id},
        )
    )


async def add_memory(
    app_id: str,
    memory_id: str,
    content: str,
    embedding: List[float],
    metadata: Optional[Dict[str, Any]] = None,
    domain: Optional[str] = None,
    niche: Optional[str] = None,
    topic: Optional[str] = None,
    scope: Optional[str] = None,
    source_mode: Optional[str] = None,
) -> None:
    from aion.memory.memory_taxonomy import classify_memory_niche, taxonomy_to_metadata
    meta = {"type": "memory", "source_id": memory_id}
    if not domain or not niche:
        tax = classify_memory_niche(app_id, content, metadata)
        domain = domain or tax.domain
        niche = niche or tax.niche
        topic = topic or tax.topic
        scope = scope or tax.scope
        source_mode = source_mode or tax.source_mode
    tax_meta = taxonomy_to_metadata(
        classify_memory_niche(app_id, content, metadata),
        {"domain": domain, "niche": niche, "topic": topic or "", "scope": scope or "app", "source_mode": source_mode or "chat"},
    )
    meta.update(tax_meta)
    if metadata:
        meta.update(metadata)
    collection = await get_or_create_collection(app_id)
    await asyncio.to_thread(
        collection.add,
        ids=[memory_id],
        embeddings=[embedding],
        documents=[content],
        metadatas=[meta],
    )


async def add_knowledge(
    app_id: str,
    knowledge_id: str,
    content: str,
    embedding: List[float],
    metadata: Optional[Dict[str, Any]] = None,
    domain: Optional[str] = None,
    niche: Optional[str] = None,
    topic: Optional[str] = None,
    scope: Optional[str] = None,
    source_mode: Optional[str] = None,
) -> None:
    from aion.memory.memory_taxonomy import classify_memory_niche, taxonomy_to_metadata
    meta = {"type": "knowledge", "source_id": knowledge_id}
    if not domain or not niche:
        tax = classify_memory_niche(app_id, content, metadata)
        domain = domain or tax.domain
        niche = niche or tax.niche
        topic = topic or tax.topic
        scope = scope or tax.scope
        source_mode = source_mode or tax.source_mode
    tax_meta = taxonomy_to_metadata(
        classify_memory_niche(app_id, content, metadata),
        {"domain": domain, "niche": niche, "topic": topic or "", "scope": scope or "app", "source_mode": source_mode or "chat"},
    )
    meta.update(tax_meta)
    if metadata:
        meta.update(metadata)
    collection = await get_or_create_collection(app_id)
    await asyncio.to_thread(
        collection.add,
        ids=[knowledge_id],
        embeddings=[embedding],
        documents=[content],
        metadatas=[meta],
    )


async def semantic_search(
    app_id: str,
    query_embedding: List[float],
    n_results: int = 5,
    threshold: Optional[float] = None,
) -> List[Dict[str, Any]]:
    from aion.memory.embeddings import SIMILARITY_THRESHOLD
    threshold = threshold if threshold is not None else SIMILARITY_THRESHOLD

    try:
        collection = await get_or_create_collection(app_id)
    except Exception:
        return []

    try:
        results = await asyncio.to_thread(
            collection.query,
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error("Semantic search failed for tenant '%s': %s", app_id, e)
        return []

    if not results["ids"] or not results["ids"][0]:
        return []

    entries = []
    for i in range(len(results["ids"][0])):
        if results.get("distances"):
            sim = 1.0 - results["distances"][0][i]
        else:
            sim = 0.0
        if sim >= threshold:
            entries.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i] if results.get("documents") else "",
                "metadata": results["metadatas"][0][i] if results.get("metadatas") else {},
                "similarity": sim,
            })

    return entries


async def delete_collection(app_id: str) -> bool:
    try:
        client = await asyncio.to_thread(_get_client)
        safe_name = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
        await asyncio.to_thread(client.delete_collection, safe_name)
        return True
    except Exception as e:
        logger.warning("Failed to delete collection '%s': %s", app_id, e)
        return False


async def delete_vector(app_id: str, vector_id: str) -> bool:
    try:
        collection = await get_or_create_collection(app_id)
        await asyncio.to_thread(collection.delete, ids=[vector_id])
        return True
    except Exception as e:
        logger.warning("Failed to delete vector '%s' for tenant '%s': %s", vector_id, app_id, e)
        return False


async def count_vectors(app_id: str) -> int:
    try:
        collection = await get_or_create_collection(app_id)
        count = await asyncio.to_thread(collection.count)
        return count
    except Exception:
        return 0
