import os
import sys
from typing import List, Dict, Any, Optional
from pathlib import Path
import numpy as np
from celery import Task
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).parent.parent))

from celery_app import app
from services.clip_service import CLIPService
from services.vector_db import VectorDBService
from services.cross_encoder import CrossEncoderService
from services.lru_cache import SearchCache

load_dotenv()

class ModelTask(Task):
    _clip_service = None
    _vector_db = None
    _cross_encoder = None
    _search_cache = None

    def __call__(self, *args, **kwargs):
        if self._clip_service is None:
            self._clip_service = CLIPService()
        if self._vector_db is None:
            self._vector_db = VectorDBService()
        if self._cross_encoder is None:
            self._cross_encoder = CrossEncoderService()
        if self._search_cache is None:
            self._search_cache = SearchCache()
        return self.run(*args, **kwargs)

@app.task(base=ModelTask, bind=True, name="encode_text")
def encode_text(self, text: str) -> List[float]:
    try:
        embedding = self._clip_service.encode_text(text)
        return embedding.tolist()
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="encode_image")
def encode_image(self, image_path: str) -> List[float]:
    try:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        embedding = self._clip_service.encode_image(image_path)
        return embedding.tolist()
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="encode_multimodal")
def encode_multimodal(self, text: Optional[str] = None, image_path: Optional[str] = None) -> List[float]:
    try:
        embedding = self._clip_service.encode_multimodal(text=text, image=image_path)
        return embedding.tolist()
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="search_vectors")
def search_vectors(
    self,
    query_embedding: List[float],
    top_k: int = 10,
    filter_metadata: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    try:
        results = self._vector_db.search(
            query_embedding=query_embedding,
            top_k=top_k,
            filter_metadata=filter_metadata
        )
        return results
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="rerank_results")
def rerank_results(
    self,
    query_text: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 10,
    use_hybrid: bool = True,
    vector_weight: float = 0.5,
    cross_encoder_weight: float = 0.5
) -> List[Dict[str, Any]]:
    try:
        if use_hybrid:
            results = self._cross_encoder.rerank_with_hybrid(
                query_text=query_text,
                candidates=candidates,
                top_k=top_k,
                vector_weight=vector_weight,
                cross_encoder_weight=cross_encoder_weight
            )
        else:
            results = self._cross_encoder.rerank(
                query_text=query_text,
                candidates=candidates,
                top_k=top_k
            )
        return results
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="full_text_search")
def full_text_search(
    self,
    text: str,
    top_k: int = 10,
    use_rerank: bool = True,
    use_hybrid: bool = True,
    filter_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    try:
        cache = self._search_cache.get_text_cache()
        cache_key = {
            "text": text,
            "top_k": top_k,
            "use_rerank": use_rerank,
            "use_hybrid": use_hybrid,
            "filter": filter_metadata
        }
        
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return {"results": cached_result, "from_cache": True}
        
        query_embedding = self._clip_service.encode_text(text)
        
        initial_k = top_k * 3 if use_rerank else top_k
        results = self._vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=filter_metadata
        )
        
        if use_rerank and results:
            if use_hybrid:
                results = self._cross_encoder.rerank_with_hybrid(
                    query_text=text,
                    candidates=results,
                    top_k=top_k
                )
            else:
                results = self._cross_encoder.rerank(
                    query_text=text,
                    candidates=results,
                    top_k=top_k
                )
        
        results = results[:top_k]
        cache.put(cache_key, results)
        
        return {"results": results, "from_cache": False}
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="full_image_search")
def full_image_search(
    self,
    image_path: str,
    text: Optional[str] = None,
    top_k: int = 10,
    use_rerank: bool = True,
    use_hybrid: bool = True,
    filter_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    try:
        cache = self._search_cache.get_image_cache()
        cache_key = {
            "image_path": image_path,
            "text": text,
            "top_k": top_k,
            "use_rerank": use_rerank,
            "use_hybrid": use_hybrid,
            "filter": filter_metadata
        }
        
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return {"results": cached_result, "from_cache": True}
        
        query_embedding = self._clip_service.encode_multimodal(text=text, image=image_path)
        
        initial_k = top_k * 3 if use_rerank else top_k
        results = self._vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=filter_metadata
        )
        
        if use_rerank and results and text:
            if use_hybrid:
                results = self._cross_encoder.rerank_with_hybrid(
                    query_text=text,
                    candidates=results,
                    top_k=top_k
                )
            else:
                results = self._cross_encoder.rerank(
                    query_text=text,
                    candidates=results,
                    top_k=top_k
                )
        
        results = results[:top_k]
        cache.put(cache_key, results)
        
        return {"results": results, "from_cache": False}
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="full_multimodal_search")
def full_multimodal_search(
    self,
    text: Optional[str] = None,
    image_path: Optional[str] = None,
    top_k: int = 10,
    use_rerank: bool = True,
    use_hybrid: bool = True,
    vector_weight: float = 0.5,
    cross_encoder_weight: float = 0.5,
    filter_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    try:
        cache = self._search_cache.get_multimodal_cache()
        cache_key = {
            "text": text,
            "image_path": image_path,
            "top_k": top_k,
            "use_rerank": use_rerank,
            "use_hybrid": use_hybrid,
            "vector_weight": vector_weight,
            "cross_encoder_weight": cross_encoder_weight,
            "filter": filter_metadata
        }
        
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return {"results": cached_result, "from_cache": True}
        
        query_embedding = self._clip_service.encode_multimodal(text=text, image=image_path)
        
        initial_k = top_k * 3 if use_rerank else top_k
        results = self._vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=filter_metadata
        )
        
        if use_rerank and results and text:
            results = self._cross_encoder.rerank_with_hybrid(
                query_text=text,
                candidates=results,
                top_k=top_k,
                vector_weight=vector_weight,
                cross_encoder_weight=cross_encoder_weight
            )
        
        results = results[:top_k]
        cache.put(cache_key, results)
        
        return {"results": results, "from_cache": False}
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="index_item")
def index_item(
    self,
    text: Optional[str] = None,
    image_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    try:
        embedding = self._clip_service.encode_multimodal(text=text, image=image_path)
        item_id = self._vector_db.add_item(
            embedding=embedding.tolist(),
            text=text,
            image_path=image_path,
            metadata=metadata
        )
        
        self._search_cache.clear_all()
        
        return item_id
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(base=ModelTask, bind=True, name="batch_index_items")
def batch_index_items(
    self,
    items: List[Dict[str, Any]]
) -> List[str]:
    try:
        embeddings = []
        texts = []
        image_paths = []
        metadatas = []
        
        for item in items:
            text = item.get("text")
            image_path = item.get("image_path")
            metadata = item.get("metadata", {})
            
            embedding = self._clip_service.encode_multimodal(text=text, image=image_path)
            embeddings.append(embedding.tolist())
            texts.append(text)
            image_paths.append(image_path)
            metadatas.append(metadata)
        
        ids = self._vector_db.add_items(
            embeddings=embeddings,
            texts=texts,
            image_paths=image_paths,
            metadatas=metadatas
        )
        
        self._search_cache.clear_all()
        
        return ids
    except Exception as e:
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

@app.task(name="clear_cache")
def clear_cache() -> bool:
    try:
        search_cache = SearchCache()
        search_cache.clear_all()
        return True
    except Exception as e:
        raise
