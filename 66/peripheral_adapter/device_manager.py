import threading
import time
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging

from .driver_adapter import DriverAdapter, SerialDriver, NetworkDriver, USBDriver
from .protocol_parser import ProtocolParser, ModbusParser, CustomProtocolParser

logger = logging.getLogger(__name__)


class DeviceStatus(Enum):
    DISCONNECTED = 'disconnected'
    CONNECTING = 'connecting'
    CONNECTED = 'connected'
    ERROR = 'error'


@dataclass
class PeripheralDevice:
    device_id: str
    name: str
    device_type: str
    driver_type: str
    protocol_type: str
    connection_params: Dict[str, Any] = field(default_factory=dict)
    status: DeviceStatus = DeviceStatus.DISCONNECTED
    capabilities: List[str] = field(default_factory=list)
    last_seen: float = 0.0
    error_message: str = ''
    state: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'device_id': self.device_id,
            'name': self.name,
            'device_type': self.device_type,
            'driver_type': self.driver_type,
            'protocol_type': self.protocol_type,
            'connection_params': self.connection_params,
            'capabilities': self.capabilities
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PeripheralDevice':
        return cls(
            device_id=data['device_id'],
            name=data['name'],
            device_type=data['device_type'],
            driver_type=data['driver_type'],
            protocol_type=data['protocol_type'],
            connection_params=data.get('connection_params', {}),
            capabilities=data.get('capabilities', [])
        )


class DeviceManager:
    def __init__(self):
        self._devices: Dict[str, PeripheralDevice] = {}
        self._drivers: Dict[str, DriverAdapter] = {}
        self._parsers: Dict[str, ProtocolParser] = {}
        self._lock = threading.RLock()
        self._on_device_status: Optional[Callable[[str, DeviceStatus], None]] = None
        self._on_device_data: Optional[Callable[[str, Dict[str, Any]], None]] = None
        self._on_device_error: Optional[Callable[[str, str], None]] = None
        self._monitor_thread = None
        self._stop_monitor = threading.Event()
        self._error_history: Dict[str, List[Dict[str, Any]]] = {}
        self._consecutive_errors: Dict[str, int] = {}
        self._auto_reconnect_enabled = True
        self._alert_threshold = 3

    def set_on_device_status(self, callback: Callable[[str, DeviceStatus], None]) -> None:
        self._on_device_status = callback

    def set_on_device_data(self, callback: Callable[[str, Dict[str, Any]], None]) -> None:
        self._on_device_data = callback

    def set_on_device_error(self, callback: Callable[[str, str], None]) -> None:
        self._on_device_error = callback

    def set_auto_reconnect(self, enabled: bool) -> None:
        self._auto_reconnect_enabled = enabled

    def set_alert_threshold(self, threshold: int) -> None:
        self._alert_threshold = max(1, threshold)

    def _record_error(self, device_id: str, error_msg: str) -> None:
        if device_id not in self._error_history:
            self._error_history[device_id] = []
        self._error_history[device_id].append({
            'time': time.time(),
            'error': error_msg
        })
        self._error_history[device_id] = self._error_history[device_id][-100:]

        self._consecutive_errors[device_id] = self._consecutive_errors.get(device_id, 0) + 1

        if self._consecutive_errors[device_id] >= self._alert_threshold:
            if self._on_device_error:
                try:
                    device = self._devices.get(device_id)
                    device_name = device.name if device else device_id
                    self._on_device_error(
                        device_name,
                        f'设备连续 {self._consecutive_errors[device_id]} 次异常: {error_msg}'
                    )
                except Exception as e:
                    logger.error(f'Error callback error: {e}')

    def _reset_error_count(self, device_id: str) -> None:
        self._consecutive_errors[device_id] = 0

    def add_device(self, device: PeripheralDevice) -> None:
        with self._lock:
            self._devices[device.device_id] = device
            self._create_driver(device)
            self._create_parser(device)
            logger.info(f'Device added: {device.device_id} - {device.name}')

    def remove_device(self, device_id: str) -> None:
        with self._lock:
            if device_id in self._drivers:
                self._drivers[device_id].disconnect()
                del self._drivers[device_id]
            if device_id in self._parsers:
                del self._parsers[device_id]
            if device_id in self._devices:
                del self._devices[device_id]
            logger.info(f'Device removed: {device_id}')

    def get_device(self, device_id: str) -> Optional[PeripheralDevice]:
        with self._lock:
            return self._devices.get(device_id)

    def get_all_devices(self) -> List[PeripheralDevice]:
        with self._lock:
            return list(self._devices.values())

    def connect_device(self, device_id: str) -> bool:
        with self._lock:
            device = self._devices.get(device_id)
            driver = self._drivers.get(device_id)
            if not device or not driver:
                return False

            device.status = DeviceStatus.CONNECTING
            self._notify_status(device_id, DeviceStatus.CONNECTING)

            try:
                if driver.connect(**device.connection_params):
                    device.status = DeviceStatus.CONNECTED
                    device.last_seen = time.time()
                    device.error_message = ''
                    self._notify_status(device_id, DeviceStatus.CONNECTED)
                    logger.info(f'Device connected: {device_id}')
                    return True
                else:
                    device.status = DeviceStatus.ERROR
                    device.error_message = 'Connection failed'
                    self._notify_status(device_id, DeviceStatus.ERROR)
                    return False
            except Exception as e:
                device.status = DeviceStatus.ERROR
                device.error_message = str(e)
                self._notify_status(device_id, DeviceStatus.ERROR)
                logger.error(f'Connect device {device_id} error: {e}')
                return False

    def disconnect_device(self, device_id: str) -> None:
        with self._lock:
            device = self._devices.get(device_id)
            driver = self._drivers.get(device_id)
            if driver:
                driver.disconnect()
            if device:
                device.status = DeviceStatus.DISCONNECTED
                self._notify_status(device_id, DeviceStatus.DISCONNECTED)
            logger.info(f'Device disconnected: {device_id}')

    def send_command(self, device_id: str, command: str, params: Dict[str, Any] = None) -> bool:
        with self._lock:
            device = self._devices.get(device_id)
            driver = self._drivers.get(device_id)
            parser = self._parsers.get(device_id)

            if not device or not driver or not parser:
                error_msg = f'设备 {device_id} 未就绪'
                logger.error(f'Cannot send command: {error_msg}')
                self._record_error(device_id, error_msg)
                return False

            if not driver.is_connected():
                error_msg = f'设备 {device_id} 未连接'
                logger.error(error_msg)
                self._record_error(device_id, error_msg)
                return False

            try:
                data = parser.encode(command, params or {})
                if driver.send(data):
                    device.last_seen = time.time()
                    self._reset_error_count(device_id)
                    logger.debug(f'Command sent to {device_id}: {command}')
                    return True
                else:
                    error_msg = f'指令 {command} 发送失败'
                    self._record_error(device_id, error_msg)
                    return False
            except Exception as e:
                error_msg = f'指令发送异常: {str(e)}'
                logger.error(f'Send command to {device_id} error: {e}')
                self._record_error(device_id, error_msg)
                return False

    def send_raw(self, device_id: str, data: bytes) -> bool:
        with self._lock:
            driver = self._drivers.get(device_id)
            if not driver or not driver.is_connected():
                return False
            return driver.send(data)

    def start_monitor(self) -> None:
        if self._monitor_thread is None or not self._monitor_thread.is_alive():
            self._stop_monitor.clear()
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._monitor_thread.start()
            logger.info('Device monitor started')

    def stop_monitor(self) -> None:
        self._stop_monitor.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2.0)
        logger.info('Device monitor stopped')

    def _monitor_loop(self) -> None:
        while not self._stop_monitor.is_set():
            try:
                with self._lock:
                    for device_id, device in self._devices.items():
                        if device.status == DeviceStatus.CONNECTED:
                            driver = self._drivers.get(device_id)
                            if driver and not driver.is_connected():
                                device.status = DeviceStatus.DISCONNECTED
                                self._notify_status(device_id, DeviceStatus.DISCONNECTED)
                                logger.warning(f'Device {device_id} lost connection')
            except Exception as e:
                logger.error(f'Monitor loop error: {e}')
            time.sleep(2.0)

    def _create_driver(self, device: PeripheralDevice) -> None:
        driver_type = device.driver_type.lower()
        params = device.connection_params or {}

        if driver_type == 'serial':
            driver = SerialDriver(
                device.device_id,
                port=params.get('port'),
                baudrate=params.get('baudrate', 9600)
            )
        elif driver_type == 'network':
            driver = NetworkDriver(
                device.device_id,
                host=params.get('host'),
                port=params.get('port', 502)
            )
        elif driver_type == 'usb':
            driver = USBDriver(
                device.device_id,
                vid=params.get('vid'),
                pid=params.get('pid')
            )
        else:
            raise ValueError(f'Unsupported driver type: {driver_type}')

        driver.set_on_data_received(lambda data, did=device.device_id: self._on_driver_data(did, data))
        driver.set_on_status_changed(lambda status, did=device.device_id: self._on_driver_status(did, status))
        self._drivers[device.device_id] = driver

    def _create_parser(self, device: PeripheralDevice) -> None:
        protocol_type = device.protocol_type.lower()
        if protocol_type == 'modbus':
            parser = ModbusParser(slave_address=device.connection_params.get('slave_address', 1))
        elif protocol_type == 'custom':
            parser = CustomProtocolParser(device.connection_params.get('protocol_config', {}))
        else:
            raise ValueError(f'Unsupported protocol type: {protocol_type}')
        self._parsers[device.device_id] = parser

    def _on_driver_data(self, device_id: str, data: bytes) -> None:
        parser = self._parsers.get(device_id)
        device = self._devices.get(device_id)
        if parser and device:
            try:
                decoded = parser.decode(data)
                if decoded:
                    device.state.update(decoded)
                    device.last_seen = time.time()
                    if self._on_device_data:
                        self._on_device_data(device_id, decoded)
            except Exception as e:
                logger.error(f'Parse data from {device_id} error: {e}')

    def _on_driver_status(self, device_id: str, connected: bool) -> None:
        device = self._devices.get(device_id)
        if device:
            device.status = DeviceStatus.CONNECTED if connected else DeviceStatus.DISCONNECTED
            self._notify_status(device_id, device.status)

    def _notify_status(self, device_id: str, status: DeviceStatus) -> None:
        if self._on_device_status:
            try:
                self._on_device_status(device_id, status)
            except Exception as e:
                logger.error(f'Status notification error: {e}')
