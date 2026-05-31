from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class HexagonData(BaseModel):
    hex_id: str
    count: int
    avg_speed: float
    resolution: int


class AggregationResponse(BaseModel):
    hexagons: List[HexagonData]
    resolution: int
    total_points: int
    processing_time_ms: float
    cache_hit: bool


class AggregationRequest(BaseModel):
    resolution: int = Field(default=8, ge=6, le=10)
    bbox: Optional[List[float]] = None
    use_cache: bool = True
    parent_hex: Optional[str] = None


class DrillDownRequest(BaseModel):
    parent_hex_id: str = Field(..., description="Parent H3 hexagon ID to drill down into")
    target_resolution: int = Field(default=9, ge=6, le=10, description="Target H3 resolution (must be higher than parent)")
    bbox: Optional[List[float]] = None
    use_cache: bool = True


class TimeRangeRequest(BaseModel):
    resolution: int = Field(default=8, ge=6, le=10)
    start_hour: int = Field(default=0, ge=0, le=23, description="Start hour (0-23)")
    end_hour: int = Field(default=1, ge=0, le=24, description="End hour (1-24)")
    bbox: Optional[List[float]] = None
    use_cache: bool = True
    parent_hex: Optional[str] = None


class InterpolationRequest(BaseModel):
    resolution: int = Field(default=8, ge=6, le=10)
    hour_start: int = Field(default=0, ge=0, le=23)
    hour_end: int = Field(default=1, ge=0, le=23)
    fraction: float = Field(default=0.5, ge=0.0, le=1.0, description="Interpolation fraction (0.0-1.0)")
    bbox: Optional[List[float]] = None
    use_cache: bool = True


class HourlyAggregationResponse(BaseModel):
    hour: int
    hexagons: List[HexagonData]
    total_points: int


class Batch24hResponse(BaseModel):
    resolution: int
    hourly_data: Dict[int, HourlyAggregationResponse]
    processing_time_ms: float


class StatsResponse(BaseModel):
    total_points: int
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    speed_min: float
    speed_max: float
    speed_avg: float
