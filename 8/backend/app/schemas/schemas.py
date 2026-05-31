from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class CodeSnippetBase(BaseModel):
    title: Optional[str] = None
    code: str
    language: str = "python"
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class CodeSnippetCreate(CodeSnippetBase):
    pass


class CodeSnippetUpdate(CodeSnippetBase):
    change_note: Optional[str] = None


class CodeSnippetResponse(CodeSnippetBase):
    id: str
    created_at: datetime
    updated_at: datetime
    auto_tags: Optional[List[str]] = None
    version: Optional[int] = None

    class Config:
        from_attributes = True


class CodeSnippetSearchResponse(BaseModel):
    id: str
    title: Optional[str]
    code: str
    language: str
    tags: List[str]
    description: Optional[str]
    similarity: float
    created_at: str
    auto_tags: Optional[List[str]] = None


class SearchQuery(BaseModel):
    query: str
    top_k: int = 5
    language: Optional[str] = None
    tags: Optional[List[str]] = None


class CodeSnippetVersionResponse(BaseModel):
    id: int
    code_snippet_id: str
    version_number: int
    title: Optional[str]
    code: str
    language: str
    tags: List[str]
    description: Optional[str]
    auto_tags: List[str]
    change_note: Optional[str]
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class AutoTagResult(BaseModel):
    suggested_tags: List[str]
    keywords: List[str]


class FavoriteBase(BaseModel):
    code_snippet_id: str
    user_id: str = "anonymous"


class FavoriteCreate(FavoriteBase):
    pass


class FavoriteResponse(BaseModel):
    id: int
    code_snippet_id: str
    user_id: str
    created_at: datetime
    snippet_data: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class CommentBase(BaseModel):
    code_snippet_id: str
    content: str
    user_id: str = "anonymous"


class CommentCreate(CommentBase):
    pass


class CommentResponse(BaseModel):
    id: int
    code_snippet_id: str
    user_id: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserHistoryBase(BaseModel):
    user_id: str = "anonymous"
    action_type: str
    code_snippet_id: Optional[str] = None
    query_text: Optional[str] = None


class UserHistoryCreate(UserHistoryBase):
    pass


class UserHistoryResponse(BaseModel):
    id: int
    user_id: str
    action_type: str
    code_snippet_id: Optional[str]
    query_text: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RecommendedSnippet(BaseModel):
    snippet: CodeSnippetSearchResponse
    reason: str


class MaintenanceResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None
