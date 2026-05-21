import os
import logging
from typing import List, Optional
import numpy as np

logger = logging.getLogger("aion.memory.embeddings")

_model = None
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "0.65"))
MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")


def load_model() -> bool:
    global _model
    if _model is not None:
        return True
    try:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model: %s", MODEL_NAME)
        logger.info("First load may download ~80MB from HuggingFace Hub")
        _model = SentenceTransformer(MODEL_NAME)
        dim = _model.get_sentence_embedding_dimension()
        logger.info("Embedding model loaded. Dimension: %s", dim)
        return True
    except Exception as e:
        logger.error("Failed to load embedding model: %s", e)
        return False


def embed(text: str) -> List[float]:
    if _model is None:
        logger.warning("Embedding model not loaded — returning empty vector")
        return []
    try:
        vec = _model.encode(text, normalize_embeddings=True)
        return vec.tolist()
    except Exception as e:
        logger.error("Embedding failed: %s", e)
        return []


def embed_batch(texts: List[str]) -> List[List[float]]:
    if _model is None:
        logger.warning("Embedding model not loaded — returning empty list")
        return []
    try:
        vecs = _model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vecs]
    except Exception as e:
        logger.error("Batch embedding failed: %s", e)
        return []


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    try:
        a_arr = np.array(a, dtype=np.float32)
        b_arr = np.array(b, dtype=np.float32)
        denom = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
        if denom == 0.0:
            return 0.0
        return float(np.dot(a_arr, b_arr) / denom)
    except Exception as e:
        logger.error("Cosine similarity computation failed: %s", e)
        return 0.0
