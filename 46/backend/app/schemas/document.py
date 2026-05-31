from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class TableData(BaseModel):
    page_number: Optional[int] = None
    sheet_name: Optional[str] = None
    headers: List[str] = Field(default_factory=list)
    rows: List[List[str]] = Field(default_factory=list)
    csv_content: Optional[str] = None


class ImageData(BaseModel):
    image_id: str
    file_path: str
    page_number: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    extracted_text: Optional[str] = None
    caption: Optional[str] = None


class Entity(BaseModel):
    entity_id: str
    name: str
    type: str
    description: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)


class Relation(BaseModel):
    relation_id: str
    source_id: str
    target_id: str
    type: str
    description: Optional[str] = None


class KnowledgeGraph(BaseModel):
    entities: List[Entity] = Field(default_factory=list)
    relations: List[Relation] = Field(default_factory=list)


class DocumentInfo(BaseModel):
    document_id: str
    filename: str
    file_type: str
    file_size: int
    upload_time: datetime
    title: Optional[str] = None
    author: Optional[str] = None
    creation_date: Optional[datetime] = None
    page_count: Optional[int] = None


class DocumentParseResponse(BaseModel):
    document: DocumentInfo
    text_content: str
    tables: List[TableData] = Field(default_factory=list)
    images: List[ImageData] = Field(default_factory=list)
    knowledge_graph: Optional[KnowledgeGraph] = None
    structured_data: Dict[str, Any] = Field(default_factory=dict)


class DocumentSearchRequest(BaseModel):
    query: str
    file_type: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    skip: int = 0
    limit: int = 20


class DocumentSearchResponse(BaseModel):
    total: int
    documents: List[DocumentInfo]
    highlights: Dict[str, str] = Field(default_factory=dict)


class GraphSearchRequest(BaseModel):
    query: str
    entity_types: Optional[List[str]] = None
    relation_types: Optional[List[str]] = None
    max_depth: int = 2
    limit: int = 100


class GraphSearchResponse(BaseModel):
    entities: List[Entity] = Field(default_factory=list)
    relations: List[Relation] = Field(default_factory=list)
    paths: List[List[str]] = Field(default_factory=list)


class SourceReference(BaseModel):
    text: str
    page_number: Optional[int] = None
    start_index: int = 0
    end_index: int = 0


class QARequest(BaseModel):
    document_id: str
    question: str
    use_history: bool = False


class QAResponse(BaseModel):
    answer: str
    confidence: float = Field(ge=0.0, le=1.0)
    sources: List[SourceReference] = Field(default_factory=list)
    can_answer: bool = True
    response_time: Optional[float] = None
