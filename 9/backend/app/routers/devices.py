from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from app.schemas import DeviceCreate, DeviceData, FaultSimulation
from app.services.data_service import data_service
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
import os
import uuid
import aiofiles

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/devices")
async def create_device(device: DeviceCreate):
    result = await data_service.create_device(device)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/devices")
async def get_devices():
    return await data_service.get_devices()

@router.get("/devices/{device_id}")
async def get_device(device_id: str):
    device = await data_service.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.post("/devices/{device_id}/model")
async def upload_device_model(device_id: str, file: UploadFile = File(...)):
    if not file.filename.endswith((".glb", ".gltf")):
        raise HTTPException(status_code=400, detail="Only GLB/GLTF files are allowed")
    
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{device_id}_{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    await data_service.update_device(device_id, {"model_path": unique_filename})
    
    return {"message": "Model uploaded successfully", "path": unique_filename}

@router.get("/models/{filename}")
async def get_model(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Model not found")

@router.post("/devices/{device_id}/data")
async def post_device_data(data: DeviceData):
    await data_service.save_device_data(data)
    return {"message": "Data saved"}

@router.get("/devices/{device_id}/data/latest")
async def get_latest_data(device_id: str, component_id: str = None):
    return await data_service.get_latest_data(device_id, component_id)

@router.get("/devices/{device_id}/data/historical")
async def get_historical_data(
    device_id: str,
    component_id: str = None,
    start_time: str = None,
    end_time: str = None,
    limit: int = 1000
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None
    return await data_service.get_historical_data(device_id, component_id, start_dt, end_dt, limit)

@router.get("/devices/{device_id}/playback")
async def get_playback_data(
    device_id: str,
    start_time: str = Query(..., description="Start time in ISO format"),
    end_time: str = Query(..., description="End time in ISO format")
):
    try:
        start_dt = datetime.fromisoformat(start_time)
        end_dt = datetime.fromisoformat(end_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use ISO format.")
    
    return await data_service.get_playback_data(device_id, start_dt, end_dt)

@router.get("/devices/{device_id}/health")
async def get_device_health(
    device_id: str,
    time_window_hours: int = Query(24, description="Time window for health calculation in hours")
):
    return await data_service.calculate_health_score(device_id, time_window_hours)

@router.post("/devices/{device_id}/simulation/start")
async def start_simulation(device_id: str):
    return await data_service.start_data_simulation(device_id)

@router.post("/devices/{device_id}/simulation/stop")
async def stop_simulation(device_id: str):
    return await data_service.stop_data_simulation(device_id)

@router.post("/fault/simulate")
async def simulate_fault(fault: FaultSimulation):
    return await data_service.simulate_fault(
        fault.device_id,
        fault.component_id,
        fault.parameter,
        fault.target_value,
        fault.duration
    )
