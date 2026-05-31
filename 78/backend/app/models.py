from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class TextIndexRequest(BaseModel):
    text: str = Field(..., description="要索引的文本内容")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="附加元数据")

class ImageIndexRequest(BaseModel):
    image_path: str = Field(..., description="图片文件路径")
    text: Optional[str] = Field(default=None, description="图片描述文本")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="附加元数据")

class MultimodalIndexRequest(BaseModel):
    text: Optional[str] = Field(default=None, description="文本内容")
    image_path: Optional[str] = Field(default=None, description="图片文件路径")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="附加元数据")

class TextSearchRequest(BaseModel):
    text: str = Field(..., description="查询文本")
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量")
    use_rerank: bool = Field(default=True, description="是否使用Cross-Encoder重排序")
    hybrid_search: bool = Field(default=True, description="是否使用混合排序")
    filter: Optional[Dict[str, Any]] = Field(default=None, description="元数据过滤条件")

class ImageSearchRequest(BaseModel):
    image_path: str = Field(..., description="查询图片路径")
    text: Optional[str] = Field(default=None, description="补充文本描述")
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量")
    use_rerank: bool = Field(default=True, description="是否使用Cross-Encoder重排序")
    hybrid_search: bool = Field(default=True, description="是否使用混合排序")
    filter: Optional[Dict[str, Any]] = Field(default=None, description="元数据过滤条件")

class MultimodalSearchRequest(BaseModel):
    text: Optional[str] = Field(default=None, description="查询文本")
    image_path: Optional[str] = Field(default=None, description="查询图片路径")
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量")
    use_rerank: bool = Field(default=True, description="是否使用Cross-Encoder重排序")
    hybrid_search: bool = Field(default=True, description="是否使用混合排序")
    vector_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="向量搜索权重")
    cross_encoder_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="Cross-Encoder权重")
    filter: Optional[Dict[str, Any]] = Field(default=None, description="元数据过滤条件")

class SearchResult(BaseModel):
    id: str
    score: float
    cross_encoder_score: Optional[float] = None
    hybrid_score: Optional[float] = None
    text: Optional[str] = None
    image_path: Optional[str] = None
    image_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
    query_time_ms: float

class IndexResponse(BaseModel):
    id: str
    success: bool
    message: str

class DeleteResponse(BaseModel):
    success: bool
    message: str

class StatsResponse(BaseModel):
    total_items: int
    embedding_dim: int
