from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Any, Dict

class DataSourceBase(BaseModel):
    name: str
    type: str
    connection_info: Dict[str, Any]
    field_mapping: Dict[str, Any]

class DataSourceCreate(DataSourceBase):
    pass

class DataSourceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    connection_info: Optional[Dict[str, Any]] = None
    field_mapping: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class DataSourceResponse(DataSourceBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AnomalyDetectionRuleBase(BaseModel):
    name: str
    datasource_id: int
    algorithm: str
    params: Dict[str, Any]
    window_size: int = 60
    threshold: float = 3.0
    min_continuous: int = 1

class AnomalyDetectionRuleCreate(AnomalyDetectionRuleBase):
    pass

class AnomalyDetectionRuleUpdate(BaseModel):
    name: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    window_size: Optional[int] = None
    threshold: Optional[float] = None
    min_continuous: Optional[int] = None
    is_active: Optional[bool] = None

class AnomalyDetectionRuleResponse(AnomalyDetectionRuleBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AlertRuleBase(BaseModel):
    name: str
    anomaly_rule_id: int
    channel_type: str
    channel_config: Dict[str, Any]

class AlertRuleCreate(AlertRuleBase):
    pass

class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    channel_type: Optional[str] = None
    channel_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class AlertRuleResponse(AlertRuleBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AnomalyRecordUpdate(BaseModel):
    status: Optional[str] = None
    cause: Optional[str] = None

class AnomalyRecordResponse(BaseModel):
    id: int
    datasource_id: int
    anomaly_rule_id: int
    timestamp: datetime
    value: float
    severity: str
    description: Optional[str]
    context_data: Optional[Dict[str, Any]]
    status: str
    cause: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TimeSeriesData(BaseModel):
    timestamp: datetime
    value: float
    tags: Optional[Dict[str, Any]] = None

class AnomalyDetectionResult(BaseModel):
    is_anomaly: bool
    timestamp: datetime
    value: float
    severity: str
    score: float

class DataQueryParams(BaseModel):
    start_time: datetime
    end_time: datetime
    aggregation: str = "mean"
    interval: str = "1m"

class AlertHistoryResponse(BaseModel):
    id: int
    alert_rule_id: int
    anomaly_record_id: Optional[int]
    channel_type: str
    status: str
    error_message: Optional[str]
    sent_at: datetime
    response_data: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True

class ShareLinkCreate(BaseModel):
    datasource_id: int
    config: Dict[str, Any]
    expires_at: Optional[datetime] = None
    password: Optional[str] = None

class ShareLinkUpdate(BaseModel):
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None

class ShareLinkResponse(BaseModel):
    id: int
    token: str
    datasource_id: int
    config: Dict[str, Any]
    expires_at: Optional[datetime]
    is_active: bool
    view_count: int
    has_password: bool
    created_by: str
    created_at: datetime
    last_accessed_at: Optional[datetime]
    share_url: Optional[str] = None

    class Config:
        from_attributes = True

class ShareAccessRequest(BaseModel):
    token: str
    password: Optional[str] = None

class ShareAccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    datasource_id: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
