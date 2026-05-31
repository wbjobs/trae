import struct
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)


class ProtocolParser(ABC):
    def __init__(self, protocol_name: str):
        self.protocol_name = protocol_name

    @abstractmethod
    def encode(self, command: str, params: Dict[str, Any] = None) -> bytes:
        pass

    @abstractmethod
    def decode(self, data: bytes) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def validate(self, data: bytes) -> bool:
        pass


class ModbusParser(ProtocolParser):
    FUNCTION_CODES = {
        'read_coils': 0x01,
        'read_discrete_inputs': 0x02,
        'read_holding_registers': 0x03,
        'read_input_registers': 0x04,
        'write_single_coil': 0x05,
        'write_single_register': 0x06,
        'write_multiple_coils': 0x0F,
        'write_multiple_registers': 0x10
    }

    def __init__(self, slave_address: int = 1):
        super().__init__('modbus_rtu')
        self.slave_address = slave_address

    def encode(self, command: str, params: Dict[str, Any] = None) -> bytes:
        params = params or {}
        function_code = self.FUNCTION_CODES.get(command)
        if function_code is None:
            raise ValueError(f'Unknown Modbus command: {command}')

        data = struct.pack('>B', self.slave_address)
        data += struct.pack('>B', function_code)

        if command in ['read_coils', 'read_discrete_inputs', 'read_holding_registers', 'read_input_registers']:
            start_addr = params.get('start_address', 0)
            count = params.get('count', 1)
            data += struct.pack('>HH', start_addr, count)
        elif command == 'write_single_coil':
            addr = params.get('address', 0)
            value = params.get('value', 0)
            coil_value = 0xFF00 if value else 0x0000
            data += struct.pack('>HH', addr, coil_value)
        elif command == 'write_single_register':
            addr = params.get('address', 0)
            value = params.get('value', 0)
            data += struct.pack('>HH', addr, value)
        elif command == 'write_multiple_coils':
            start_addr = params.get('start_address', 0)
            values = params.get('values', [])
            count = len(values)
            byte_count = (count + 7) // 8
            data += struct.pack('>HHB', start_addr, count, byte_count)
            for i in range(byte_count):
                byte_val = 0
                for j in range(8):
                    idx = i * 8 + j
                    if idx < count and values[idx]:
                        byte_val |= (1 << j)
                data += struct.pack('>B', byte_val)
        elif command == 'write_multiple_registers':
            start_addr = params.get('start_address', 0)
            values = params.get('values', [])
            count = len(values)
            data += struct.pack('>HHB', start_addr, count, count * 2)
            for value in values:
                data += struct.pack('>H', value)

        crc = self._calculate_crc(data)
        data += struct.pack('<H', crc)
        return data

    def decode(self, data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 5 or not self.validate(data):
            return None
        try:
            slave_addr, function_code = struct.unpack('>BB', data[:2])
            result = {
                'slave_address': slave_addr,
                'function_code': function_code,
                'raw': data.hex()
            }

            if function_code & 0x80:
                exception_code = data[2]
                result['exception'] = True
                result['exception_code'] = exception_code
                return result

            if function_code in [0x01, 0x02]:
                byte_count = data[2]
                coils = []
                for i in range(byte_count):
                    byte_val = data[3 + i]
                    for j in range(8):
                        coils.append(bool(byte_val & (1 << j)))
                result['values'] = coils
            elif function_code in [0x03, 0x04]:
                byte_count = data[2]
                registers = []
                for i in range(0, byte_count, 2):
                    reg_val = struct.unpack('>H', data[3 + i:5 + i])[0]
                    registers.append(reg_val)
                result['values'] = registers
            elif function_code in [0x05, 0x06]:
                addr, value = struct.unpack('>HH', data[2:6])
                result['address'] = addr
                result['value'] = value
            elif function_code in [0x0F, 0x10]:
                start_addr, count = struct.unpack('>HH', data[2:6])
                result['start_address'] = start_addr
                result['count'] = count

            return result
        except Exception as e:
            logger.error(f'Modbus decode error: {e}')
            return None

    def validate(self, data: bytes) -> bool:
        if len(data) < 5:
            return False
        try:
            received_crc = struct.unpack('<H', data[-2:])[0]
            calculated_crc = self._calculate_crc(data[:-2])
            return received_crc == calculated_crc
        except Exception:
            return False

    def _calculate_crc(self, data: bytes) -> int:
        crc = 0xFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x0001:
                    crc = (crc >> 1) ^ 0xA001
                else:
                    crc >>= 1
        return crc


class CustomProtocolParser(ProtocolParser):
    def __init__(self, protocol_config: Dict[str, Any] = None):
        super().__init__('custom')
        self.config = protocol_config or {}
        self.header = bytes.fromhex(self.config.get('header', 'AA55'))
        self.footer = bytes.fromhex(self.config.get('footer', '55AA'))
        self.length_format = self.config.get('length_format', '>H')
        self.checksum_type = self.config.get('checksum_type', 'sum')

    def encode(self, command: str, params: Dict[str, Any] = None) -> bytes:
        params = params or {}
        payload = self._build_payload(command, params)
        length = struct.pack(self.length_format, len(payload))
        data = self.header + length + payload
        checksum = self._calculate_checksum(data)
        data += struct.pack('>B', checksum)
        data += self.footer
        return data

    def decode(self, data: bytes) -> Optional[Dict[str, Any]]:
        if not self.validate(data):
            return None
        try:
            header_len = len(self.header)
            length_size = struct.calcsize(self.length_format)
            payload_length = struct.unpack(self.length_format, data[header_len:header_len + length_size])[0]
            payload_start = header_len + length_size
            payload = data[payload_start:payload_start + payload_length]
            return self._parse_payload(payload)
        except Exception as e:
            logger.error(f'Custom protocol decode error: {e}')
            return None

    def validate(self, data: bytes) -> bool:
        if len(data) < len(self.header) + len(self.footer) + 2:
            return False
        if not data.startswith(self.header):
            return False
        if not data.endswith(self.footer):
            return False
        try:
            received_checksum = data[-len(self.footer) - 1]
            calculated_checksum = self._calculate_checksum(data[:-len(self.footer) - 1])
            return received_checksum == calculated_checksum
        except Exception:
            return False

    def _build_payload(self, command: str, params: Dict[str, Any]) -> bytes:
        cmd_byte = params.get('cmd_byte', 0x00)
        payload = struct.pack('>B', cmd_byte)
        if 'data' in params:
            payload += bytes(params['data'])
        return payload

    def _parse_payload(self, payload: bytes) -> Dict[str, Any]:
        return {
            'command_code': payload[0],
            'data': list(payload[1:]),
            'raw': payload.hex()
        }

    def _calculate_checksum(self, data: bytes) -> int:
        if self.checksum_type == 'sum':
            return sum(data) & 0xFF
        elif self.checksum_type == 'xor':
            result = 0
            for byte in data:
                result ^= byte
            return result
        return 0
