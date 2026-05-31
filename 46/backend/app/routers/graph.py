from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from ..services.graph_service import GraphService
from ..services.document_service import DocumentService
from ..schemas.document import (
    KnowledgeGraph,
    GraphSearchRequest,
    GraphSearchResponse
)

router = APIRouter(prefix="/api/graph", tags=["知识图谱"])

graph_service = GraphService()
document_service = DocumentService()


@router.get("/document/{document_id}", response_model=KnowledgeGraph, summary="获取文档知识图谱")
async def get_document_graph(document_id: str):
    doc = document_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    graph = graph_service.get_document_graph(document_id)

    if not graph.entities and doc.knowledge_graph:
        return doc.knowledge_graph

    return graph


@router.post("/search", response_model=GraphSearchResponse, summary="搜索知识图谱")
async def search_graph(request: GraphSearchRequest):
    return graph_service.search_graph(request)


@router.get("/types/entities", response_model=List[str], summary="获取所有实体类型")
async def get_entity_types():
    return graph_service.get_all_entity_types()


@router.get("/types/relations", response_model=List[str], summary="获取所有关系类型")
async def get_relation_types():
    return graph_service.get_all_relation_types()


@router.delete("/document/{document_id}", summary="删除文档知识图谱")
async def delete_document_graph(document_id: str):
    doc = document_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    success = graph_service.delete_document_graph(document_id)
    return {"success": success, "message": "删除成功" if success else "删除失败"}
