from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum


class PointType(Enum):
    AI = "AI"
    AO = "AO"
    DI = "DI"
    DO = "DO"
    CI = "CI"
    CO = "CO"


class DataType(Enum):
    INT16 = "int16"
    INT32 = "int32"
    FLOAT32 = "float32"
    FLOAT64 = "float64"
    BOOL = "bool"


class DeviceStatus(Enum):
    OFFLINE = "offline"
    ONLINE = "online"
    FAULT = "fault"
    SIMULATING = "simulating"


@dataclass
class TagPoint:
    name: str
    address: str
    point_type: PointType
    data_type: DataType
    description: str = ""
    unit: str = ""
    min_value: float = 0.0
    max_value: float = 100.0
    default_value: Any = 0
    current_value: Any = 0
    alarm_low: Optional[float] = None
    alarm_high: Optional[float] = None
    coefficient: float = 1.0
    offset: float = 0.0
    read_only: bool = False
    group: str = "default"
    last_update: datetime = field(default_factory=datetime.now)


@dataclass
class DeviceConfig:
    device_id: str
    device_name: str
    protocol: str
    ip_address: str = ""
    port: int = 0
    serial_port: str = ""
    baud_rate: int = 9600
    timeout: int = 5000
    status: DeviceStatus = DeviceStatus.OFFLINE
    tags: Dict[str, TagPoint] = field(default_factory=dict)


@dataclass
class ProjectInfo:
    project_id: str
    project_name: str
    version: str = "1.0"
    author: str = ""
    create_time: datetime = field(default_factory=datetime.now)
    update_time: datetime = field(default_factory=datetime.now)
    description: str = ""
    devices: Dict[str, DeviceConfig] = field(default_factory=dict)
    scripts: Dict[str, str] = field(default_factory=dict)
    parameters: Dict[str, Any] = field(default_factory=dict)
