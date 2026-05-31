from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from src.core.models import DeviceConfig, TagPoint


class ProtocolAdapter(ABC):
    def __init__(self, device_config: DeviceConfig):
        self._config = device_config
        self._connected = False

    @abstractmethod
    def connect(self) -> bool:
        pass

    @abstractmethod
    def disconnect(self):
        pass

    @abstractmethod
    def read_tag(self, tag: TagPoint) -> Optional[Any]:
        pass

    @abstractmethod
    def write_tag(self, tag: TagPoint, value: Any) -> bool:
        pass

    @abstractmethod
    def read_multiple_tags(self, tags: List[TagPoint]) -> Dict[str, Optional[Any]]:
        pass

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def device_id(self) -> str:
        return self._config.device_id


class ModbusAdapter(ProtocolAdapter):
    def __init__(self, device_config: DeviceConfig):
        super().__init__(device_config)
        self._client = None

    def connect(self) -> bool:
        try:
            from pymodbus.client import ModbusTcpClient, ModbusSerialClient
            if self._config.ip_address and self._config.port:
                self._client = ModbusTcpClient(
                    self._config.ip_address,
                    port=self._config.port,
                    timeout=self._config.timeout / 1000
                )
            else:
                self._client = ModbusSerialClient(
                    port=self._config.serial_port,
                    baudrate=self._config.baud_rate,
                    timeout=self._config.timeout / 1000
                )
            self._connected = self._client.connect()
            return self._connected
        except ImportError:
            print("pymodbus not installed, using simulation mode")
            self._connected = True
            return True
        except Exception as e:
            print(f"Modbus connect error: {e}")
            self._connected = False
            return False

    def disconnect(self):
        if self._client:
            self._client.close()
        self._connected = False

    def read_tag(self, tag: TagPoint) -> Optional[Any]:
        if not self._connected:
            return None
        try:
            address = int(tag.address)
            if self._client is None:
                import random
                return random.uniform(tag.min_value, tag.max_value)
            from src.core.models import PointType
            if tag.point_type in [PointType.AI, PointType.AO]:
                result = self._client.read_holding_registers(address, 1)
                if not result.isError():
                    return result.registers[0] * tag.coefficient + tag.offset
            elif tag.point_type in [PointType.DI, PointType.DO]:
                result = self._client.read_coils(address, 1)
                if not result.isError():
                    return result.bits[0]
        except Exception as e:
            print(f"Modbus read error: {e}")
        return None

    def write_tag(self, tag: TagPoint, value: Any) -> bool:
        if not self._connected or tag.read_only:
            return False
        try:
            address = int(tag.address)
            if self._client is None:
                return True
            from src.core.models import PointType
            raw_value = (value - tag.offset) / tag.coefficient if tag.coefficient != 0 else value
            if tag.point_type in [PointType.AO, PointType.CO]:
                result = self._client.write_register(address, int(raw_value))
                return not result.isError()
            elif tag.point_type == PointType.DO:
                result = self._client.write_coil(address, bool(value))
                return not result.isError()
        except Exception as e:
            print(f"Modbus write error: {e}")
        return False

    def read_multiple_tags(self, tags: List[TagPoint]) -> Dict[str, Optional[Any]]:
        results = {}
        for tag in tags:
            results[tag.name] = self.read_tag(tag)
        return results


class OPCUAProtocol(ProtocolAdapter):
    def __init__(self, device_config: DeviceConfig):
        super().__init__(device_config)
        self._client = None

    def connect(self) -> bool:
        try:
            from opcua import Client
            url = f"opc.tcp://{self._config.ip_address}:{self._config.port}"
            self._client = Client(url)
            self._client.timeout = self._config.timeout / 1000
            self._client.connect()
            self._connected = True
            return True
        except ImportError:
            print("opcua not installed, using simulation mode")
            self._connected = True
            return True
        except Exception as e:
            print(f"OPC UA connect error: {e}")
            self._connected = False
            return False

    def disconnect(self):
        if self._client:
            try:
                self._client.disconnect()
            except:
                pass
        self._connected = False

    def read_tag(self, tag: TagPoint) -> Optional[Any]:
        if not self._connected:
            return None
        try:
            if self._client is None:
                import random
                return random.uniform(tag.min_value, tag.max_value)
            node = self._client.get_node(tag.address)
            value = node.get_value()
            return value * tag.coefficient + tag.offset
        except Exception as e:
            print(f"OPC UA read error: {e}")
        return None

    def write_tag(self, tag: TagPoint, value: Any) -> bool:
        if not self._connected or tag.read_only:
            return False
        try:
            if self._client is None:
                return True
            node = self._client.get_node(tag.address)
            raw_value = (value - tag.offset) / tag.coefficient if tag.coefficient != 0 else value
            node.set_value(raw_value)
            return True
        except Exception as e:
            print(f"OPC UA write error: {e}")
        return False

    def read_multiple_tags(self, tags: List[TagPoint]) -> Dict[str, Optional[Any]]:
        results = {}
        for tag in tags:
            results[tag.name] = self.read_tag(tag)
        return results


class ProtocolAdapterFactory:
    @staticmethod
    def create_adapter(device_config: DeviceConfig) -> ProtocolAdapter:
        protocol = device_config.protocol.lower()
        if protocol in ['modbus', 'modbus-tcp', 'modbus-rtu']:
            return ModbusAdapter(device_config)
        elif protocol in ['opcua', 'opc-ua']:
            return OPCUAProtocol(device_config)
        else:
            return ModbusAdapter(device_config)
