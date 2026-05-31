import os
from typing import Optional, Dict, Any, List
from celery.result import AsyncResult
from dotenv import load_dotenv

load_dotenv()

USE_CELERY = os.getenv("USE_CELERY", "false").lower() == "true"

if USE_CELERY:
    from services.celery_tasks import (
        full_text_search,
        full_image_search,
        full_multimodal_search,
        index_item,
        batch_index_items,
        clear_cache,
    )

class TaskService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def use_celery(self) -> bool:
        return USE_CELERY

    def search_text(
        self,
        text: str,
        top_k: int = 10,
        use_rerank: bool = True,
        use_hybrid: bool = True,
        filter_metadata: Optional[Dict[str, Any]] = None,
        async_mode: bool = False
    ):
        if USE_CELERY and async_mode:
            return full_text_search.delay(
                text=text,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                filter_metadata=filter_metadata
            )
        else:
            return full_text_search(
                text=text,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                filter_metadata=filter_metadata
            )

    def search_image(
        self,
        image_path: str,
        text: Optional[str] = None,
        top_k: int = 10,
        use_rerank: bool = True,
        use_hybrid: bool = True,
        filter_metadata: Optional[Dict[str, Any]] = None,
        async_mode: bool = False
    ):
        if USE_CELERY and async_mode:
            return full_image_search.delay(
                image_path=image_path,
                text=text,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                filter_metadata=filter_metadata
            )
        else:
            return full_image_search(
                image_path=image_path,
                text=text,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                filter_metadata=filter_metadata
            )

    def search_multimodal(
        self,
        text: Optional[str] = None,
        image_path: Optional[str] = None,
        top_k: int = 10,
        use_rerank: bool = True,
        use_hybrid: bool = True,
        vector_weight: float = 0.5,
        cross_encoder_weight: float = 0.5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        async_mode: bool = False
    ):
        if USE_CELERY and async_mode:
            return full_multimodal_search.delay(
                text=text,
                image_path=image_path,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                vector_weight=vector_weight,
                cross_encoder_weight=cross_encoder_weight,
                filter_metadata=filter_metadata
            )
        else:
            return full_multimodal_search(
                text=text,
                image_path=image_path,
                top_k=top_k,
                use_rerank=use_rerank,
                use_hybrid=use_hybrid,
                vector_weight=vector_weight,
                cross_encoder_weight=cross_encoder_weight,
                filter_metadata=filter_metadata
            )

    def index_item_async(
        self,
        text: Optional[str] = None,
        image_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        if USE_CELERY:
            return index_item.delay(
                text=text,
                image_path=image_path,
                metadata=metadata
            )
        else:
            return index_item(
                text=text,
                image_path=image_path,
                metadata=metadata
            )

    def batch_index_async(
        self,
        items: List[Dict[str, Any]]
    ):
        if USE_CELERY:
            return batch_index_items.delay(items=items)
        else:
            return batch_index_items(items=items)

    def clear_cache_async(self):
        if USE_CELERY:
            return clear_cache.delay()
        else:
            return clear_cache()

    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        if not USE_CELERY:
            return {"status": "error", "message": "Celery is not enabled"}
        
        task = AsyncResult(task_id)
        if task.state == "PENDING":
            return {"status": "pending", "task_id": task_id}
        elif task.state == "STARTED":
            return {"status": "processing", "task_id": task_id}
        elif task.state == "SUCCESS":
            return {"status": "success", "task_id": task_id, "result": task.result}
        elif task.state == "FAILURE":
            return {"status": "failed", "task_id": task_id, "error": str(task.info)}
        else:
            return {"status": task.state.lower(), "task_id": task_id}
