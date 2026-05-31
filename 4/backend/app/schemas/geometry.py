from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel


class GeometryBase(BaseModel):
    name: str
    geometry_type: str = "uploaded"
    dimensions: int = 3
    parameters: Optional[Dict[str, Any]] = None


class GeometryCreate(GeometryBase):
    project_id: int


class GeometryResponse(GeometryBase):
    id: int
    project_id: int
    file_path: Optional[str]
    file_format: Optional[str]
    bounding_box: Optional[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True
