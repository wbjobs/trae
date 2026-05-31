import asyncio
import json
import multiprocessing
import time
from collections import deque
from typing import List, Deque
from pydantic import BaseModel

import redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    STREAM_NAME,
    RESULT_CHANNEL,
    SIGMA_CHANNEL,
    DATA_PER_SECOND,
    HISTORY_MAX_LEN,
    DEFAULT_SIGMA,
    MIN_SIGMA,
    MAX_SIGMA
)
from data_generator import StockDataGenerator
from sigma_manager import SigmaManager, get_current_sigma
from anomaly_detector import AnomalyDetector

app = FastAPI(title="Stock Anomaly Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SigmaUpdateRequest(BaseModel):
    sigma: float


class RecalculateRequest(BaseModel):
    sigma: float


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()
sigma_manager = SigmaManager()

price_history: Deque[dict] = deque(maxlen=HISTORY_MAX_LEN)


def data_generator_process():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    generator = StockDataGenerator()
    
    print("[Generator] 数据生成器已启动")
    
    while True:
        start_time = time.time()
        pipeline = r.pipeline()
        
        for _ in range(DATA_PER_SECOND):
            data = generator.generate()
            pipeline.xadd(STREAM_NAME, {"data": data.model_dump_json()})
        
        pipeline.execute()
        
        elapsed = time.time() - start_time
        sleep_time = max(0, 1.0 - elapsed)
        time.sleep(sleep_time)


async def redis_subscriber():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    pubsub = r.pubsub()
    pubsub.subscribe(RESULT_CHANNEL)
    
    print("[Subscriber] Redis订阅已启动")
    
    while True:
        try:
            message = pubsub.get_message(timeout=0.01)
            if message and message["type"] == "message":
                try:
                    data = json.loads(message["data"].decode())
                    price_history.append(data["data"])
                    await manager.broadcast(data)
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    print(f"[Subscriber] 消息解析错误: {e}")
            await asyncio.sleep(0.001)
        except Exception as e:
            print(f"[Subscriber] 错误: {e}")
            await asyncio.sleep(1)


async def sigma_change_listener():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    pubsub = r.pubsub()
    pubsub.subscribe(SIGMA_CHANNEL)
    
    print("[SigmaListener] Sigma变更监听器已启动")
    
    for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"].decode())
                new_sigma = data["sigma"]
                print(f"[SigmaListener] Sigma已更新为: {new_sigma}")
                
                notification = {
                    "type": "sigma_updated",
                    "sigma": new_sigma
                }
                await manager.broadcast(notification)
            except (json.JSONDecodeError, KeyError) as e:
                print(f"[SigmaListener] 解析错误: {e}")


@app.get("/")
async def root():
    return {
        "message": "Stock Anomaly Detection API (Async Redis Architecture)",
        "architecture": {
            "data_flow": "Generator -> Redis Stream -> Worker -> Redis Pub/Sub -> WebSocket",
            "features": ["动态Sigma阈值", "历史数据重算"],
            "endpoints": {
                "ws": "/ws/stock",
                "GET /api/sigma": "获取当前Sigma阈值",
                "POST /api/sigma": "更新Sigma阈值",
                "POST /api/recalculate": "用新Sigma重算历史数据",
                "GET /api/history": "获取历史数据",
                "docs": "/docs"
            }
        }
    }


@app.get("/api/sigma")
async def get_sigma():
    return {
        "sigma": sigma_manager.get_sigma(),
        "min": MIN_SIGMA,
        "max": MAX_SIGMA,
        "default": DEFAULT_SIGMA
    }


@app.post("/api/sigma")
async def update_sigma(request: SigmaUpdateRequest):
    sigma = request.sigma
    if sigma < MIN_SIGMA or sigma > MAX_SIGMA:
        raise HTTPException(
            status_code=400,
            detail=f"Sigma必须在 {MIN_SIGMA} 到 {MAX_SIGMA} 之间"
        )
    
    new_sigma = sigma_manager.set_sigma(sigma)
    
    return {
        "success": True,
        "sigma": new_sigma,
        "message": f"Sigma阈值已更新为 {new_sigma}"
    }


@app.post("/api/recalculate")
async def recalculate_history(request: RecalculateRequest):
    sigma = request.sigma
    if sigma < MIN_SIGMA or sigma > MAX_SIGMA:
        raise HTTPException(
            status_code=400,
            detail=f"Sigma必须在 {MIN_SIGMA} 到 {MAX_SIGMA} 之间"
        )
    
    if len(price_history) < 30:
        return {
            "success": True,
            "sigma": sigma,
            "recalculated": [],
            "message": "历史数据不足，跳过重算"
        }
    
    detector = AnomalyDetector(window_size=100, sigma=sigma)
    prices = [item["price"] for item in price_history]
    results = detector.detect_batch(prices)
    
    recalculated = []
    for i, (data, (is_anomaly, mean, std, z_score)) in enumerate(zip(price_history, results)):
        recalculated.append({
            "data": data,
            "anomaly": is_anomaly,
            "anomaly_info": {
                "mean": round(mean, 2),
                "std": round(std, 2),
                "z_score": round(z_score, 2)
            } if is_anomaly else None
        })
    
    return {
        "success": True,
        "sigma": sigma,
        "recalculated": recalculated,
        "count": len(recalculated),
        "anomalies": sum(1 for r in recalculated if r["anomaly"])
    }


@app.get("/api/history")
async def get_history(limit: int = 200):
    limit = min(limit, HISTORY_MAX_LEN)
    history_list = list(price_history)[-limit:]
    return {
        "count": len(history_list),
        "data": history_list
    }


@app.websocket("/ws/stock")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    current_sigma = sigma_manager.get_sigma()
    await websocket.send_json({
        "type": "init",
        "sigma": current_sigma,
        "history_count": len(price_history)
    })
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.on_event("startup")
async def startup_event():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    try:
        r.ping()
        print("[Main] Redis连接成功")
    except redis.exceptions.ConnectionError:
        print("[Main] 警告: 无法连接到Redis，请确保Redis服务已启动")
    
    current_sigma = get_current_sigma()
    print(f"[Main] 当前Sigma阈值: {current_sigma}")
    
    generator_proc = multiprocessing.Process(target=data_generator_process, daemon=True)
    generator_proc.start()
    
    asyncio.create_task(redis_subscriber())
    asyncio.create_task(sigma_change_listener())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
