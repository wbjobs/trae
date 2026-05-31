import time
import logging
from typing import Optional
from peripheral_adapter import DriverAdapter

logger = logging.getLogger(__name__)

DRIVER_NAME = 'custom_serial'
DESCRIPTION = '自定义串口通信驱动示例'
VERSION = '1.0.0'


class CustomSerialDriver(DriverAdapter):
    def __init__(self, device_id: str, port: str = None, baudrate: int = 9600):
        super().__init__(device_id)
        self.port = port
        self.baudrate = baudrate
        self._serial = None
        self._read_thread = None
        self._stop_event = None
        self._protocol_mode = 'standard'

    def connect(self, **kwargs) -> bool:
        try:
            import serial
            self.port = kwargs.get('port', self.port)
            self.baudrate = kwargs.get('baudrate', self.baudrate)
            self._protocol_mode = kwargs.get('protocol_mode', 'standard')

            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1.0,
                write_timeout=1.0
            )

            if self._protocol_mode == 'custom':
                self._initialize_custom_protocol()

            self.connected = True
            self._stop_event = __import__('threading').Event()
            self._start_read_thread()
            self._notify_status_changed(True)
            logger.info(f'Custom serial device {self.device_id} connected')
            return True
        except Exception as e:
            logger.error(f'Custom serial connect error: {e}')
            self.connected = False
            return False

    def _initialize_custom_protocol(self) -> None:
        init_cmd = bytes([0xAA, 0x01, 0x00, 0xAB])
        self._serial.write(init_cmd)
        time.sleep(0.1)
        response = self._serial.read(4)
        if len(response) < 4 or response[3] != 0xBA:
            raise RuntimeError('Custom protocol initialization failed')

    def disconnect(self) -> None:
        if self._stop_event:
            self._stop_event.set()
        if self._read_thread:
            self._read_thread.join(timeout=1.0)
        if self._serial:
            self._serial.close()
            self._serial = None
        self.connected = False
        self._notify_status_changed(False)
        logger.info(f'Custom serial device {self.device_id} disconnected')

    def send(self, data: bytes) -> bool:
        if not self.connected or not self._serial:
            return False
        try:
            with self._lock:
                if self._protocol_mode == 'custom':
                    data = self._wrap_custom_frame(data)
                self._serial.write(data)
            return True
        except Exception as e:
            logger.error(f'Custom serial send error: {e}')
            return False

    def _wrap_custom_frame(self, data: bytes) -> bytes:
        header = bytes([0xAA, 0x55])
        length = len(data).to_bytes(2, 'big')
        checksum = sum(data) & 0xFF
        footer = bytes([checksum, 0x55, 0xAA])
        return header + length + data + footer

    def receive(self, timeout: float = 1.0) -> Optional[bytes]:
        if not self.connected or not self._serial:
            return None
        try:
            start_time = time.time()
            while time.time() - start_time < timeout:
                if self._serial.in_waiting > 0:
                    data = self._serial.read(self._serial.in_waiting)
                    if self._protocol_mode == 'custom':
                        data = self._unwrap_custom_frame(data)
                    return data
                time.sleep(0.01)
            return None
        except Exception as e:
            logger.error(f'Custom serial receive error: {e}')
            return None

    def _unwrap_custom_frame(self, data: bytes) -> Optional[bytes]:
        if len(data) < 7:
            return data
        if data[0] == 0xAA and data[1] == 0x55:
            length = int.from_bytes(data[2:4], 'big')
            if len(data) >= 4 + length + 3:
                return data[4:4 + length]
        return data

    def _start_read_thread(self) -> None:
        import threading
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

    def _read_loop(self) -> None:
        while not self._stop_event.is_set() and self.connected:
            try:
                data = self.receive(timeout=0.5)
                if data and self._on_data_received:
                    self._on_data_received(data)
            except Exception as e:
                logger.error(f'Custom serial read loop error: {e}')
                time.sleep(0.1)
