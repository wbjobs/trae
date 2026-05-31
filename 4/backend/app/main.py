from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers.projects import router as projects_router
from app.routers.geometry import router as geometry_router
from app.routers.mesh import router as mesh_router
from app.routers.results import router as results_router
from app.models.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="FEA Mesh Generator & Post-Processor",
    description="有限元分析网格生成与后处理工具",
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

app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(geometry_router, prefix="/api/geometry", tags=["geometry"])
app.include_router(mesh_router, prefix="/api/mesh", tags=["mesh"])
app.include_router(results_router, prefix="/api/results", tags=["results"])


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
