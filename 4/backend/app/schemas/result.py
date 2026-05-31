from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel


class ResultBase(BaseModel):
    name: str
    result_type: Optional[str] = None


class ResultCreate(ResultBase):
    project_id: int
    mesh_id: Optional[int] = None


class ResultResponse(ResultBase):
    id: int
    project_id: int
    mesh_id: Optional[int]
    file_path: Optional[str]
    file_format: Optional[str]
    fields: Optional[List[str]]
    num_timesteps: int
    metadata: Optional[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True


class FieldDataResponse(BaseModel):
    name: str
    type: str
    min: float
    max: float
    num_components: int
    data: List[float]


class SlicedDataResponse(BaseModel):
    plane: Dict[str, Any]
    nodes: List[List[float]]
    elements: List[List[int]]
    field_values: Optional[List[float]]
