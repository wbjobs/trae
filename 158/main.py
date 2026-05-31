import os
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from document_processor import DocumentProcessor
from embedding_manager import EmbeddingManager
from vector_store import VectorStore
from llama_client import LlamaCppClient

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

doc_processor = DocumentProcessor()
embedding_manager = EmbeddingManager()
vector_store = VectorStore()
llama_client = LlamaCppClient()


class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    similarity_threshold: Optional[float] = None
    use_diversity: bool = False
    use_hybrid_search: Optional[bool] = None


class QueryResponse(BaseModel):
    answer: str
    contexts: List[dict]
    relevance_validated: bool = True
    relevance_message: str = ""


class ConfigUpdate(BaseModel):
    top_k: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    similarity_threshold: Optional[float] = None
    use_hybrid_search: Optional[bool] = None
    bm25_weight: Optional[float] = None
    vector_weight: Optional[float] = None
    rrf_k: Optional[int] = None


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed_extensions = {".pdf", ".txt"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_extensions)}"
        )

    try:
        content = await file.read()
        doc_info = doc_processor.process_document(content, file.filename)
        count = vector_store.add_documents(
            chunks=doc_info["chunks"],
            source=doc_info["source"],
            embedding_manager=embedding_manager,
            doc_title=doc_info["doc_title"],
            doc_id=doc_info["doc_id"]
        )

        return {
            "status": "success",
            "filename": file.filename,
            "doc_id": doc_info["doc_id"],
            "chunks_count": count,
            "total_chunks": vector_store.get_document_count()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents")
async def list_documents():
    sources = vector_store.get_all_sources()
    uploaded = doc_processor.list_uploaded_files()
    bm25_stats = vector_store.get_bm25_stats()
    return {
        "uploaded_files": uploaded,
        "indexed_sources": sources,
        "total_chunks": vector_store.get_document_count(),
        "bm25_stats": bm25_stats
    }


@app.delete("/api/documents/{source}")
async def delete_document(source: str):
    deleted = vector_store.delete_documents_by_source(source)
    doc_processor.delete_uploaded_file(source)
    return {
        "status": "success",
        "deleted_chunks": deleted,
        "remaining_chunks": vector_store.get_document_count()
    }


@app.post("/api/query")
async def query_documents(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    use_hybrid = request.use_hybrid_search if request.use_hybrid_search is not None else settings.USE_HYBRID_SEARCH

    if request.use_diversity:
        contexts = vector_store.query_with_diversity(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold
        )
    elif use_hybrid:
        contexts = vector_store.query_hybrid(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold,
            use_hybrid=True
        )
    else:
        contexts = vector_store.query_documents(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold
        )

    if not contexts:
        return {
            "answer": "未找到相关文档，请先上传文档。",
            "contexts": [],
            "relevance_validated": False,
            "relevance_message": "未找到相关文档"
        }

    is_relevant, relevance_message = llama_client.validate_relevance(request.query, contexts)

    if not is_relevant:
        return {
            "answer": f"无法回答此问题。原因：{relevance_message}",
            "contexts": contexts,
            "relevance_validated": False,
            "relevance_message": relevance_message
        }

    answer = await llama_client.generate(
        request.query,
        contexts,
        temperature=request.temperature,
        max_tokens=request.max_tokens
    )

    return {
        "answer": answer,
        "contexts": contexts,
        "relevance_validated": True,
        "relevance_message": relevance_message
    }


@app.post("/api/query/stream")
async def query_documents_stream(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    use_hybrid = request.use_hybrid_search if request.use_hybrid_search is not None else settings.USE_HYBRID_SEARCH

    if request.use_diversity:
        contexts = vector_store.query_with_diversity(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold
        )
    elif use_hybrid:
        contexts = vector_store.query_hybrid(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold,
            use_hybrid=True
        )
    else:
        contexts = vector_store.query_documents(
            request.query,
            embedding_manager,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold
        )

    if not contexts:
        return {
            "answer": "未找到相关文档，请先上传文档。",
            "contexts": [],
            "relevance_validated": False,
            "relevance_message": "未找到相关文档"
        }

    is_relevant, relevance_message = llama_client.validate_relevance(request.query, contexts)

    async def event_generator():
        yield f"data: {json.dumps({'type': 'contexts', 'data': contexts})}\n\n"
        yield f"data: {json.dumps({'type': 'relevance', 'data': {'validated': is_relevant, 'message': relevance_message}})}\n\n"

        if not is_relevant:
            yield f"data: {json.dumps({'type': 'token', 'data': f'无法回答此问题。原因：{relevance_message}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'data': None})}\n\n"
            return

        async for chunk in llama_client.generate_stream(
            request.query,
            contexts,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        ):
            yield f"data: {json.dumps({'type': 'token', 'data': chunk})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'data': None})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.get("/api/config")
async def get_config():
    return {
        "top_k": settings.TOP_K,
        "temperature": settings.TEMPERATURE,
        "max_tokens": settings.MAX_TOKENS,
        "chunk_size": settings.CHUNK_SIZE,
        "chunk_overlap": settings.CHUNK_OVERLAP,
        "similarity_threshold": settings.SIMILARITY_THRESHOLD,
        "use_hybrid_search": settings.USE_HYBRID_SEARCH,
        "bm25_weight": settings.BM25_WEIGHT,
        "vector_weight": settings.VECTOR_WEIGHT,
        "rrf_k": settings.RRF_K,
        "embedding_model": settings.EMBEDDING_MODEL_NAME,
        "llama_cpp_url": settings.LLAMA_CPP_BASE_URL
    }


@app.put("/api/config")
async def update_config(config: ConfigUpdate):
    updated = {}
    if config.top_k is not None:
        settings.TOP_K = config.top_k
        updated["top_k"] = config.top_k
    if config.temperature is not None:
        settings.TEMPERATURE = config.temperature
        updated["temperature"] = config.temperature
    if config.max_tokens is not None:
        settings.MAX_TOKENS = config.max_tokens
        updated["max_tokens"] = config.max_tokens
    if config.chunk_size is not None:
        settings.CHUNK_SIZE = config.chunk_size
        updated["chunk_size"] = config.chunk_size
    if config.chunk_overlap is not None:
        settings.CHUNK_OVERLAP = config.chunk_overlap
        updated["chunk_overlap"] = config.chunk_overlap
    if config.similarity_threshold is not None:
        settings.SIMILARITY_THRESHOLD = config.similarity_threshold
        updated["similarity_threshold"] = config.similarity_threshold
    if config.use_hybrid_search is not None:
        settings.USE_HYBRID_SEARCH = config.use_hybrid_search
        updated["use_hybrid_search"] = config.use_hybrid_search
    if config.bm25_weight is not None:
        settings.BM25_WEIGHT = config.bm25_weight
        updated["bm25_weight"] = config.bm25_weight
    if config.vector_weight is not None:
        settings.VECTOR_WEIGHT = config.vector_weight
        updated["vector_weight"] = config.vector_weight
    if config.rrf_k is not None:
        settings.RRF_K = config.rrf_k
        updated["rrf_k"] = config.rrf_k

    return {"status": "success", "updated": updated}


@app.get("/api/health")
async def health_check():
    llama_health = await llama_client.check_health()
    bm25_stats = vector_store.get_bm25_stats()
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "vector_store_count": vector_store.get_document_count(),
        "llama_cpp": llama_health,
        "bm25": bm25_stats
    }


@app.delete("/api/documents")
async def clear_all_documents():
    vector_store.clear_all()
    return {"status": "success", "message": "All documents cleared"}
