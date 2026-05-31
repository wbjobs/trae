from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import db
from app.routers import devices, alerts, work_orders
from app.services.websocket_service import manager
from app.services.dispatch_service import dispatch_service
import logging
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="工业设备数字孪生监控与运维平台",
    description="基于 React + Three.js + FastAPI + WebSocket 的工业设备监控平台",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.connect()
    logger.info("Database connected")
    await dispatch_service._ensure_default_operators()
    logger.info("Operators initialized")


@app.on_event("shutdown")
async def shutdown():
    await db.close()
    logger.info("Database disconnected")


@app.get("/")
async def root():
    return {
        "message": "工业设备数字孪生监控与运维平台 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    await manager.connect(websocket, client_id)
    try:
        await websocket.send_text(json.dumps({
            "type": "connection",
            "status": "connected",
            "client_id": client_id
        }))
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "subscribe":
                    device_id = message.get("device_id")
                    if device_id:
                        await manager.subscribe_device(websocket, device_id)
                        await websocket.send_text(json.dumps({
                            "type": "subscription",
                            "device_id": device_id,
                            "status": "subscribed"
                        }))
                elif message.get("type") == "unsubscribe":
                    device_id = message.get("device_id")
                    if device_id:
                        await manager.unsubscribe_device(websocket, device_id)
                        await websocket.send_text(json.dumps({
                            "type": "subscription",
                            "device_id": device_id,
                            "status": "unsubscribed"
                        }))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, client_id)


app.include_router(devices.router, prefix="/api", tags=["devices"])
app.include_router(alerts.router, prefix="/api", tags=["alerts"])
app.include_router(work_orders.router, prefix="/api", tags=["work-orders"])
