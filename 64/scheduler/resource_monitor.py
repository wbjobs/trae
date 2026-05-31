import psutil
import multiprocessing
import threading
import time
import os
import logging
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
import json
from enum import Enum


class LogLevel(Enum):
    DEBUG = 10
    INFO = 20
    WARNING = 30
    ERROR = 40
    CRITICAL = 50


@dataclass
class MonitorConfig:
    log_dir: str = "logs"
    log_file: str = "resource_monitor.log"
    polling_interval: float = 1.0
    history_size: int = 3600
    enable_csv_log: bool = True
    enable_console_log: bool = True
    log_cpu: bool = True
    log_memory: bool = True
    log_disk: bool = True
    log_network: bool = False
    log_processes: bool = True
    alert_cpu_threshold: float = 90.0
    alert_memory_threshold: float = 90.0
    alert_disk_threshold: float = 90.0


@dataclass
class ResourceLogEntry:
    timestamp: float
    datetime: str
    cpu_percent: float
    cpu_cores_used: int
    memory_percent: float
    memory_used_gb: float
    memory_available_gb: float
    disk_usage_percent: float
    disk_read_mb: float
    disk_write_mb: float
    net_sent_mb: float
    net_recv_mb: float
    active_processes: int
    active_threads: int
    task_count: int = 0
    custom_metrics: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "datetime": self.datetime,
            "cpu_percent": float(self.cpu_percent),
            "cpu_cores_used": int(self.cpu_cores_used),
            "memory_percent": float(self.memory_percent),
            "memory_used_gb": float(self.memory_used_gb),
            "memory_available_gb": float(self.memory_available_gb),
            "disk_usage_percent": float(self.disk_usage_percent),
            "disk_read_mb": float(self.disk_read_mb),
            "disk_write_mb": float(self.disk_write_mb),
            "net_sent_mb": float(self.net_sent_mb),
            "net_recv_mb": float(self.net_recv_mb),
            "active_processes": int(self.active_processes),
            "active_threads": int(self.active_threads),
            "task_count": int(self.task_count),
            "custom_metrics": {k: float(v) for k, v in self.custom_metrics.items()}
        }

    def to_csv_row(self) -> str:
        values = [
            self.datetime,
            f"{self.cpu_percent:.2f}",
            f"{self.cpu_cores_used}",
            f"{self.memory_percent:.2f}",
            f"{self.memory_used_gb:.3f}",
            f"{self.memory_available_gb:.3f}",
            f"{self.disk_usage_percent:.2f}",
            f"{self.disk_read_mb:.3f}",
            f"{self.disk_write_mb:.3f}",
            f"{self.net_sent_mb:.3f}",
            f"{self.net_recv_mb:.3f}",
            f"{self.active_processes}",
            f"{self.active_threads}",
            f"{self.task_count}"
        ]
        return ",".join(values)

    @classmethod
    def get_csv_header(cls) -> str:
        headers = [
            "datetime", "cpu_percent", "cpu_cores_used",
            "memory_percent", "memory_used_gb", "memory_available_gb",
            "disk_usage_percent", "disk_read_mb", "disk_write_mb",
            "net_sent_mb", "net_recv_mb",
            "active_processes", "active_threads", "task_count"
        ]
        return ",".join(headers)


class ResourceMonitor:
    def __init__(self, config: Optional[MonitorConfig] = None):
        self.config = config or MonitorConfig()
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
        self._history: List[ResourceLogEntry] = []
        self._callbacks: List[Callable[[ResourceLogEntry], None]] = []
        self._custom_metrics: Dict[str, float] = {}
        self._task_count: int = 0

        self._last_disk_io = psutil.disk_io_counters()
        self._last_net_io = psutil.net_io_counters()
        self._total_cores = multiprocessing.cpu_count()

        self._setup_logger()

    def _setup_logger(self):
        os.makedirs(self.config.log_dir, exist_ok=True)

        self.logger = logging.getLogger("ResourceMonitor")
        self.logger.setLevel(logging.INFO)
        self.logger.handlers.clear()

        log_format = logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )

        if self.config.enable_console_log:
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(log_format)
            self.logger.addHandler(console_handler)

        log_filepath = os.path.join(self.config.log_dir, self.config.log_file)
        file_handler = logging.FileHandler(log_filepath, encoding='utf-8')
        file_handler.setFormatter(log_format)
        self.logger.addHandler(file_handler)

        if self.config.enable_csv_log:
            self._csv_filepath = os.path.join(self.config.log_dir, "resource_history.csv")
            if not os.path.exists(self._csv_filepath):
                with open(self._csv_filepath, 'w', encoding='utf-8') as f:
                    f.write(ResourceLogEntry.get_csv_header() + "\n")

    def start(self):
        if self._monitor_thread is None or not self._monitor_thread.is_alive():
            self._stop_event.clear()
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._monitor_thread.start()
            self.logger.info("资源监控已启动")

    def stop(self):
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=3.0)
        self.logger.info("资源监控已停止")

    def _monitor_loop(self):
        while not self._stop_event.is_set():
            try:
                entry = self._collect_metrics()
                self._process_entry(entry)
            except Exception as e:
                self.logger.error(f"监控数据采集失败: {e}")

            time.sleep(self.config.polling_interval)

    def _collect_metrics(self) -> ResourceLogEntry:
        now = time.time()
        now_str = datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S')

        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_cores_used = int(self._total_cores * cpu_percent / 100.0)

        memory = psutil.virtual_memory()
        disk_usage = psutil.disk_usage('/')

        current_disk_io = psutil.disk_io_counters()
        disk_read_mb = (current_disk_io.read_bytes - self._last_disk_io.read_bytes) / (1024 ** 2)
        disk_write_mb = (current_disk_io.write_bytes - self._last_disk_io.write_bytes) / (1024 ** 2)
        self._last_disk_io = current_disk_io

        current_net_io = psutil.net_io_counters()
        net_sent_mb = (current_net_io.bytes_sent - self._last_net_io.bytes_sent) / (1024 ** 2)
        net_recv_mb = (current_net_io.bytes_recv - self._last_net_io.bytes_recv) / (1024 ** 2)
        self._last_net_io = current_net_io

        active_processes = len(psutil.pids())
        active_threads = threading.active_count()

        with self._lock:
            custom_metrics = self._custom_metrics.copy()
            task_count = self._task_count

        return ResourceLogEntry(
            timestamp=now,
            datetime=now_str,
            cpu_percent=cpu_percent,
            cpu_cores_used=cpu_cores_used,
            memory_percent=memory.percent,
            memory_used_gb=memory.used / (1024 ** 3),
            memory_available_gb=memory.available / (1024 ** 3),
            disk_usage_percent=disk_usage.percent,
            disk_read_mb=disk_read_mb,
            disk_write_mb=disk_write_mb,
            net_sent_mb=net_sent_mb,
            net_recv_mb=net_recv_mb,
            active_processes=active_processes,
            active_threads=active_threads,
            task_count=task_count,
            custom_metrics=custom_metrics
        )

    def _process_entry(self, entry: ResourceLogEntry):
        with self._lock:
            self._history.append(entry)
            if len(self._history) > self.config.history_size:
                self._history = self._history[-self.config.history_size:]

        self._check_alerts(entry)

        if self.config.enable_csv_log and hasattr(self, '_csv_filepath'):
            try:
                with open(self._csv_filepath, 'a', encoding='utf-8') as f:
                    f.write(entry.to_csv_row() + "\n")
            except Exception:
                pass

        for callback in self._callbacks:
            try:
                callback(entry)
            except Exception:
                pass

    def _check_alerts(self, entry: ResourceLogEntry):
        if entry.cpu_percent > self.config.alert_cpu_threshold:
            self.logger.warning(
                f"⚠️  CPU使用率过高: {entry.cpu_percent:.1f}% "
                f"(阈值: {self.config.alert_cpu_threshold}%)"
            )

        if entry.memory_percent > self.config.alert_memory_threshold:
            self.logger.warning(
                f"⚠️  内存使用率过高: {entry.memory_percent:.1f}% "
                f"(阈值: {self.config.alert_memory_threshold}%)"
            )

        if entry.disk_usage_percent > self.config.alert_disk_threshold:
            self.logger.warning(
                f"⚠️  磁盘使用率过高: {entry.disk_usage_percent:.1f}% "
                f"(阈值: {self.config.alert_disk_threshold}%)"
            )

    def add_callback(self, callback: Callable[[ResourceLogEntry], None]):
        self._callbacks.append(callback)

    def remove_callback(self, callback: Callable[[ResourceLogEntry], None]):
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def update_custom_metric(self, name: str, value: float):
        with self._lock:
            self._custom_metrics[name] = value

    def update_task_count(self, count: int):
        with self._lock:
            self._task_count = count

    def get_latest(self) -> Optional[ResourceLogEntry]:
        with self._lock:
            return self._history[-1] if self._history else None

    def get_history(self, last_n_seconds: int = 60) -> List[ResourceLogEntry]:
        with self._lock:
            if not self._history:
                return []
            cutoff = time.time() - last_n_seconds
            return [e for e in self._history if e.timestamp >= cutoff]

    def get_stats_summary(self) -> Dict:
        with self._lock:
            history = list(self._history)

        if not history:
            return {}

        cpu_values = [e.cpu_percent for e in history]
        mem_values = [e.memory_percent for e in history]

        return {
            "monitoring": True,
            "history_entries": len(history),
            "cpu_avg": float(sum(cpu_values) / len(cpu_values)),
            "cpu_max": float(max(cpu_values)),
            "memory_avg": float(sum(mem_values) / len(mem_values)),
            "memory_max": float(max(mem_values)),
            "total_cores": self._total_cores,
            "latest": self._history[-1].to_dict() if self._history else None
        }

    def export_history(self, filepath: str, format: str = "json"):
        with self._lock:
            history = [e.to_dict() for e in self._history]

        if format == "json":
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(history, f, indent=2, ensure_ascii=False)
        elif format == "csv":
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(ResourceLogEntry.get_csv_header() + "\n")
                for entry in self._history:
                    f.write(entry.to_csv_row() + "\n")

        self.logger.info(f"监控历史已导出: {filepath}")

    def log_message(self, message: str, level: LogLevel = LogLevel.INFO):
        self.logger.log(level.value, message)

    def log_task_event(self, task_id: str, event: str, details: Optional[str] = None):
        msg = f"[任务] {task_id} - {event}"
        if details:
            msg += f": {details}"
        self.logger.info(msg)

    def log_solver_metrics(self, iteration: int, residuals: Dict, compute_time: float):
        msg = (f"[求解] 迭代 {iteration:4d} | "
               f"质量残差: {residuals.get('mass', 0):.2e} | "
               f"动量残差: {residuals.get('momentum', 0):.2e} | "
               f"耗时: {compute_time:.3f}s")
        self.logger.info(msg)
