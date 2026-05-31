from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import init_db
from routers import datasources, anomaly_detection, alerts, share

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Time Series Anomaly Detection Platform",
    description="A platform for time series data anomaly detection and alert analysis",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasources.router, prefix="/api")
app.include_router(anomaly_detection.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(share.router, prefix="/api")

@app.get("/")
async def root():
    return {
        "message": "Time Series Anomaly Detection Platform API",
        "version": "1.0.0",
        "endpoints": {
            "datasources": "/api/datasources",
            "anomaly_detection": "/api/anomaly-detection",
            "alerts": "/api/alerts"
        }
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )
