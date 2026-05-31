import struct
import threading
import time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import deque
from src.core.models import DeviceConfig, TagPoint, DataType


class ProtocolType(Enum):
    MODBUS_TCP = "modbus_tcp"
    MODBUS_RTU = "modbus_rtu"
    OPC_UA = "opc_ua"
    SIEMENS_S7 = "siemens_s7"
    MITSUBISHI_MC = "mitsubishi_mc"
    OMRON_FINS = "omron_fins"
    AB_EIP = "ab_eip"


class DataArea(Enum):
    INPUT = "input"
    OUTPUT = "output"
    HOLDING = "holding"
    COIL = "coil"
    INPUT_REGISTER = "input_register"
    HOLDING_REGISTER = "holding_register"
    DB = "db"
    M = "m"
    I = "i"
    Q = "q"


@dataclass
class ProtocolDataPoint:
    area: DataArea
    address: int
    data_type: DataType
    length: int = 1
    bit_offset: int = 0


@dataclass
class ProtocolRequest:
    request_id: int
    data_points: List[ProtocolDataPoint]
    callback: Optional[Callable] = None
    timestamp: float = field(default_factory=time.time)
    retries: int = 0


@dataclass
class ProtocolResponse:
    request_id: int
    success: bool
    values: Dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    timestamp: float = field(default_factory=time.time)


class ProtocolPacket:
    def __init__(self):
        self._buffer = bytearray()

    def write_byte(self, value: int):
        self._buffer.append(value & 0xFF)

    def write_bytes(self, data: bytes):
        self._buffer.extend(data)

    def write_uint16(self, value: int, big_endian: bool = True):
        if big_endian:
            self._buffer.extend(struct.pack('>H', value & 0xFFFF))
        else:
            self._buffer.extend(struct.pack('<H', value & 0xFFFF))

    def write_uint32(self, value: int, big_endian: bool = True):
        if big_endian:
            self._buffer.extend(struct.pack('>I', value & 0xFFFFFFFF))
        else:
            self._buffer.extend(struct.pack('<I', value & 0xFFFFFFFF))

    def write_float(self, value: float, big_endian: bool = True):
        if big_endian:
            self._buffer.extend(struct.pack('>f', value))
        else:
            self._buffer.extend(struct.pack('<f', value))

    def write_double(self, value: float, big_endian: bool = True):
        if big_endian:
            self._buffer.extend(struct.pack('>d', value))
        else:
            self._buffer.extend(struct.pack('<d', value))

    def get_bytes(self) -> bytes:
        return bytes(self._buffer)

    def length(self) -> int:
        return len(self._buffer)


class ProtocolParser:
    def __init__(self):
        self._buffer = bytearray()

    def append(self, data: bytes):
        self._buffer.extend(data)

    def clear(self):
        self._buffer.clear()

    def read_byte(self, offset: int = 0) -> int:
        return self._buffer[offset]

    def read_bytes(self, offset: int, length: int) -> bytes:
        return bytes(self._buffer[offset:offset + length])

    def read_uint16(self, offset: int = 0, big_endian: bool = True) -> int:
        data = self._buffer[offset:offset + 2]
        if big_endian:
            return struct.unpack('>H', data)[0]
        return struct.unpack('<H', data)[0]

    def read_uint32(self, offset: int = 0, big_endian: bool = True) -> int:
        data = self._buffer[offset:offset + 4]
        if big_endian:
            return struct.unpack('>I', data)[0]
        return struct.unpack('<I', data)[0]

    def read_float(self, offset: int = 0, big_endian: bool = True, swap_words: bool = False) -> float:
        data = self._buffer[offset:offset + 4]
        if swap_words:
            data = data[2:4] + data[0:2]
        if big_endian:
            return struct.unpack('>f', data)[0]
        return struct.unpack('<f', data)[0]

    def read_double(self, offset: int = 0, big_endian: bool = True) -> float:
        data = self._buffer[offset:offset + 8]
        if big_endian:
            return struct.unpack('>d', data)[0]
        return struct.unpack('<d', data)[0]

    def read_int16(self, offset: int = 0, big_endian: bool = True) -> int:
        data = self._buffer[offset:offset + 2]
        if big_endian:
            return struct.unpack('>h', data)[0]
        return struct.unpack('<h', data)[0]

    def read_int32(self, offset: int = 0, big_endian: bool = True, swap_words: bool = False) -> int:
        data = self._buffer[offset:offset + 4]
        if swap_words:
            data = data[2:4] + data[0:2]
        if big_endian:
            return struct.unpack('>i', data)[0]
        return struct.unpack('<i', data)[0]

    def length(self) -> int:
        return len(self._buffer)

    def available(self, length: int) -> bool:
        return len(self._buffer) >= length


class BatchOptimizer:
    def __init__(self, max_batch_size: int = 100, max_gap: int = 10):
        self._max_batch_size = max_batch_size
        self._max_gap = max_gap

    def optimize_read(self, data_points: List[ProtocolDataPoint]) -> List[List[ProtocolDataPoint]]:
        if not data_points:
            return []
        sorted_points = sorted(data_points, key=lambda p: (p.area.value, p.address))
        batches = []
        current_batch = []
        current_area = None
        current_start = 0
        current_end = 0
        for point in sorted_points:
            if not current_batch:
                current_batch = [point]
                current_area = point.area
                current_start = point.address
                current_end = point.address + self._get_point_length(point)
            else:
                if point.area == current_area and point.address - current_end <= self._max_gap:
                    if len(current_batch) < self._max_batch_size:
                        current_batch.append(point)
                        current_end = max(current_end, point.address + self._get_point_length(point))
                    else:
                        batches.append(current_batch)
                        current_batch = [point]
                        current_area = point.area
                        current_start = point.address
                        current_end = point.address + self._get_point_length(point)
                else:
                    batches.append(current_batch)
                    current_batch = [point]
                    current_area = point.area
                    current_start = point.address
                    current_end = point.address + self._get_point_length(point)
        if current_batch:
            batches.append(current_batch)
        return batches

    def _get_point_length(self, point: ProtocolDataPoint) -> int:
        type_lengths = {
            DataType.BOOL: 1,
            DataType.INT16: 2,
            DataType.INT32: 4,
            DataType.FLOAT32: 4,
            DataType.FLOAT64: 8,
        }
        base_length = type_lengths.get(point.data_type, 2)
        return base_length * point.length


class ConnectionPool:
    def __init__(self, max_connections: int = 10):
        self._max_connections = max_connections
        self._connections: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._last_used: Dict[str, float] = {}
        self._idle_timeout = 300

    def get_connection(self, key: str, creator: Callable[[], Any]) -> Optional[Any]:
        with self._lock:
            if key in self._connections:
                self._last_used[key] = time.time()
                return self._connections[key]
            if len(self._connections) >= self._max_connections:
                self._cleanup_idle()
            if len(self._connections) < self._max_connections:
                try:
                    conn = creator()
                    self._connections[key] = conn
                    self._last_used[key] = time.time()
                    return conn
                except Exception as e:
                    print(f"Connection creation error: {e}")
                    return None
            return None

    def release_connection(self, key: str):
        with self._lock:
            self._last_used[key] = time.time()

    def close_connection(self, key: str, closer: Optional[Callable] = None):
        with self._lock:
            if key in self._connections:
                if closer:
                    try:
                        closer(self._connections[key])
                    except:
                        pass
                del self._connections[key]
                if key in self._last_used:
                    del self._last_used[key]

    def _cleanup_idle(self):
        now = time.time()
        idle_keys = [
            key for key, last_used in self._last_used.items()
            if now - last_used > self._idle_timeout
        ]
        for key in idle_keys:
            del self._connections[key]
            del self._last_used[key]

    def close_all(self, closer: Optional[Callable] = None):
        with self._lock:
            for key, conn in self._connections.items():
                if closer:
                    try:
                        closer(conn)
                    except:
                        pass
            self._connections.clear()
            self._last_used.clear()


class RequestQueue:
    def __init__(self, max_size: int = 1000):
        self._queue: deque = deque(maxlen=max_size)
        self._lock = threading.Lock()
        self._pending: Dict[int, ProtocolRequest] = {}
        self._next_id = 0

    def enqueue(self, request: ProtocolRequest) -> int:
        with self._lock:
            request_id = self._next_id
            request.request_id = request_id
            self._next_id = (self._next_id + 1) % 1000000
            self._queue.append(request)
            self._pending[request_id] = request
            return request_id

    def dequeue(self, timeout: float = 0.1) -> Optional[ProtocolRequest]:
        start_time = time.time()
        while time.time() - start_time < timeout:
            with self._lock:
                if self._queue:
                    return self._queue.popleft()
            time.sleep(0.001)
        return None

    def complete(self, response: ProtocolResponse):
        with self._lock:
            if response.request_id in self._pending:
                request = self._pending.pop(response.request_id)
                if request.callback:
                    try:
                        request.callback(response)
                    except Exception as e:
                        print(f"Callback error: {e}")

    def fail(self, request_id: int, error_message: str):
        with self._lock:
            if request_id in self._pending:
                request = self._pending.pop(request_id)
                if request.callback:
                    try:
                        request.callback(ProtocolResponse(
                            request_id=request_id,
                            success=False,
                            error_message=error_message
                        ))
                    except Exception as e:
                        print(f"Callback error: {e}")

    def size(self) -> int:
        with self._lock:
            return len(self._queue)

    def pending_count(self) -> int:
        with self._lock:
            return len(self._pending)


class PerformanceMonitor:
    def __init__(self, window_size: int = 100):
        self._window_size = window_size
        self._response_times: deque = deque(maxlen=window_size)
        self._request_count = 0
        self._error_count = 0
        self._bytes_sent = 0
        self._bytes_received = 0
        self._lock = threading.Lock()

    def record_request(self, response_time: float, success: bool, bytes_sent: int = 0, bytes_received: int = 0):
        with self._lock:
            self._response_times.append(response_time)
            self._request_count += 1
            if not success:
                self._error_count += 1
            self._bytes_sent += bytes_sent
            self._bytes_received += bytes_received

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            if not self._response_times:
                avg_time = 0.0
                min_time = 0.0
                max_time = 0.0
            else:
                times = list(self._response_times)
                avg_time = sum(times) / len(times)
                min_time = min(times)
                max_time = max(times)
            error_rate = (self._error_count / self._request_count * 100) if self._request_count > 0 else 0.0
            return {
                "request_count": self._request_count,
                "error_count": self._error_count,
                "error_rate": error_rate,
                "avg_response_time": avg_time,
                "min_response_time": min_time,
                "max_response_time": max_time,
                "bytes_sent": self._bytes_sent,
                "bytes_received": self._bytes_received,
                "throughput": self._request_count / 60.0 if self._request_count > 0 else 0.0
            }

    def reset(self):
        with self._lock:
            self._response_times.clear()
            self._request_count = 0
            self._error_count = 0
            self._bytes_sent = 0
            self._bytes_received = 0


class ProtocolAdapterBase(ABC):
    def __init__(self, device_config: DeviceConfig):
        self._config = device_config
        self._connected = False
        self._parser = ProtocolParser()
        self._optimizer = BatchOptimizer()
        self._request_queue = RequestQueue()
        self._performance = PerformanceMonitor()
        self._lock = threading.Lock()

    @abstractmethod
    def connect(self) -> bool:
        pass

    @abstractmethod
    def disconnect(self):
        pass

    @abstractmethod
    def build_read_packet(self, data_points: List[ProtocolDataPoint]) -> bytes:
        pass

    @abstractmethod
    def parse_response(self, response_data: bytes, request: ProtocolRequest) -> Dict[str, Any]:
        pass

    @abstractmethod
    def build_write_packet(self, data_point: ProtocolDataPoint, value: Any) -> bytes:
        pass

    def batch_read(self, tags: List[TagPoint]) -> Dict[str, Optional[Any]]:
        if not self._connected:
            return {}
        data_points = [self._tag_to_data_point(tag) for tag in tags]
        batches = self._optimizer.optimize_read(data_points)
        results = {}
        for batch in batches:
            try:
                packet = self.build_read_packet(batch)
                start_time = time.time()
                response_data = self._send_and_receive(packet)
                response_time = (time.time() - start_time) * 1000
                if response_data:
                    self._performance.record_request(response_time, True, len(packet), len(response_data))
                    request = ProtocolRequest(request_id=0, data_points=batch)
                    values = self.parse_response(response_data, request)
                    results.update(values)
                else:
                    self._performance.record_request(response_time, False, len(packet), 0)
            except Exception as e:
                print(f"Batch read error: {e}")
                for dp in batch:
                    results[self._get_tag_name(dp)] = None
        return results

    def _tag_to_data_point(self, tag: TagPoint) -> ProtocolDataPoint:
        area = DataArea.HOLDING_REGISTER
        address = 0
        try:
            address = int(tag.address)
        except (ValueError, TypeError):
            pass
        from src.core.models import PointType
        if tag.point_type in [PointType.AI, PointType.AO]:
            area = DataArea.HOLDING_REGISTER
        elif tag.point_type in [PointType.DI, PointType.DO]:
            area = DataArea.COIL
        return ProtocolDataPoint(
            area=area,
            address=address,
            data_type=tag.data_type
        )

    def _get_tag_name(self, data_point: ProtocolDataPoint) -> str:
        return f"{data_point.area.value}_{data_point.address}"

    @abstractmethod
    def _send_and_receive(self, packet: bytes) -> Optional[bytes]:
        pass

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def performance_stats(self) -> Dict[str, Any]:
        return self._performance.get_stats()
