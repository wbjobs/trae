from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from fastapi.responses import FileResponse
import os
from ..services.document_service import DocumentService
from ..services.graph_service import GraphService
from ..schemas.document import (
    DocumentParseResponse,
    DocumentInfo,
    DocumentSearchRequest,
    DocumentSearchResponse
)
from ..config import settings

router = APIRouter(prefix="/api/documents", tags=["文档管理"])

document_service = DocumentService()
graph_service = GraphService()


@router.post("/upload", response_model=DocumentParseResponse, summary="上传并解析文档")
async def upload_document(
    file: UploadFile = File(...),
    extract_knowledge: bool = Query(True, description="是否提取知识图谱")
):
    try:
        result = await document_service.upload_and_parse(file, extract_knowledge)

        if result.knowledge_graph and extract_knowledge:
            graph_service.save_graph(result.document.document_id, result.knowledge_graph)

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.get("", response_model=dict, summary="获取文档列表")
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    documents, total = document_service.list_documents(skip, limit)
    return {
        "total": total,
        "documents": documents
    }


@router.get("/{document_id}", response_model=DocumentParseResponse, summary="获取文档详情")
async def get_document(document_id: str):
    doc = document_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc


@router.post("/search", response_model=DocumentSearchResponse, summary="搜索文档")
async def search_documents(request: DocumentSearchRequest):
    return document_service.search_documents(request)


@router.delete("/{document_id}", summary="删除文档")
async def delete_document(document_id: str):
    doc = document_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    graph_service.delete_document_graph(document_id)
    success = document_service.delete_document(document_id)

    return {"success": success, "message": "删除成功" if success else "删除失败"}


@router.get("/{document_id}/download", summary="下载原始文档")
async def download_document(document_id: str):
    doc = document_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    file_path = os.path.join(settings.UPLOAD_DIR, f"{document_id}_{doc.document.filename}")
    if not os.path.exists(file_path):
        alt_path = os.path.join(settings.UPLOAD_DIR, doc.document.filename)
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=doc.document.filename
    )
