import time
import threading
from abc import ABC, abstractmethod
from typing import Callable, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class DriverAdapter(ABC):
    def __init__(self, device_id: str):
        self.device_id = device_id
        self.connected = False
        self._on_data_received: Optional[Callable] = None
        self._on_status_changed: Optional[Callable] = None
        self._lock = threading.Lock()

    @abstractmethod
    def connect(self, **kwargs) -> bool:
        pass

    @abstractmethod
    def disconnect(self) -> None:
        pass

    @abstractmethod
    def send(self, data: bytes) -> bool:
        pass

    @abstractmethod
    def receive(self, timeout: float = 1.0) -> Optional[bytes]:
        pass

    def set_on_data_received(self, callback: Callable[[bytes], None]) -> None:
        self._on_data_received = callback

    def set_on_status_changed(self, callback: Callable[[bool], None]) -> None:
        self._on_status_changed = callback

    def is_connected(self) -> bool:
        return self.connected

    def _notify_status_changed(self, status: bool) -> None:
        if self._on_status_changed:
            try:
                self._on_status_changed(status)
            except Exception as e:
                logger.error(f'Status callback error: {e}')


class SerialDriver(DriverAdapter):
    def __init__(self, device_id: str, port: str = None, baudrate: int = 9600):
        super().__init__(device_id)
        self.port = port
        self.baudrate = baudrate
        self.bytesize = 8
        self.parity = 'N'
        self.stopbits = 1
        self.rtscts = False
        self.xonxoff = False
        self._serial = None
        self._read_thread = None
        self._stop_event = threading.Event()
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 3

    def connect(self, **kwargs) -> bool:
        try:
            import serial
            self.port = kwargs.get('port', self.port)
            self.baudrate = kwargs.get('baudrate', self.baudrate)
            self.bytesize = kwargs.get('bytesize', self.bytesize)
            self.parity = kwargs.get('parity', self.parity)
            self.stopbits = kwargs.get('stopbits', self.stopbits)
            self.rtscts = kwargs.get('rtscts', self.rtscts)
            self.xonxoff = kwargs.get('xonxoff', self.xonxoff)

            parity_map = {'N': serial.PARITY_NONE, 'E': serial.PARITY_EVEN,
                          'O': serial.PARITY_ODD, 'M': serial.PARITY_MARK, 'S': serial.PARITY_SPACE}
            bytesize_map = {5: serial.FIVEBITS, 6: serial.SIXBITS,
                            7: serial.SEVENBITS, 8: serial.EIGHTBITS}
            stopbits_map = {1: serial.STOPBITS_ONE, 1.5: serial.STOPBITS_ONE_POINT_FIVE,
                            2: serial.STOPBITS_TWO}

            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=bytesize_map.get(self.bytesize, serial.EIGHTBITS),
                parity=parity_map.get(self.parity, serial.PARITY_NONE),
                stopbits=stopbits_map.get(self.stopbits, serial.STOPBITS_ONE),
                rtscts=self.rtscts,
                xonxoff=self.xonxoff,
                timeout=0.5,
                write_timeout=0.5
            )
            self.connected = True
            self._stop_event.clear()
            self._start_read_thread()
            self._notify_status_changed(True)
            logger.info(f'Serial device {self.device_id} connected on {self.port}')
            return True
        except Exception as e:
            logger.error(f'Serial connect error: {e}')
            self.connected = False
            return False

    def disconnect(self) -> None:
        self._stop_event.set()
        if self._read_thread:
            self._read_thread.join(timeout=1.0)
        if self._serial:
            self._serial.close()
            self._serial = None
        self.connected = False
        self._notify_status_changed(False)
        logger.info(f'Serial device {self.device_id} disconnected')

    def send(self, data: bytes) -> bool:
        if not self.connected or not self._serial:
            return False
        try:
            with self._lock:
                self._serial.write(data)
            return True
        except Exception as e:
            logger.error(f'Serial send error: {e}')
            return False

    def receive(self, timeout: float = 1.0) -> Optional[bytes]:
        if not self.connected or not self._serial:
            return None
        try:
            start_time = time.time()
            while time.time() - start_time < timeout:
                if self._serial.in_waiting > 0:
                    return self._serial.read(self._serial.in_waiting)
                time.sleep(0.01)
            return None
        except Exception as e:
            logger.error(f'Serial receive error: {e}')
            return None

    def _start_read_thread(self) -> None:
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

    def _read_loop(self) -> None:
        while not self._stop_event.is_set() and self.connected:
            try:
                data = self.receive(timeout=0.1)
                if data and self._on_data_received:
                    self._on_data_received(data)
            except Exception as e:
                logger.error(f'Read loop error: {e}')
                time.sleep(0.1)


class NetworkDriver(DriverAdapter):
    def __init__(self, device_id: str, host: str = None, port: int = 502):
        super().__init__(device_id)
        self.host = host
        self.port = port
        self.protocol = 'tcp'
        self.timeout = 2.0
        self._socket = None
        self._read_thread = None
        self._stop_event = threading.Event()
        self._local_port = None

    def connect(self, **kwargs) -> bool:
        import socket
        try:
            self.host = kwargs.get('host', self.host)
            self.port = kwargs.get('port', self.port)
            self.protocol = kwargs.get('protocol', self.protocol).lower()
            self.timeout = kwargs.get('timeout', self.timeout)
            self._local_port = kwargs.get('local_port', self._local_port)

            if self.protocol == 'udp':
                self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                if self._local_port:
                    self._socket.bind(('', self._local_port))
            else:
                self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

            self._socket.settimeout(self.timeout)

            if self.protocol != 'udp':
                self._socket.connect((self.host, self.port))
            self.connected = True
            self._stop_event.clear()
            self._start_read_thread()
            self._notify_status_changed(True)
            logger.info(f'Network device {self.device_id} connected to {self.host}:{self.port}')
            return True
        except Exception as e:
            logger.error(f'Network connect error: {e}')
            self.connected = False
            return False

    def disconnect(self) -> None:
        self._stop_event.set()
        if self._read_thread:
            self._read_thread.join(timeout=1.0)
        if self._socket:
            self._socket.close()
            self._socket = None
        self.connected = False
        self._notify_status_changed(False)
        logger.info(f'Network device {self.device_id} disconnected')

    def send(self, data: bytes) -> bool:
        if not self._socket:
            return False
        try:
            with self._lock:
                if self.protocol == 'udp':
                    self._socket.sendto(data, (self.host, self.port))
                else:
                    self._socket.sendall(data)
            return True
        except Exception as e:
            logger.error(f'Network send error: {e}')
            return False

    def receive(self, timeout: float = 1.0) -> Optional[bytes]:
        if not self._socket:
            return None
        try:
            self._socket.settimeout(timeout)
            if self.protocol == 'udp':
                data, addr = self._socket.recvfrom(4096)
                return data if data else None
            else:
                data = self._socket.recv(4096)
                return data if data else None
        except Exception:
            return None

    def _start_read_thread(self) -> None:
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

    def _read_loop(self) -> None:
        while not self._stop_event.is_set() and self.connected:
            try:
                data = self.receive(timeout=0.5)
                if data and self._on_data_received:
                    self._on_data_received(data)
            except Exception as e:
                logger.error(f'Read loop error: {e}')
                time.sleep(0.1)


class USBDriver(DriverAdapter):
    def __init__(self, device_id: str, vid: int = None, pid: int = None):
        super().__init__(device_id)
        self.vid = vid
        self.pid = pid
        self.configuration = 1
        self.interface = 0
        self.write_endpoint = 0x01
        self.read_endpoint = 0x81
        self.read_size = 64
        self._device = None
        self._read_thread = None
        self._stop_event = threading.Event()

    def connect(self, **kwargs) -> bool:
        try:
            import usb.core
            import usb.util
            self.vid = kwargs.get('vid', self.vid)
            self.pid = kwargs.get('pid', self.pid)
            self.configuration = kwargs.get('configuration', self.configuration)
            self.interface = kwargs.get('interface', self.interface)
            self.write_endpoint = kwargs.get('write_endpoint', self.write_endpoint)
            self.read_endpoint = kwargs.get('read_endpoint', self.read_endpoint)
            self.read_size = kwargs.get('read_size', self.read_size)

            self._device = usb.core.find(idVendor=self.vid, idProduct=self.pid)
            if self._device is None:
                return False
            try:
                if self._device.is_kernel_driver_active(self.interface):
                    self._device.detach_kernel_driver(self.interface)
            except Exception:
                pass
            self._device.set_configuration(self.configuration)
            try:
                self._device.set_interface_altsetting(self.interface, 0)
            except Exception:
                pass
            self.connected = True
            self._stop_event.clear()
            self._start_read_thread()
            self._notify_status_changed(True)
            logger.info(f'USB device {self.device_id} connected')
            return True
        except Exception as e:
            logger.error(f'USB connect error: {e}')
            self.connected = False
            return False

    def disconnect(self) -> None:
        self._stop_event.set()
        if self._read_thread:
            self._read_thread.join(timeout=1.0)
        if self._device:
            import usb.util
            usb.util.dispose_resources(self._device)
            self._device = None
        self.connected = False
        self._notify_status_changed(False)
        logger.info(f'USB device {self.device_id} disconnected')

    def send(self, data: bytes) -> bool:
        if not self._device:
            return False
        try:
            with self._lock:
                self._device.write(self.write_endpoint, data)
            return True
        except Exception as e:
            logger.error(f'USB send error: {e}')
            return False

    def receive(self, timeout: float = 1.0) -> Optional[bytes]:
        if not self._device:
            return None
        try:
            data = self._device.read(self.read_endpoint, self.read_size, timeout=int(timeout * 1000))
            return bytes(data)
        except Exception:
            return None

    def _start_read_thread(self) -> None:
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

    def _read_loop(self) -> None:
        while not self._stop_event.is_set() and self.connected:
            try:
                data = self.receive(timeout=0.5)
                if data and self._on_data_received:
                    self._on_data_received(data)
            except Exception as e:
                logger.error(f'Read loop error: {e}')
                time.sleep(0.1)
