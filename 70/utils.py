import re
import socket
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime


def validate_host(host: str) -> Tuple[bool, str]:
    try:
        socket.gethostbyname(host)
        return True, ""
    except socket.gaierror:
        return False, "主机名无法解析"
    except Exception as e:
        return False, str(e)


def validate_port(port: int) -> Tuple[bool, str]:
    try:
        port = int(port)
        if 1 <= port <= 65535:
            return True, ""
        return False, "端口必须在 1-65535 之间"
    except ValueError:
        return False, "端口必须是数字"


def is_ip_address(address: str) -> bool:
    pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if re.match(pattern, address):
        parts = address.split('.')
        return all(0 <= int(part) <= 255 for part in parts)
    return False


def parse_time_string(time_str: str) -> Optional[datetime]:
    formats = [
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
        '%Y-%m-%d',
        '%Y/%m/%d %H:%M:%S',
        '%Y/%m/%d %H:%M',
        '%Y/%m/%d',
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    
    return None


def format_bytes(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f} 秒"
    elif seconds < 3600:
        return f"{seconds / 60:.1f} 分钟"
    elif seconds < 86400:
        return f"{seconds / 3600:.1f} 小时"
    else:
        return f"{seconds / 86400:.1f} 天"


def parse_uptime(uptime_str: str) -> Optional[float]:
    patterns = [
        r'up\s+(\d+)\s+days?,\s+(\d+):(\d+)',
        r'up\s+(\d+)\s+hours?,\s+(\d+)\s+min',
        r'up\s+(\d+)\s+min',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, uptime_str, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                days = int(groups[0])
                hours = int(groups[1])
                minutes = int(groups[2])
                return days * 86400 + hours * 3600 + minutes * 60
            elif len(groups) == 2:
                hours = int(groups[0])
                minutes = int(groups[1])
                return hours * 3600 + minutes * 60
            elif len(groups) == 1:
                minutes = int(groups[0])
                return minutes * 60
    
    return None


def extract_error_lines(content: str, keyword: str = "", 
                        max_lines: int = 100) -> List[str]:
    lines = content.strip().split('\n')
    error_lines = []
    
    error_keywords = ['error', 'exception', 'fail', 'fatal', 'critical', 
                      '警告', '错误', '异常']
    
    for line in lines:
        line_lower = line.lower()
        
        if keyword and keyword.lower() in line_lower:
            error_lines.append(line)
            continue
        
        if any(ek in line_lower for ek in error_keywords):
            error_lines.append(line)
        
        if len(error_lines) >= max_lines:
            break
    
    return error_lines


def extract_stacktrace(content: str) -> List[str]:
    lines = content.split('\n')
    stacktraces = []
    current_trace = []
    in_trace = False
    
    for line in lines:
        if re.search(r'(Exception|Error|Traceback|at\s+[\w.]+|Caused by:)', line):
            if not in_trace:
                in_trace = True
                current_trace = [line]
            else:
                current_trace.append(line)
        elif in_trace and (line.startswith((' ', '\t', 'at ', '...')) or 
                          'Caused by:' in line):
            current_trace.append(line)
        elif in_trace:
            if current_trace:
                stacktraces.append('\n'.join(current_trace))
            current_trace = []
            in_trace = False
    
    if current_trace:
        stacktraces.append('\n'.join(current_trace))
    
    return stacktraces


def count_keyword_occurrences(content: str, keyword: str, 
                              case_insensitive: bool = True) -> int:
    if case_insensitive:
        return content.lower().count(keyword.lower())
    return content.count(keyword)


def sanitize_filename(filename: str) -> str:
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename.strip()


def get_file_extension(filepath: str) -> str:
    return os.path.splitext(filepath)[1].lower().lstrip('.')


def chunk_list(lst: List[Any], chunk_size: int) -> List[List[Any]]:
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


class RetryHandler:
    def __init__(self, max_retries: int = 3, delay: float = 1.0, 
                 backoff: float = 2.0):
        self.max_retries = max_retries
        self.delay = delay
        self.backoff = backoff
    
    def execute(self, func: callable, *args, **kwargs) -> Tuple[bool, Any]:
        last_exception = None
        current_delay = self.delay
        
        for attempt in range(self.max_retries):
            try:
                result = func(*args, **kwargs)
                return True, result
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    time.sleep(current_delay)
                    current_delay *= self.backoff
        
        return False, last_exception


class ProgressTracker:
    def __init__(self, total: int, description: str = ""):
        self.total = total
        self.current = 0
        self.description = description
        self.start_time = datetime.now()
    
    def update(self, advance: int = 1) -> None:
        self.current += advance
    
    def get_percentage(self) -> float:
        if self.total == 0:
            return 100.0
        return (self.current / self.total) * 100
    
    def get_eta(self) -> Optional[float]:
        if self.current == 0:
            return None
        elapsed = (datetime.now() - self.start_time).total_seconds()
        rate = self.current / elapsed
        remaining = self.total - self.current
        return remaining / rate if rate > 0 else None
    
    def print_progress(self) -> None:
        percentage = self.get_percentage()
        eta = self.get_eta()
        
        bar_length = 30
        filled = int(bar_length * percentage / 100)
        bar = '█' * filled + '░' * (bar_length - filled)
        
        eta_str = format_duration(eta) if eta else "计算中..."
        
        print(f"\r{self.description} [{bar}] {percentage:.1f}% "
              f"({self.current}/{self.total}) ETA: {eta_str}", end='', flush=True)
        
        if self.current >= self.total:
            print()


import os
import time
