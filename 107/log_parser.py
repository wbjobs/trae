import re
from datetime import datetime
from typing import Dict, Optional, Any
from dataclasses import dataclass, field


COMBINED_LOG_PATTERN = re.compile(
    r'(?P<remote_addr>\S+)\s+'
    r'(?P<remote_user>\S+)\s+'
    r'(?P<user>\S+)\s+'
    r'\[(?P<time_local>[^\]]+)\]\s+'
    r'"(?P<request_method>[A-Z]+)\s+'
    r'(?P<request_uri>\S+)\s+'
    r'(?P<server_protocol>[^"]+)"\s+'
    r'(?P<status>\d+)\s+'
    r'(?P<body_bytes_sent>\d+)\s+'
    r'"(?P<http_referer>[^"]*)"\s+'
    r'"(?P<http_user_agent>[^"]*)"'
)

MAIN_LOG_PATTERN = re.compile(
    r'(?P<remote_addr>\S+)\s+'
    r'(?P<remote_user>\S+)\s+'
    r'(?P<user>\S+)\s+'
    r'\[(?P<time_local>[^\]]+)\]\s+'
    r'"(?P<request_method>[A-Z]+)\s+'
    r'(?P<request_uri>\S+)\s+'
    r'(?P<server_protocol>[^"]+)"\s+'
    r'(?P<status>\d+)\s+'
    r'(?P<body_bytes_sent>\d+)\s+'
    r'"(?P<http_referer>[^"]*)"\s+'
    r'"(?P<http_user_agent>[^"]*)"\s+'
    r'"(?P<http_x_forwarded_for>[^"]*)"\s+'
    r'(?P<request_time>[\d.]+)\s+'
    r'(?P<upstream_response_time>[\d.]+)'
)

JSON_LOG_PATTERN = re.compile(r'\{.*\}')

NGINX_TIME_FORMAT = '%d/%b/%Y:%H:%M:%S %z'


@dataclass
class ParsedLog:
    raw: str
    fields: Dict[str, Any]
    timestamp: Optional[datetime] = None
    parse_success: bool = True
    error: Optional[str] = None
    format_type: str = "unknown"


class NginxLogParser:
    def __init__(self):
        self._patterns = [
            ("main", MAIN_LOG_PATTERN),
            ("combined", COMBINED_LOG_PATTERN),
        ]

    def parse_line(self, line: str) -> ParsedLog:
        line = line.strip()
        if not line:
            return ParsedLog(raw=line, fields={}, parse_success=False, error="empty line")

        if line.startswith('{'):
            return self._parse_json(line)

        for format_name, pattern in self._patterns:
            match = pattern.match(line)
            if match:
                return self._build_parsed_log(line, match.groupdict(), format_name)

        return ParsedLog(raw=line, fields={}, parse_success=False, error="no pattern matched")

    def _parse_json(self, line: str) -> ParsedLog:
        import json
        try:
            data = json.loads(line)
            timestamp = None
            if 'time' in data:
                timestamp = self._try_parse_timestamp(data['time'])
            elif 'timestamp' in data:
                timestamp = self._try_parse_timestamp(data['timestamp'])
            elif 'time_local' in data:
                timestamp = self._try_parse_timestamp(data['time_local'])

            return ParsedLog(
                raw=line,
                fields=data,
                timestamp=timestamp,
                parse_success=True,
                format_type="json"
            )
        except json.JSONDecodeError as e:
            return ParsedLog(raw=line, fields={}, parse_success=False, error=f"json decode error: {e}")

    def _build_parsed_log(self, raw: str, fields: Dict[str, str], format_type: str) -> ParsedLog:
        parsed_fields = {}
        for key, value in fields.items():
            parsed_fields[key] = value

        timestamp = None
        if 'time_local' in fields:
            timestamp = self._try_parse_timestamp(fields['time_local'])

        return ParsedLog(
            raw=raw,
            fields=parsed_fields,
            timestamp=timestamp,
            parse_success=True,
            format_type=format_type
        )

    @staticmethod
    def _try_parse_timestamp(time_str: str) -> Optional[datetime]:
        try:
            return datetime.strptime(time_str, NGINX_TIME_FORMAT)
        except ValueError:
            for fmt in ['%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f%z']:
                try:
                    return datetime.strptime(time_str, fmt)
                except ValueError:
                    continue
            return None

    def extract_field_signature(self, parsed_log: ParsedLog) -> Dict[str, str]:
        signature = {}
        for key, value in parsed_log.fields.items():
            if value is None:
                signature[key] = 'null'
            elif isinstance(value, bool):
                signature[key] = 'bool'
            elif isinstance(value, int):
                signature[key] = 'int'
            elif isinstance(value, float):
                signature[key] = 'float'
            elif isinstance(value, str):
                signature[key] = 'string'
            elif isinstance(value, dict):
                signature[key] = 'object'
            elif isinstance(value, list):
                signature[key] = 'array'
            else:
                signature[key] = type(value).__name__
        return signature

    def extract_enum_values(self, parsed_log: ParsedLog, enum_fields: list = None) -> Dict[str, set]:
        if enum_fields is None:
            enum_fields = ['status', 'request_method', 'server_protocol']

        enum_values = {}
        for field in enum_fields:
            if field in parsed_log.fields:
                value = str(parsed_log.fields[field])
                if field not in enum_values:
                    enum_values[field] = set()
                enum_values[field].add(value)

        return enum_values
