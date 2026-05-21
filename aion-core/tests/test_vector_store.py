import math
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from aion.memory import vector_store


class _MockCollection:
    """In-memory mock of a ChromaDB collection."""

    def __init__(self, name, metadata=None):
        self.name = name
        self.metadata = metadata or {}
        self._ids = []
        self._embeddings = []
        self._documents = []
        self._metadatas = []

    def add(self, ids, embeddings, documents, metadatas):
        for i, _id in enumerate(ids):
            if _id in self._ids:
                idx = self._ids.index(_id)
                self._embeddings[idx] = embeddings[i]
                self._documents[idx] = documents[i]
                self._metadatas[idx] = metadatas[i]
            else:
                self._ids.append(_id)
                self._embeddings.append(embeddings[i])
                self._documents.append(documents[i])
                self._metadatas.append(metadatas[i])

    def query(self, query_embeddings, n_results, include):
        q = query_embeddings[0]
        scored = []
        for i in range(len(self._ids)):
            dot = sum(a * b for a, b in zip(q, self._embeddings[i]))
            na = math.sqrt(sum(v * v for v in q))
            nb = math.sqrt(sum(v * v for v in self._embeddings[i]))
            sim = dot / (na * nb) if na * nb > 0 else 0.0
            dist = 1.0 - sim
            scored.append((dist, i))
        scored.sort(key=lambda x: x[0])
        top_k = scored[:n_results]
        result = {"ids": [[]], "distances": [[]], "documents": [[]], "metadatas": [[]]}
        for dist, idx in top_k:
            result["ids"][0].append(self._ids[idx])
            result["distances"][0].append(dist)
            result["documents"][0].append(self._documents[idx])
            result["metadatas"][0].append(self._metadatas[idx])
        return result

    def delete(self, ids):
        for _id in ids:
            if _id in self._ids:
                idx = self._ids.index(_id)
                del self._ids[idx]
                del self._embeddings[idx]
                del self._documents[idx]
                del self._metadatas[idx]

    def count(self):
        return len(self._ids)


class _MockPersistentClient:
    """In-memory mock of chromadb.PersistentClient."""

    def __init__(self, path):
        self._collections = {}

    def get_or_create_collection(self, name, metadata=None):
        if name not in self._collections:
            self._collections[name] = _MockCollection(name, metadata)
        return self._collections[name]

    def delete_collection(self, name):
        self._collections.pop(name, None)


@pytest.fixture(autouse=True)
def patch_chromadb(monkeypatch):
    monkeypatch.setattr("chromadb.PersistentClient", _MockPersistentClient)
    vector_store._client = None


class TestVectorStoreCollection:

    @pytest.mark.asyncio
    async def test_get_or_create_collection(self):
        col = await vector_store.get_or_create_collection("app-teste")
        assert col is not None

    @pytest.mark.asyncio
    async def test_collection_cos_metric(self):
        col = await vector_store.get_or_create_collection("app-teste")
        assert col.metadata.get("hnsw:space") == "cosine"

    @pytest.mark.asyncio
    async def test_get_or_create_collection_is_idempotent(self):
        c1 = await vector_store.get_or_create_collection("app-teste")
        c2 = await vector_store.get_or_create_collection("app-teste")
        assert c1 is c2

    @pytest.mark.asyncio
    async def test_multiple_tenants_different_collections(self):
        col_a = await vector_store.get_or_create_collection("tenant-a")
        col_b = await vector_store.get_or_create_collection("tenant-b")
        assert col_a is not col_b


class TestVectorStoreCRUD:

    @pytest.mark.asyncio
    async def test_add_and_search_memory(self):
        mem_id = "mem-001"
        content = "Lembrar de comprar pão"
        emb = [1.0, 0.0, 0.0]
        await vector_store.add_memory("app-x", mem_id, content, emb)

        query_emb = [0.95, 0.1, 0.0]
        results = await vector_store.semantic_search("app-x", query_emb, n_results=1)
        assert len(results) == 1
        assert results[0]["id"] == mem_id
        assert results[0]["content"] == content
        assert results[0]["similarity"] > 0.9

    @pytest.mark.asyncio
    async def test_add_and_search_knowledge(self):
        kid = "know-001"
        content = "Regra: reuniões às quartas"
        emb = [0.0, 0.0, 1.0]
        meta = {"tags": "reuniao,regras"}
        await vector_store.add_knowledge("app-x", kid, content, emb, meta)
        results = await vector_store.semantic_search("app-x", [0.0, 0.1, 0.95], n_results=1)
        assert len(results) == 1
        assert results[0]["content"] == content
        assert results[0]["metadata"]["tags"] == meta["tags"]

    @pytest.mark.asyncio
    async def test_search_returns_closest_first(self):
        await vector_store.add_memory("app-y", "id1", "cachorro", [1.0, 0.0, 0.0])
        await vector_store.add_memory("app-y", "id2", "computador", [0.0, 0.0, 1.0])
        results = await vector_store.semantic_search("app-y", [0.9, 0.1, 0.0], n_results=2, threshold=0.0)
        assert len(results) == 2
        assert results[0]["id"] == "id1"
        assert results[1]["id"] == "id2"

    @pytest.mark.asyncio
    async def test_search_respects_threshold(self):
        await vector_store.add_memory("app-z", "id1", "cachorro", [1.0, 0.0, 0.0])
        await vector_store.add_memory("app-z", "id2", "computador", [0.0, 0.0, 1.0])
        results = await vector_store.semantic_search("app-z", [1.0, 0.0, 0.0], n_results=5, threshold=0.8)
        assert len(results) == 1
        assert results[0]["id"] == "id1"

    @pytest.mark.asyncio
    async def test_search_empty_collection(self):
        results = await vector_store.semantic_search("inexistente", [1.0, 0.0, 0.0])
        assert results == []

    @pytest.mark.asyncio
    async def test_delete_vector(self):
        await vector_store.add_memory("app-w", "vid", "conteúdo", [1.0, 0.0, 0.0])
        assert await vector_store.count_vectors("app-w") == 1
        ok = await vector_store.delete_vector("app-w", "vid")
        assert ok is True
        assert await vector_store.count_vectors("app-w") == 0

    @pytest.mark.asyncio
    async def test_delete_collection(self):
        await vector_store.add_memory("app-v", "id1", "teste", [1.0, 0.0, 0.0])
        ok = await vector_store.delete_collection("app-v")
        assert ok is True
        results = await vector_store.semantic_search("app-v", [1.0, 0.0, 0.0])
        assert results == []

    @pytest.mark.asyncio
    async def test_count_vectors(self):
        await vector_store.add_memory("app-u", "a", "um", [1.0, 0.0, 0.0])
        await vector_store.add_memory("app-u", "b", "dois", [0.0, 1.0, 0.0])
        assert await vector_store.count_vectors("app-u") == 2


class TestVectorStoreIsolation:

    @pytest.mark.asyncio
    async def test_tenant_isolation(self):
        await vector_store.add_memory("tenant-1", "m1", "memória privada", [1.0, 0.0, 0.0])
        await vector_store.add_memory("tenant-2", "m2", "outra memória", [0.0, 1.0, 0.0])
        r1 = await vector_store.semantic_search("tenant-1", [1.0, 0.0, 0.0], n_results=5)
        r2 = await vector_store.semantic_search("tenant-2", [0.0, 1.0, 0.0], n_results=5)
        assert len(r1) == 1
        assert r1[0]["id"] == "m1"
        assert len(r2) == 1
        assert r2[0]["id"] == "m2"

    @pytest.mark.asyncio
    async def test_tenant_data_no_leak(self):
        await vector_store.add_memory("seguro", "s1", "dado sigiloso", [1.0, 0.0, 0.0])
        r = await vector_store.semantic_search("outro", [1.0, 0.0, 0.0], n_results=5)
        assert r == []


class TestVectorStoreEdgeCases:

    @pytest.mark.asyncio
    async def test_add_and_update_same_id(self):
        await vector_store.add_memory("app", "id1", "original", [1.0, 0.0, 0.0])
        await vector_store.add_memory("app", "id1", "atualizado", [0.0, 1.0, 0.0])
        results = await vector_store.semantic_search("app", [0.0, 1.0, 0.0], n_results=1)
        assert results[0]["content"] == "atualizado"

    @pytest.mark.asyncio
    async def test_metadata_preserved(self):
        meta = {"source": "voice", "device": "mobile"}
        await vector_store.add_memory("app", "m1", "conteúdo", [1.0, 0.0, 0.0], meta)
        results = await vector_store.semantic_search("app", [1.0, 0.0, 0.0], n_results=1)
        assert results[0]["metadata"]["source"] == "voice"
        assert results[0]["metadata"]["type"] == "memory"

    @pytest.mark.asyncio
    async def test_sanitized_collection_names(self):
        col = await vector_store.get_or_create_collection("app-id@especial#123")
        assert col.name == "app-idespecial123"

    @pytest.mark.asyncio
    async def test_persist_dir_config(self):
        assert vector_store.PERSIST_DIR is not None
