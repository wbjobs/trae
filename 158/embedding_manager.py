from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer

from config import settings


class EmbeddingManager:
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._model is None:
            self._load_model()

    def _load_model(self):
        print(f"Loading embedding model: {settings.EMBEDDING_MODEL_NAME}")
        self._model = SentenceTransformer(
            settings.EMBEDDING_MODEL_NAME,
            device=settings.EMBEDDING_DEVICE
        )
        print("Embedding model loaded successfully.")

    def get_embedding(self, text: str) -> List[float]:
        if not text.strip():
            return [0.0] * 384
        embedding = self._model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        embeddings = self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.tolist()

    def get_embedding_dim(self) -> int:
        if self._model is None:
            self._load_model()
        return self._model.get_sentence_embedding_dimension()
