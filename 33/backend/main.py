from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import io
import base64
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading

from style_transfer import StyleTransferEngine
from rife_interpolator import RIFEInterpolator

app = FastAPI(title="H.265 Video Filter Processor API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

style_engine: Optional[StyleTransferEngine] = None
rife_engine: Optional[RIFEInterpolator] = None
processing_tasks: Dict[str, Dict[str, Any]] = {}
executor = ThreadPoolExecutor(max_workers=4)
lock = threading.Lock()


class StylizeRequest(BaseModel):
    frames: List[Dict[str, Any]]
    style: str


class InterpolateRequest(BaseModel):
    frames: List[Dict[str, Any]]
    source_fps: float = 24.0
    target_fps: float = 60.0


class InterpolatePairRequest(BaseModel):
    frame1: str
    frame2: str
    num_intermediate: int = 2


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: float
    total_frames: int
    processed_frames: int
    results: Optional[List[Dict[str, Any]]]


@app.on_event("startup")
async def startup_event():
    global style_engine, rife_engine
    try:
        style_engine = StyleTransferEngine()
        print("Style transfer engine initialized successfully")
    except Exception as e:
        print(f"Failed to initialize style engine: {e}")
        style_engine = None
    
    try:
        rife_engine = RIFEInterpolator()
        print("RIFE interpolator initialized successfully")
    except Exception as e:
        print(f"Failed to initialize RIFE engine: {e}")
        rife_engine = None


@app.get("/")
async def root():
    return {
        "service": "H.265 Video Filter Processor API",
        "version": "1.0.0",
        "available_styles": style_engine.get_available_styles() if style_engine else []
    }


@app.get("/styles")
async def get_available_styles():
    if not style_engine:
        raise HTTPException(status_code=503, detail="Style engine not initialized")
    return {"styles": style_engine.get_available_styles()}


@app.post("/stylize/single")
async def stylize_single_frame(
    file: UploadFile = File(...),
    style: str = "van_gogh"
):
    if not style_engine:
        raise HTTPException(status_code=503, detail="Style engine not initialized")
    
    try:
        image_bytes = await file.read()
        stylized_bytes = style_engine.stylize_frame(image_bytes, style)
        
        return StreamingResponse(
            io.BytesIO(stylized_bytes),
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f"attachment; filename=stylized_{style}.jpg"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Style transfer failed: {str(e)}")


@app.post("/stylize/batch", response_model=Dict[str, Any])
async def stylize_batch(request: StylizeRequest):
    if not style_engine:
        raise HTTPException(status_code=503, detail="Style engine not initialized")
    
    task_id = str(uuid.uuid4())
    
    with lock:
        processing_tasks[task_id] = {
            "status": "pending",
            "progress": 0.0,
            "total_frames": len(request.frames),
            "processed_frames": 0,
            "results": None,
            "style": request.style
        }
    
    def process_batch():
        try:
            with lock:
                processing_tasks[task_id]["status"] = "processing"
            
            frames_data = []
            for frame in request.frames:
                if "image_base64" in frame:
                    image_bytes = base64.b64decode(frame["image_base64"])
                    frames_data.append({
                        "frame_index": frame.get("frame_index", 0),
                        "image": image_bytes
                    })
            
            results = []
            batch_size = 4
            total = len(frames_data)
            
            for i in range(0, total, batch_size):
                batch = frames_data[i:i + batch_size]
                batch_results = style_engine.stylize_frames_batch(batch, request.style)
                
                for result in batch_results:
                    if "stylized_image" in result:
                        results.append({
                            "frame_index": result["frame_index"],
                            "image_base64": base64.b64encode(result["stylized_image"]).decode('utf-8')
                        })
                    else:
                        results.append(result)
                
                with lock:
                    processed = min(i + batch_size, total)
                    processing_tasks[task_id]["processed_frames"] = processed
                    processing_tasks[task_id]["progress"] = processed / total if total > 0 else 1.0
            
            with lock:
                processing_tasks[task_id]["status"] = "completed"
                processing_tasks[task_id]["results"] = results
                processing_tasks[task_id]["progress"] = 1.0
                
        except Exception as e:
            with lock:
                processing_tasks[task_id]["status"] = "failed"
                processing_tasks[task_id]["error"] = str(e)
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, process_batch)
    
    return {"task_id": task_id, "status": "processing"}


@app.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    with lock:
        task = processing_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    response = {
        "task_id": task_id,
        "status": task["status"],
        "progress": task["progress"],
        "total_frames": task["total_frames"],
        "processed_frames": task["processed_frames"],
        "results": None
    }
    
    if task["status"] == "completed":
        response["results"] = task["results"]
    
    return response


@app.delete("/tasks/{task_id}")
async def cancel_task(task_id: str):
    with lock:
        if task_id in processing_tasks:
            processing_tasks[task_id]["status"] = "cancelled"
            return {"message": "Task cancelled"}
        raise HTTPException(status_code=404, detail="Task not found")


@app.post("/stylize/async")
async def stylize_async(
    background_tasks: BackgroundTasks,
    request: StylizeRequest
):
    if not style_engine:
        raise HTTPException(status_code=503, detail="Style engine not initialized")
    
    task_id = str(uuid.uuid4())
    
    with lock:
        processing_tasks[task_id] = {
            "status": "pending",
            "progress": 0.0,
            "total_frames": len(request.frames),
            "processed_frames": 0,
            "results": None
        }
    
    def process_background():
        try:
            with lock:
                processing_tasks[task_id]["status"] = "processing"
            
            frames_data = []
            for frame in request.frames:
                if "image_base64" in frame:
                    image_bytes = base64.b64decode(frame["image_base64"])
                    frames_data.append({
                        "frame_index": frame.get("frame_index", 0),
                        "image": image_bytes
                    })
            
            results = []
            for i, frame_data in enumerate(frames_data):
                try:
                    stylized_bytes = style_engine.stylize_frame(frame_data["image"], request.style)
                    results.append({
                        "frame_index": frame_data["frame_index"],
                        "image_base64": base64.b64encode(stylized_bytes).decode('utf-8')
                    })
                except Exception as e:
                    results.append({
                        "frame_index": frame_data["frame_index"],
                        "error": str(e)
                    })
                
                with lock:
                    processing_tasks[task_id]["processed_frames"] = i + 1
                    processing_tasks[task_id]["progress"] = (i + 1) / len(frames_data)
            
            with lock:
                processing_tasks[task_id]["status"] = "completed"
                processing_tasks[task_id]["results"] = results
                
        except Exception as e:
            with lock:
                processing_tasks[task_id]["status"] = "failed"
                processing_tasks[task_id]["error"] = str(e)
    
    background_tasks.add_task(process_background)
    
    return {"task_id": task_id, "message": "Processing started in background"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "style_engine_loaded": style_engine is not None,
        "rife_engine_loaded": rife_engine is not None,
        "active_tasks": len(processing_tasks)
    }


@app.get("/interpolate/info")
async def get_interpolation_info(source_fps: float = 24.0, target_fps: float = 60.0):
    if not rife_engine:
        raise HTTPException(status_code=503, detail="RIFE engine not initialized")
    
    return rife_engine.get_interpolation_info(source_fps, target_fps)


@app.post("/interpolate/pair")
async def interpolate_pair(request: InterpolatePairRequest):
    if not rife_engine:
        raise HTTPException(status_code=503, detail="RIFE engine not initialized")
    
    try:
        frame1_bytes = base64.b64decode(request.frame1)
        frame2_bytes = base64.b64decode(request.frame2)
        
        interpolated_frames = rife_engine.interpolate_frames(
            frame1_bytes,
            frame2_bytes,
            num_intermediate=request.num_intermediate
        )
        
        return {
            "interpolated_frames": [
                base64.b64encode(frame).decode('utf-8')
                for frame in interpolated_frames
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interpolation failed: {str(e)}")


@app.post("/interpolate/sequence")
async def interpolate_sequence(request: InterpolateRequest):
    if not rife_engine:
        raise HTTPException(status_code=503, detail="RIFE engine not initialized")
    
    task_id = str(uuid.uuid4())
    
    with lock:
        processing_tasks[task_id] = {
            "status": "pending",
            "progress": 0.0,
            "total_frames": len(request.frames),
            "processed_frames": 0,
            "results": None,
            "type": "interpolation"
        }
    
    def process_interpolation():
        try:
            with lock:
                processing_tasks[task_id]["status"] = "processing"
            
            frames_data = []
            for frame in request.frames:
                if "image_base64" in frame:
                    image_bytes = base64.b64decode(frame["image_base64"])
                    frames_data.append({
                        "frame_index": frame.get("frame_index", 0),
                        "image": image_bytes,
                        "timestamp": frame.get("timestamp", 0)
                    })
            
            def on_progress(current, total):
                with lock:
                    processing_tasks[task_id]["processed_frames"] = current
                    processing_tasks[task_id]["progress"] = current / total if total > 0 else 1.0
            
            interpolated = rife_engine.interpolate_sequence(
                frames_data,
                source_fps=request.source_fps,
                target_fps=request.target_fps,
                on_progress=on_progress
            )
            
            results = []
            for frame in interpolated:
                result = {
                    "index": frame.get("index", 0),
                    "timestamp": frame.get("timestamp", 0),
                    "is_interpolated": frame.get("is_interpolated", False),
                    "original_index": frame.get("original_index", 0)
                }
                
                if "image" in frame:
                    result["image_base64"] = base64.b64encode(frame["image"]).decode('utf-8')
                
                if frame.get("is_interpolated"):
                    result["interpolation_between"] = frame.get("interpolation_between", [])
                    result["interpolation_alpha"] = frame.get("interpolation_alpha", 0.5)
                
                results.append(result)
            
            with lock:
                processing_tasks[task_id]["status"] = "completed"
                processing_tasks[task_id]["results"] = results
                processing_tasks[task_id]["progress"] = 1.0
                
        except Exception as e:
            with lock:
                processing_tasks[task_id]["status"] = "failed"
                processing_tasks[task_id]["error"] = str(e)
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, process_interpolation)
    
    return {
        "task_id": task_id,
        "status": "processing",
        "source_fps": request.source_fps,
        "target_fps": request.target_fps
    }


@app.post("/interpolate/async")
async def interpolate_async(
    background_tasks: BackgroundTasks,
    request: InterpolateRequest
):
    if not rife_engine:
        raise HTTPException(status_code=503, detail="RIFE engine not initialized")
    
    task_id = str(uuid.uuid4())
    
    with lock:
        processing_tasks[task_id] = {
            "status": "pending",
            "progress": 0.0,
            "total_frames": len(request.frames),
            "processed_frames": 0,
            "results": None,
            "type": "interpolation"
        }
    
    def process_background():
        try:
            with lock:
                processing_tasks[task_id]["status"] = "processing"
            
            frames_data = []
            for frame in request.frames:
                if "image_base64" in frame:
                    image_bytes = base64.b64decode(frame["image_base64"])
                    frames_data.append({
                        "frame_index": frame.get("frame_index", 0),
                        "image": image_bytes,
                        "timestamp": frame.get("timestamp", 0)
                    })
            
            def on_progress(current, total):
                with lock:
                    processing_tasks[task_id]["processed_frames"] = current
                    processing_tasks[task_id]["progress"] = current / total if total > 0 else 1.0
            
            interpolated = rife_engine.interpolate_sequence(
                frames_data,
                source_fps=request.source_fps,
                target_fps=request.target_fps,
                on_progress=on_progress
            )
            
            results = []
            for frame in interpolated:
                result = {
                    "index": frame.get("index", 0),
                    "timestamp": frame.get("timestamp", 0),
                    "is_interpolated": frame.get("is_interpolated", False),
                    "original_index": frame.get("original_index", 0)
                }
                
                if "image" in frame:
                    result["image_base64"] = base64.b64encode(frame["image"]).decode('utf-8')
                
                if frame.get("is_interpolated"):
                    result["interpolation_between"] = frame.get("interpolation_between", [])
                    result["interpolation_alpha"] = frame.get("interpolation_alpha", 0.5)
                
                results.append(result)
            
            with lock:
                processing_tasks[task_id]["status"] = "completed"
                processing_tasks[task_id]["results"] = results
                
        except Exception as e:
            with lock:
                processing_tasks[task_id]["status"] = "failed"
                processing_tasks[task_id]["error"] = str(e)
    
    background_tasks.add_task(process_background)
    
    return {
        "task_id": task_id,
        "message": "Interpolation started in background",
        "source_fps": request.source_fps,
        "target_fps": request.target_fps
    }


@app.post("/interpolate/upload")
async def interpolate_upload(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    num_intermediate: int = 2
):
    if not rife_engine:
        raise HTTPException(status_code=503, detail="RIFE engine not initialized")
    
    try:
        frame1_bytes = await file1.read()
        frame2_bytes = await file2.read()
        
        interpolated_frames = rife_engine.interpolate_frames(
            frame1_bytes,
            frame2_bytes,
            num_intermediate=num_intermediate
        )
        
        return {
            "interpolated_frames": [
                base64.b64encode(frame).decode('utf-8')
                for frame in interpolated_frames
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interpolation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
