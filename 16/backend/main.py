import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import Base, engine
from app.models import Warehouse, Vehicle, Order, OrderAnomaly, DailyStats
from app.routers import warehouses_router, anomalies_router


Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up Logistics Analytics Platform...")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Logistics Analytics Platform",
    description="Full-stack analytics platform for logistics anomaly detection with spatio-temporal visualization",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(warehouses_router)
app.include_router(anomalies_router)


@app.get("/")
def root():
    return {
        "name": "Logistics Analytics Platform API",
        "version": "1.0.0",
        "endpoints": {
            "warehouses": "/api/warehouses",
            "anomalies": "/api/anomalies",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
