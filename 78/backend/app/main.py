import os
import sys
import time
import uuid
from typing import Optional, List, Dict, Any
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import aiofiles
from PIL import Image

sys.path.append(str(Path(__file__).parent.parent.parent))

from services.clip_service import CLIPService
from services.vector_db import VectorDBService
from services.cross_encoder import CrossEncoderService
from services.lru_cache import SearchCache
from services.task_service import TaskService
from services.feedback_store import FeedbackStore
from services.ab_testing import ABTestManager, ModelVersionManager, get_user_id
from services.training_scheduler import TrainingScheduler
from services.lora_trainer import LoRAInferenceService
from backend.app.models import (
    TextSearchRequest,
    ImageSearchRequest,
    MultimodalSearchRequest,
    SearchResponse,
    SearchResult,
    IndexResponse,
    DeleteResponse,
    StatsResponse,
)
from backend.app.feedback_models import (
    FeedbackRequest,
    FeedbackStatsResponse,
    ScheduledTrainingInfo,
    TrainingConfig,
    TrainingResult,
)

load_dotenv()

app = FastAPI(
    title="多模态搜索系统",
    description="基于CLIP + ChromaDB + Cross-Encoder的图文混合搜索系统，支持主动学习反馈回路",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

STATIC_DIR = Path(__file__).parent.parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def root():
    if (STATIC_DIR / "index.html").exists():
        return FileResponse(str(STATIC_DIR / "index.html"))
    return {"message": "多模态搜索系统API", "docs": "/docs"}

clip_service = None
vector_db = None
cross_encoder = None
search_cache = None
task_service = None
feedback_store = None
ab_test_manager = None
model_version_manager = None
training_scheduler = None
lora_inference = None

@app.on_event("startup")
async def startup_event():
    global clip_service, vector_db, cross_encoder, search_cache, task_service
    global feedback_store, ab_test_manager, model_version_manager, training_scheduler, lora_inference
    
    clip_service = CLIPService()
    vector_db = VectorDBService()
    cross_encoder = CrossEncoderService()
    search_cache = SearchCache()
    task_service = TaskService()
    feedback_store = FeedbackStore()
    ab_test_manager = ABTestManager()
    model_version_manager = ModelVersionManager()
    training_scheduler = TrainingScheduler()
    lora_inference = LoRAInferenceService()
    
    deployed_version = model_version_manager.get_deployed_version()
    if deployed_version and deployed_version.get("adapter_path"):
        lora_inference.load_adapter(deployed_version["adapter_path"])
    
    print(f"Celery enabled: {task_service.use_celery}")
    print(f"Deployed model version: {deployed_version['version'] if deployed_version else 'base'}")

@app.on_event("shutdown")
async def shutdown_event():
    if training_scheduler:
        training_scheduler.shutdown()

def get_image_url(image_path: str) -> Optional[str]:
    if not image_path:
        return None
    path = Path(image_path)
    if path.exists() and UPLOAD_DIR in path.parents:
        return f"/uploads/{path.name}"
    return None

def format_results(results: List[dict]) -> List[SearchResult]:
    formatted = []
    for r in results:
        metadata = r.get("metadata", {})
        formatted.append(
            SearchResult(
                id=r["id"],
                score=r.get("score", 0.0),
                cross_encoder_score=r.get("cross_encoder_score"),
                hybrid_score=r.get("hybrid_score"),
                text=metadata.get("text"),
                image_path=metadata.get("image_path"),
                image_url=get_image_url(metadata.get("image_path")),
                metadata=metadata,
            )
        )
    return formatted

@app.get("/api/stats")
async def get_stats():
    cache_stats = search_cache.get_all_stats()
    return {
        "total_items": vector_db.count(),
        "embedding_dim": clip_service.get_embedding_dim(),
        "celery_enabled": task_service.use_celery,
        "cache": cache_stats,
    }

@app.get("/api/cache/stats")
async def get_cache_stats():
    return search_cache.get_all_stats()

@app.post("/api/cache/clear")
async def clear_cache():
    search_cache.clear_all()
    if task_service.use_celery:
        task_service.clear_cache_async()
    return {"success": True, "message": "缓存已清空"}

@app.get("/api/task/{task_id}")
async def get_task_status(task_id: str):
    if not task_service.use_celery:
        raise HTTPException(status_code=400, detail="Celery is not enabled")
    return task_service.get_task_status(task_id)

@app.post("/api/upload", response_model=IndexResponse)
async def upload_image(
    file: UploadFile = File(...),
    text: Optional[str] = Form(None),
    async_index: bool = Form(False),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持上传图片文件")
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]:
        raise HTTPException(status_code=400, detail="不支持的图片格式")
    
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    async with aiofiles.open(file_path, "wb") as buffer:
        content = await file.read()
        await buffer.write(content)
    
    try:
        with Image.open(file_path) as img:
            img.verify()
    except Exception:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="无效的图片文件")
    
    try:
        if async_index and task_service.use_celery:
            task = task_service.index_item_async(
                text=text,
                image_path=str(file_path),
                metadata={"filename": file.filename, "content_type": file.content_type},
            )
            return IndexResponse(
                id=task.id if hasattr(task, "id") else "async",
                success=True,
                message=f"图片已上传，正在后台索引，任务ID: {task.id if hasattr(task, 'id') else 'N/A'}",
            )
        else:
            embedding = clip_service.encode_multimodal(text=text, image=str(file_path))
            
            item_id = vector_db.add_item(
                embedding=embedding.tolist(),
                text=text,
                image_path=str(file_path),
                metadata={"filename": file.filename, "content_type": file.content_type},
            )
            
            search_cache.clear_all()
            
            return IndexResponse(
                id=item_id,
                success=True,
                message=f"图片上传并索引成功，文件路径: {file_path}",
            )
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"索引失败: {str(e)}")

@app.post("/api/index/text", response_model=IndexResponse)
async def index_text(request: TextSearchRequest):
    try:
        embedding = clip_service.encode_text(request.text)
        
        item_id = vector_db.add_item(
            embedding=embedding.tolist(),
            text=request.text,
            metadata=request.filter,
        )
        
        search_cache.clear_all()
        
        return IndexResponse(
            id=item_id,
            success=True,
            message="文本索引成功",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"索引失败: {str(e)}")

@app.post("/api/index/image", response_model=IndexResponse)
async def index_image(request: ImageSearchRequest):
    if not Path(request.image_path).exists():
        raise HTTPException(status_code=404, detail="图片文件不存在")
    
    try:
        embedding = clip_service.encode_multimodal(text=request.text, image=request.image_path)
        
        item_id = vector_db.add_item(
            embedding=embedding.tolist(),
            text=request.text,
            image_path=request.image_path,
            metadata=request.filter,
        )
        
        search_cache.clear_all()
        
        return IndexResponse(
            id=item_id,
            success=True,
            message="图片索引成功",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"索引失败: {str(e)}")

@app.post("/api/search/text", response_model=SearchResponse)
async def search_by_text(request: TextSearchRequest):
    start_time = time.time()
    
    try:
        cache_key = {
            "text": request.text,
            "top_k": request.top_k,
            "use_rerank": request.use_rerank,
            "use_hybrid": request.hybrid_search,
            "filter": request.filter,
        }
        
        cached_result = search_cache.get_text_cache().get(cache_key)
        if cached_result is not None:
            query_time_ms = (time.time() - start_time) * 1000
            return SearchResponse(
                results=format_results(cached_result),
                total=len(cached_result),
                query_time_ms=query_time_ms,
            )
        
        query_embedding = clip_service.encode_text(request.text)
        
        initial_k = request.top_k * 3 if request.use_rerank else request.top_k
        results = vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=request.filter,
        )
        
        if request.use_rerank and results:
            if request.hybrid_search:
                results = cross_encoder.rerank_with_hybrid(
                    query_text=request.text,
                    candidates=results,
                    top_k=request.top_k,
                )
            else:
                results = cross_encoder.rerank(
                    query_text=request.text,
                    candidates=results,
                    top_k=request.top_k,
                )
        
        results = results[:request.top_k]
        search_cache.get_text_cache().put(cache_key, results)
        
        query_time_ms = (time.time() - start_time) * 1000
        
        return SearchResponse(
            results=format_results(results),
            total=len(results),
            query_time_ms=query_time_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

@app.post("/api/search/image", response_model=SearchResponse)
async def search_by_image(request: ImageSearchRequest):
    start_time = time.time()
    
    if not Path(request.image_path).exists():
        raise HTTPException(status_code=404, detail="查询图片不存在")
    
    try:
        cache_key = {
            "image_path": request.image_path,
            "text": request.text,
            "top_k": request.top_k,
            "use_rerank": request.use_rerank,
            "use_hybrid": request.hybrid_search,
            "filter": request.filter,
        }
        
        cached_result = search_cache.get_image_cache().get(cache_key)
        if cached_result is not None:
            query_time_ms = (time.time() - start_time) * 1000
            return SearchResponse(
                results=format_results(cached_result),
                total=len(cached_result),
                query_time_ms=query_time_ms,
            )
        
        query_embedding = clip_service.encode_multimodal(
            text=request.text,
            image=request.image_path,
        )
        
        initial_k = request.top_k * 3 if request.use_rerank else request.top_k
        results = vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=request.filter,
        )
        
        if request.use_rerank and results and request.text:
            if request.hybrid_search:
                results = cross_encoder.rerank_with_hybrid(
                    query_text=request.text,
                    candidates=results,
                    top_k=request.top_k,
                )
            else:
                results = cross_encoder.rerank(
                    query_text=request.text,
                    candidates=results,
                    top_k=request.top_k,
                )
        
        results = results[:request.top_k]
        search_cache.get_image_cache().put(cache_key, results)
        
        query_time_ms = (time.time() - start_time) * 1000
        
        return SearchResponse(
            results=format_results(results),
            total=len(results),
            query_time_ms=query_time_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

@app.post("/api/search/multimodal", response_model=SearchResponse)
async def search_multimodal(request: MultimodalSearchRequest):
    start_time = time.time()
    
    if not request.text and not request.image_path:
        raise HTTPException(status_code=400, detail="至少需要提供文本或图片之一")
    
    if request.image_path and not Path(request.image_path).exists():
        raise HTTPException(status_code=404, detail="查询图片不存在")
    
    try:
        cache_key = {
            "text": request.text,
            "image_path": request.image_path,
            "top_k": request.top_k,
            "use_rerank": request.use_rerank,
            "use_hybrid": request.hybrid_search,
            "vector_weight": request.vector_weight,
            "cross_encoder_weight": request.cross_encoder_weight,
            "filter": request.filter,
        }
        
        cached_result = search_cache.get_multimodal_cache().get(cache_key)
        if cached_result is not None:
            query_time_ms = (time.time() - start_time) * 1000
            return SearchResponse(
                results=format_results(cached_result),
                total=len(cached_result),
                query_time_ms=query_time_ms,
            )
        
        query_embedding = clip_service.encode_multimodal(
            text=request.text,
            image=request.image_path,
        )
        
        initial_k = request.top_k * 3 if request.use_rerank else request.top_k
        results = vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
            filter_metadata=request.filter,
        )
        
        if request.use_rerank and results and request.text:
            results = cross_encoder.rerank_with_hybrid(
                query_text=request.text,
                candidates=results,
                top_k=request.top_k,
                vector_weight=request.vector_weight,
                cross_encoder_weight=request.cross_encoder_weight,
            )
        
        results = results[:request.top_k]
        search_cache.get_multimodal_cache().put(cache_key, results)
        
        query_time_ms = (time.time() - start_time) * 1000
        
        return SearchResponse(
            results=format_results(results),
            total=len(results),
            query_time_ms=query_time_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

@app.post("/api/upload-and-search", response_model=SearchResponse)
async def upload_and_search(
    file: UploadFile = File(None),
    text: Optional[str] = Form(None),
    top_k: int = Form(10),
    use_rerank: bool = Form(True),
    hybrid_search: bool = Form(True),
):
    start_time = time.time()
    
    if not file and not text:
        raise HTTPException(status_code=400, detail="至少需要提供文本或上传图片之一")
    
    image_path = None
    if file:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="只支持上传图片文件")
        
        file_ext = Path(file.filename).suffix.lower()
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{file_ext}"
        image_path = UPLOAD_DIR / filename
        
        async with aiofiles.open(image_path, "wb") as buffer:
            content = await file.read()
            await buffer.write(content)
        
        try:
            with Image.open(image_path) as img:
                img.verify()
        except Exception:
            image_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="无效的图片文件")
        
        image_path = str(image_path)
    
    try:
        cache_key = {
            "text": text,
            "image_path": image_path,
            "top_k": top_k,
            "use_rerank": use_rerank,
            "use_hybrid": hybrid_search,
        }
        
        cached_result = search_cache.get_multimodal_cache().get(cache_key)
        if cached_result is not None:
            if image_path and Path(image_path).exists():
                Path(image_path).unlink(missing_ok=True)
            query_time_ms = (time.time() - start_time) * 1000
            return SearchResponse(
                results=format_results(cached_result),
                total=len(cached_result),
                query_time_ms=query_time_ms,
            )
        
        query_embedding = clip_service.encode_multimodal(
            text=text,
            image=image_path,
        )
        
        initial_k = top_k * 3 if use_rerank else top_k
        results = vector_db.search(
            query_embedding=query_embedding.tolist(),
            top_k=initial_k,
        )
        
        if use_rerank and results and text:
            if hybrid_search:
                results = cross_encoder.rerank_with_hybrid(
                    query_text=text,
                    candidates=results,
                    top_k=top_k,
                )
            else:
                results = cross_encoder.rerank(
                    query_text=text,
                    candidates=results,
                    top_k=top_k,
                )
        
        results = results[:top_k]
        search_cache.get_multimodal_cache().put(cache_key, results)
        
        query_time_ms = (time.time() - start_time) * 1000
        
        return SearchResponse(
            results=format_results(results),
            total=len(results),
            query_time_ms=query_time_ms,
        )
    except Exception as e:
        if image_path and Path(image_path).exists():
            Path(image_path).unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

@app.post("/api/reindex-optimize")
async def reindex_optimize(
    hnsw_m: int = 64,
    hnsw_construction_ef: int = 500,
    hnsw_search_ef: int = 128,
):
    try:
        vector_db.recreate_collection_with_optimized_index(
            hnsw_m=hnsw_m,
            hnsw_construction_ef=hnsw_construction_ef,
            hnsw_search_ef=hnsw_search_ef,
        )
        search_cache.clear_all()
        return {"success": True, "message": "索引优化完成"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"优化失败: {str(e)}")

@app.delete("/api/items/{item_id}", response_model=DeleteResponse)
async def delete_item(item_id: str):
    try:
        vector_db.delete(item_id)
        search_cache.clear_all()
        return DeleteResponse(success=True, message=f"项目 {item_id} 已删除")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")

@app.delete("/api/items", response_model=DeleteResponse)
async def delete_all_items():
    try:
        vector_db.delete_all()
        search_cache.clear_all()
        return DeleteResponse(success=True, message="所有项目已删除")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")

@app.get("/api/items")
async def get_all_items(limit: int = 100, offset: int = 0):
    try:
        items = vector_db.get_all(limit=limit, offset=offset)
        return {"items": format_results(items), "total": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")

@app.post("/api/feedback")
async def submit_feedback(
    request: FeedbackRequest,
    x_session_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    try:
        feedback_id = feedback_store.add_feedback(
            query_id=request.query_id,
            result_id=request.result_id,
            feedback_type=request.feedback_type.value,
            query_text=request.query_text,
            session_id=request.session_id or x_session_id,
            user_id=request.user_id or x_user_id,
            additional_data=request.additional_data
        )
        return {"success": True, "feedback_id": feedback_id, "message": "反馈已记录"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"记录反馈失败: {str(e)}")

@app.get("/api/feedback")
async def get_feedback(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    feedback_type: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    try:
        from datetime import datetime
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        
        feedbacks = feedback_store.get_feedback(
            start_date=start_dt,
            end_date=end_dt,
            feedback_type=feedback_type,
            user_id=user_id,
            limit=limit,
            offset=offset
        )
        return {"feedbacks": feedbacks, "total": len(feedbacks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取反馈失败: {str(e)}")

@app.get("/api/feedback/stats", response_model=FeedbackStatsResponse)
async def get_feedback_stats():
    try:
        stats = feedback_store.get_feedback_stats()
        return FeedbackStatsResponse(**stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")

@app.get("/api/models/versions")
async def get_model_versions(status: Optional[str] = None):
    try:
        versions = model_version_manager.get_versions(status=status)
        return {"versions": versions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取版本失败: {str(e)}")

@app.get("/api/models/deployed")
async def get_deployed_version():
    try:
        version = model_version_manager.get_deployed_version()
        return {"version": version}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取部署版本失败: {str(e)}")

@app.post("/api/models/{version}/deploy")
async def deploy_model_version(version: str):
    try:
        model_version_manager.deploy_version(version)
        
        versions = model_version_manager.get_versions()
        for v in versions:
            if v["version"] == version and v.get("adapter_path"):
                lora_inference.load_adapter(v["adapter_path"])
                break
        
        search_cache.clear_all()
        return {"success": True, "message": f"版本 {version} 已部署"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"部署失败: {str(e)}")

@app.post("/api/models/rollback")
async def rollback_model():
    try:
        version = model_version_manager.rollback()
        if version:
            versions = model_version_manager.get_versions()
            for v in versions:
                if v["version"] == version and v.get("adapter_path"):
                    lora_inference.load_adapter(v["adapter_path"])
                    break
            search_cache.clear_all()
            return {"success": True, "version": version, "message": "已回滚到上一个版本"}
        else:
            raise HTTPException(status_code=400, detail="没有可回滚的版本")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回滚失败: {str(e)}")

@app.post("/api/training/start")
async def start_training(config: Optional[TrainingConfig] = None):
    try:
        result = training_scheduler.trigger_manual_training()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动训练失败: {str(e)}")

@app.get("/api/training/status")
async def get_training_status():
    try:
        status = training_scheduler.get_status()
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取训练状态失败: {str(e)}")

@app.post("/api/training/auto/enable")
async def enable_auto_training(interval_days: int = 7):
    try:
        training_scheduler.start_auto_training(interval_days=interval_days)
        return {"success": True, "message": f"自动训练已启用，间隔 {interval_days} 天"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启用自动训练失败: {str(e)}")

@app.post("/api/training/auto/disable")
async def disable_auto_training():
    try:
        training_scheduler.stop_auto_training()
        return {"success": True, "message": "自动训练已禁用"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"禁用自动训练失败: {str(e)}")

@app.get("/api/training/runs")
async def get_training_runs(limit: int = 10):
    try:
        runs = feedback_store.get_training_runs(limit=limit)
        return {"runs": runs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取训练记录失败: {str(e)}")

@app.get("/api/ab/experiments")
async def get_ab_experiments(status: Optional[str] = None):
    try:
        experiments = ab_test_manager.get_experiments(status=status)
        return {"experiments": experiments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实验失败: {str(e)}")

@app.post("/api/ab/experiments")
async def create_ab_experiment(request: Dict[str, Any]):
    try:
        experiment_id = ab_test_manager.create_experiment(
            name=request.get("name"),
            variants=request.get("variants", []),
            description=request.get("description"),
            primary_metric=request.get("primary_metric", "click_through_rate")
        )
        return {"success": True, "experiment_id": experiment_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建实验失败: {str(e)}")

@app.post("/api/ab/experiments/{experiment_id}/start")
async def start_ab_experiment(experiment_id: str):
    try:
        ab_test_manager.start_experiment(experiment_id)
        return {"success": True, "message": "实验已启动"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动实验失败: {str(e)}")

@app.post("/api/ab/experiments/{experiment_id}/pause")
async def pause_ab_experiment(experiment_id: str):
    try:
        ab_test_manager.pause_experiment(experiment_id)
        return {"success": True, "message": "实验已暂停"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"暂停实验失败: {str(e)}")

@app.post("/api/ab/experiments/{experiment_id}/end")
async def end_ab_experiment(experiment_id: str):
    try:
        ab_test_manager.end_experiment(experiment_id)
        return {"success": True, "message": "实验已结束"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"结束实验失败: {str(e)}")

@app.get("/api/ab/experiments/{experiment_id}/stats")
async def get_ab_experiment_stats(experiment_id: str):
    try:
        stats = ab_test_manager.get_experiment_stats(experiment_id)
        return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实验统计失败: {str(e)}")

@app.post("/api/ab/experiments/{experiment_id}/deploy-winner")
async def deploy_ab_winner(experiment_id: str):
    try:
        version = ab_test_manager.deploy_winner(experiment_id)
        if version:
            search_cache.clear_all()
            return {"success": True, "version": version, "message": "获胜版本已部署"}
        else:
            raise HTTPException(status_code=400, detail="无法确定获胜版本")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"部署获胜版本失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
