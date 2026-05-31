from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from .config import settings
from .database import MongoDB
from .routers import documents_router, graph_router
from .api.qa import router as qa_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    MongoDB.get_db()
    yield
    MongoDB.close()


app = FastAPI(
    title="多模态文档解析工具",
    description="支持 PDF、Word、Excel、图片文档解析，提取文本、表格、图片信息，基于 LLM 实现知识提取并构建知识图谱",
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

app.include_router(documents_router)
app.include_router(graph_router)
app.include_router(qa_router)

app.mount("/images", StaticFiles(directory=settings.EXTRACTED_IMAGES_DIR), name="extracted_images")


@app.get("/api/health", summary="健康检查")
async def health_check():
    return {"status": "ok", "message": "多模态文档解析服务运行中"}


@app.get("/api/config", summary="获取配置信息")
async def get_config():
    return {
        "allowed_extensions": list(settings.ALLOWED_EXTENSIONS),
        "max_file_size_mb": settings.MAX_FILE_SIZE // 1024 // 1024,
        "llm_enabled": bool(settings.OPENAI_API_KEY)
    }
