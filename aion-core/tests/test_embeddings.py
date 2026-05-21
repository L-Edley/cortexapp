import os
import math
import pytest
import numpy as np
from aion.memory import embeddings


class MockSentenceTransformer:
    """Reusable mock that avoids downloading the real 80MB model."""

    def __init__(self, model_name):
        self._dim = 384

    def get_sentence_embedding_dimension(self):
        return self._dim

    def encode(self, sentences, normalize_embeddings=True):
        if isinstance(sentences, str):
            if "cachorro" in sentences:
                raw = np.array([0.9, 0.1, 0.0] + [0.0] * 381, dtype=np.float32)
            elif "gato" in sentences:
                raw = np.array([0.85, 0.15, 0.0] + [0.0] * 381, dtype=np.float32)
            elif "computador" in sentences or "notebook" in sentences:
                raw = np.array([0.1, 0.0, 0.9] + [0.0] * 381, dtype=np.float32)
            else:
                raw = np.random.default_rng(42).normal(size=self._dim).astype(np.float32)
            return raw / np.linalg.norm(raw) if normalize_embeddings else raw
        batch = [self.encode(s, normalize_embeddings) for s in sentences]
        return np.array(batch)


@pytest.fixture(autouse=True)
def patch_model(monkeypatch):
    monkeypatch.setattr("sentence_transformers.SentenceTransformer", MockSentenceTransformer)
    embeddings._model = None


class TestEmbeddingsModel:

    def test_load_model_returns_true(self):
        assert embeddings.load_model() is True
        assert embeddings._model is not None

    def test_embed_returns_empty_list_when_no_model(self):
        embeddings._model = None
        assert embeddings.embed("test") == []

    def test_embed_batch_returns_empty_when_no_model(self):
        embeddings._model = None
        assert embeddings.embed_batch(["a", "b"]) == []

    def test_cosine_similarity_empty_returns_zero(self):
        assert embeddings.cosine_similarity([], [1.0]) == 0.0

    def test_cosine_similarity_different_lengths_returns_zero(self):
        assert embeddings.cosine_similarity([0.1, 0.2], [0.3]) == 0.0

    def test_load_model_is_idempotent(self):
        embeddings.load_model()
        first = id(embeddings._model)
        embeddings.load_model()
        second = id(embeddings._model)
        assert first == second


class TestCosineSimilarity:

    def test_identical_vectors(self):
        a = [1.0, 0.0, 0.0]
        b = [1.0, 0.0, 0.0]
        assert math.isclose(embeddings.cosine_similarity(a, b), 1.0)

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert math.isclose(embeddings.cosine_similarity(a, b), 0.0)

    def test_opposite_vectors(self):
        a = [1.0, 0.0]
        b = [-1.0, 0.0]
        assert math.isclose(embeddings.cosine_similarity(a, b), -1.0)

    def test_partial_similarity(self):
        a = [1.0, 0.0, 0.0]
        b = [0.0, 1.0, 0.0]
        assert math.isclose(embeddings.cosine_similarity(a, b), 0.0)
        c = [3.0, 0.0, 0.0]
        assert math.isclose(embeddings.cosine_similarity(a, c), 1.0)

    def test_semantic_similarity_portuguese(self):
        embeddings.load_model()
        dog = embeddings.embed("cachorro")
        cat = embeddings.embed("gato")
        comp = embeddings.embed("computador")
        dog_cat = embeddings.cosine_similarity(dog, cat)
        dog_comp = embeddings.cosine_similarity(dog, comp)
        assert dog_cat > dog_comp, (
            f"cachorro × gato ({dog_cat:.4f}) should be > "
            f"cachorro × computador ({dog_comp:.4f})"
        )

    def test_similarity_different_texts(self):
        embeddings.load_model()
        a = embeddings.embed("cachorro grande")
        b = embeddings.embed("gato pequeno")
        c = embeddings.embed("computador novo")
        ab = embeddings.cosine_similarity(a, b)
        ac = embeddings.cosine_similarity(a, c)
        assert ab > ac, (
            f"cachorro×gato ({ab:.4f}) should be > "
            f"cachorro×computador ({ac:.4f})"
        )


class TestDefaultThreshold:

    def test_default_threshold_is_0_65(self):
        assert embeddings.SIMILARITY_THRESHOLD == 0.65

    def test_threshold_from_env(self, monkeypatch):
        monkeypatch.setenv("SIMILARITY_THRESHOLD", "0.80")
        import importlib
        importlib.reload(embeddings)
        assert embeddings.SIMILARITY_THRESHOLD == 0.80
        monkeypatch.delenv("SIMILARITY_THRESHOLD", raising=False)
        importlib.reload(embeddings)

    def test_default_model_name(self):
        assert embeddings.MODEL_NAME == "all-MiniLM-L6-v2"


class TestEmbedBatch:

    def test_embed_batch_returns_correct_count(self):
        embeddings.load_model()
        texts = ["primeiro texto", "segundo texto", "terceiro texto"]
        vecs = embeddings.embed_batch(texts)
        assert len(vecs) == 3
        assert all(len(v) > 0 for v in vecs)

    def test_embed_batch_different_from_single(self):
        embeddings.load_model()
        batch = embeddings.embed_batch(["apenas um"])
        single = embeddings.embed("apenas um")
        assert len(batch) == 1
        assert len(batch[0]) == len(single)
