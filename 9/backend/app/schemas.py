from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class AlertLevel(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class AlertStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class WorkOrderStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrderPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ComponentInfo(BaseModel):
    component_id: str
    name: str
    name_cn: Optional[str] = None
    parent_id: Optional[str] = None
    position: Optional[Dict[str, float]] = None
    parameters: Optional[Dict[str, Any]] = {}
    children: Optional[List["ComponentInfo"]] = []
    model_path: Optional[str] = None


ComponentInfo.model_rebuild()


class DeviceBase(BaseModel):
    device_id: str
    name: str
    name_cn: str
    description: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = "normal"
    model_path: Optional[str] = None
    components: Optional[List[ComponentInfo]] = []


class DeviceCreate(DeviceBase):
    pass


class DeviceResponse(DeviceBase):
    id: str
    created_at: datetime
    updated_at: datetime


class DeviceData(BaseModel):
    device_id: str
    component_id: Optional[str] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    rotation_speed: Optional[float] = None
    vibration: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AlertRule(BaseModel):
    device_id: str
    parameter: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    level: AlertLevel = AlertLevel.WARNING
    component_id: Optional[str] = None


class Alert(BaseModel):
    id: Optional[str] = None
    device_id: str
    component_id: Optional[str] = None
    parameter: str
    current_value: float
    threshold: float
    level: AlertLevel
    status: AlertStatus = AlertStatus.ACTIVE
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None


class AlertResponse(Alert):
    id: str


class WorkOrder(BaseModel):
    id: Optional[str] = None
    device_id: str
    title: str
    description: str
    status: WorkOrderStatus = WorkOrderStatus.PENDING
    priority: WorkOrderPriority = WorkOrderPriority.MEDIUM
    assigned_to: Optional[str] = None
    alert_id: Optional[str] = None
    fault_type: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class WorkOrderResponse(WorkOrder):
    id: str


class FaultSimulation(BaseModel):
    device_id: str
    component_id: Optional[str] = None
    parameter: str
    target_value: float
    duration: int = 60
