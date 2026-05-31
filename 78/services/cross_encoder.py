import os
from typing import List, Dict, Any, Tuple
import numpy as np
import torch
from sentence_transformers import CrossEncoder
from dotenv import load_dotenv

load_dotenv()

class CrossEncoderService:
    _instance = None
    _model = None
    _device = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._init_model()
        return cls._instance

    @classmethod
    def _init_model(cls):
        model_name = os.getenv("CROSS_ENCODER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        cls._device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading CrossEncoder model: {model_name} on {cls._device}")
        cls._model = CrossEncoder(model_name, device=cls._device)
        print("CrossEncoder model loaded successfully")

    def rerank(
        self,
        query_text: str,
        candidates: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        if not candidates:
            return []
        
        texts_to_rerank = []
        for candidate in candidates:
            metadata = candidate.get("metadata", {})
            text = metadata.get("text", "") or candidate.get("document", "")
            if not text:
                text = "图片内容"
            texts_to_rerank.append([query_text, text])
        
        scores = self._model.predict(texts_to_rerank)
        
        for i, candidate in enumerate(candidates):
            candidate["cross_encoder_score"] = float(scores[i])
        
        candidates.sort(key=lambda x: x["cross_encoder_score"], reverse=True)
        
        return candidates[:top_k]

    def rerank_with_hybrid(
        self,
        query_text: str,
        candidates: List[Dict[str, Any]],
        top_k: int = 10,
        vector_weight: float = 0.5,
        cross_encoder_weight: float = 0.5
    ) -> List[Dict[str, Any]]:
        if not candidates:
            return []
        
        self.rerank(query_text, candidates, top_k=len(candidates))
        
        vector_scores = np.array([1.0 - c.get("score", 0.0) for c in candidates])
        cross_scores = np.array([c.get("cross_encoder_score", 0.0) for c in candidates])
        
        if vector_scores.max() != vector_scores.min():
            vector_scores = (vector_scores - vector_scores.min()) / (vector_scores.max() - vector_scores.min())
        if cross_scores.max() != cross_scores.min():
            cross_scores = (cross_scores - cross_scores.min()) / (cross_scores.max() - cross_scores.min())
        
        hybrid_scores = vector_weight * vector_scores + cross_encoder_weight * cross_scores
        
        for i, candidate in enumerate(candidates):
            candidate["hybrid_score"] = float(hybrid_scores[i])
        
        candidates.sort(key=lambda x: x["hybrid_score"], reverse=True)
        
        return candidates[:top_k]
