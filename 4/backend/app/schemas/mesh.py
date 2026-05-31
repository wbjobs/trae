from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class MeshRefinementZone(BaseModel):
    zone_type: str = Field(default="box", pattern="^(box|sphere|cylinder)$")
    mesh_size: float = Field(gt=0)
    center: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    size: Optional[List[float]] = None
    radius: Optional[float] = None
    height: Optional[float] = None


class MeshConfigBase(BaseModel):
    element_type: str = Field(default="tetra", pattern="^(triangle|quad|tetra|hex)$")
    mesh_size: float = Field(default=1.0, gt=0)
    min_mesh_size: float = Field(default=0.1, gt=0)
    max_mesh_size: float = Field(default=5.0, gt=0)
    algorithm_2d: int = Field(default=8, ge=1, le=10)
    algorithm_3d: int = Field(default=4, ge=1, le=10)
    smoothing_iterations: int = Field(default=5, ge=0)
    element_order: int = Field(default=1, ge=1, le=2)
    structured: int = Field(default=0, ge=0, le=1)
    refinement_zones: Optional[List[MeshRefinementZone]] = None
    additional_options: Optional[Dict[str, Any]] = None


class MeshConfigCreate(MeshConfigBase):
    project_id: int
    geometry_id: Optional[int] = None


class MeshQuality(BaseModel):
    element_count: Optional[Dict[str, int]] = None
    min_quality: float
    max_quality: float
    avg_quality: float
    min_aspect_ratio: float
    max_aspect_ratio: float
    avg_aspect_ratio: float
    min_angle: float
    max_angle: float
    avg_angle: float
    quality_histogram: List[int]
