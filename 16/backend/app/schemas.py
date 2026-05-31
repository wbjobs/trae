from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class WarehouseResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    capacity: int
    region: Optional[str] = None

    class Config:
        from_attributes = True


class VehicleResponse(BaseModel):
    id: int
    plate_number: str
    vehicle_type: str
    max_load: float
    status: str

    class Config:
        from_attributes = True


class OrderResponse(BaseModel):
    id: int
    order_number: str
    origin_warehouse_id: int
    destination_warehouse_id: int
    vehicle_id: Optional[int]
    weight: float
    scheduled_pickup_time: datetime
    actual_pickup_time: Optional[datetime]
    scheduled_delivery_time: datetime
    actual_delivery_time: Optional[datetime]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnomalyResponse(BaseModel):
    id: int
    order_id: int
    anomaly_type: str
    anomaly_score: float
    anomaly_level: str
    detected_at: datetime
    details: Optional[str] = None
    is_reviewed: bool

    class Config:
        from_attributes = True


class SpatioTemporalFlow(BaseModel):
    order_id: int
    origin_id: int
    destination_id: int
    origin_coords: List[float]
    destination_coords: List[float]
    weight: float
    scheduled_pickup_time: str
    scheduled_delivery_time: str
    anomaly_score: float
    anomaly_level: str
    anomaly_type: Optional[str] = None


class ParallelCoordData(BaseModel):
    order_id: int
    weight: float
    transit_hours: float
    expected_transit_hours: float
    anomaly_score: float
    distance_km: float
    origin_region: str
    destination_region: str
    anomaly_level: str


class TopKSubgraphResponse(BaseModel):
    rank: int
    nodes: List[int]
    edges: List[Dict[str, int]]
    anomaly_score: float
    size: int
    density: float
    dominant_anomaly: str
    distribution: Dict[str, int]


class LassoSelectionRequest(BaseModel):
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    warehouse_ids: Optional[List[int]] = None
    min_anomaly_score: float = 0.0


class AnomalyDetectionRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    warehouse_ids: Optional[List[int]] = None
    min_score: float = 1.0


class DailyStatsResponse(BaseModel):
    stats_date: str
    total_orders: int
    avg_transit_hours: float
    anomaly_count: int
    total_weight: float


class DetectionResult(BaseModel):
    total_analyzed: int
    total_anomalies: int
    stl_volume_anomalies: int
    lstm_duration_anomalies: int
    top_k_subgraphs: List[TopKSubgraphResponse]
    processing_time_ms: float


class GeoBoundingBox(BaseModel):
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
