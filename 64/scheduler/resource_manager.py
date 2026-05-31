import psutil
import multiprocessing
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import time


class ResourceStatus(Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    OVERLOADED = "overloaded"
    UNAVAILABLE = "unavailable"


@dataclass
class ResourceConfig:
    max_cpu_cores: int = 0
    max_memory_gb: float = 0.0
    cpu_threshold: float = 80.0
    memory_threshold: float = 80.0
    reserve_cores: int = 1
    reserve_memory_gb: float = 1.0
    enable_dynamic_allocation: bool = True
    polling_interval: float = 1.0


@dataclass
class ResourceSnapshot:
    timestamp: float
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    available_cores: int
    available_memory_gb: float
    disk_io_read_mb: float = 0.0
    disk_io_write_mb: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "cpu_percent": float(self.cpu_percent),
            "memory_percent": float(self.memory_percent),
            "memory_used_gb": float(self.memory_used_gb),
            "available_cores": int(self.available_cores),
            "available_memory_gb": float(self.available_memory_gb),
            "disk_io_read_mb": float(self.disk_io_read_mb),
            "disk_io_write_mb": float(self.disk_io_write_mb)
        }


@dataclass
class AllocatedResources:
    task_id: str
    cpu_cores: int
    memory_gb: float
    start_time: float
    priority: int = 0

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "cpu_cores": self.cpu_cores,
            "memory_gb": float(self.memory_gb),
            "start_time": float(self.start_time),
            "priority": self.priority
        }


class ResourceManager:
    def __init__(self, config: Optional[ResourceConfig] = None):
        self.config = config or ResourceConfig()
        self._total_cores = multiprocessing.cpu_count()
        self._total_memory_gb = psutil.virtual_memory().total / (1024 ** 3)
        self._allocated_resources: Dict[str, AllocatedResources] = {}
        self._resource_history: List[ResourceSnapshot] = []
        self._last_disk_io = psutil.disk_io_counters()

        if self.config.max_cpu_cores == 0:
            self.config.max_cpu_cores = self._total_cores - self.config.reserve_cores
        if self.config.max_memory_gb == 0:
            self.config.max_memory_gb = self._total_memory_gb - self.config.reserve_memory_gb

    def get_system_resources(self) -> ResourceSnapshot:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk_io = psutil.disk_io_counters()

        read_bytes = disk_io.read_bytes - self._last_disk_io.read_bytes
        write_bytes = disk_io.write_bytes - self._last_disk_io.write_bytes
        self._last_disk_io = disk_io

        allocated_cores = sum(alloc.cpu_cores for alloc in self._allocated_resources.values())
        allocated_memory = sum(alloc.memory_gb for alloc in self._allocated_resources.values())

        available_cores = max(0, self.config.max_cpu_cores - allocated_cores)
        available_memory = max(0.0, self.config.max_memory_gb - allocated_memory)

        snapshot = ResourceSnapshot(
            timestamp=time.time(),
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            memory_used_gb=memory.used / (1024 ** 3),
            available_cores=available_cores,
            available_memory_gb=available_memory,
            disk_io_read_mb=read_bytes / (1024 ** 2),
            disk_io_write_mb=write_bytes / (1024 ** 2)
        )

        self._resource_history.append(snapshot)
        if len(self._resource_history) > 3600:
            self._resource_history = self._resource_history[-3600:]

        return snapshot

    def allocate_resources(self, task_id: str, required_cores: int,
                           required_memory_gb: float, priority: int = 0) -> Optional[AllocatedResources]:
        if not self.config.enable_dynamic_allocation:
            return AllocatedResources(
                task_id=task_id,
                cpu_cores=required_cores,
                memory_gb=required_memory_gb,
                start_time=time.time(),
                priority=priority
            )

        snapshot = self.get_system_resources()

        if snapshot.cpu_percent > self.config.cpu_threshold:
            return None
        if snapshot.memory_percent > self.config.memory_threshold:
            return None

        available_cores = snapshot.available_cores
        available_memory = snapshot.available_memory_gb

        if required_cores > available_cores or required_memory_gb > available_memory:
            return None

        allocation = AllocatedResources(
            task_id=task_id,
            cpu_cores=required_cores,
            memory_gb=required_memory_gb,
            start_time=time.time(),
            priority=priority
        )
        self._allocated_resources[task_id] = allocation
        return allocation

    def release_resources(self, task_id: str):
        if task_id in self._allocated_resources:
            del self._allocated_resources[task_id]

    def request_optimal_allocation(self, task_id: str, min_cores: int = 1,
                                    max_cores: int = 8, min_memory_gb: float = 0.5,
                                    max_memory_gb: float = 8.0, priority: int = 0) -> Optional[AllocatedResources]:
        snapshot = self.get_system_resources()

        if snapshot.cpu_percent > self.config.cpu_threshold:
            return None
        if snapshot.memory_percent > self.config.memory_threshold:
            return None

        available_cores = snapshot.available_cores
        available_memory = snapshot.available_memory_gb

        optimal_cores = min(max_cores, max(min_cores, available_cores))
        optimal_memory = min(max_memory_gb, max(min_memory_gb, available_memory * 0.8))

        if optimal_cores < min_cores or optimal_memory < min_memory_gb:
            return None

        return self.allocate_resources(task_id, optimal_cores, optimal_memory, priority)

    def get_resource_status(self) -> ResourceStatus:
        snapshot = self.get_system_resources()

        if snapshot.cpu_percent > 95 or snapshot.memory_percent > 95:
            return ResourceStatus.OVERLOADED
        elif snapshot.cpu_percent > self.config.cpu_threshold or snapshot.memory_percent > self.config.memory_threshold:
            return ResourceStatus.BUSY
        else:
            return ResourceStatus.AVAILABLE

    def get_allocated_resources(self) -> List[AllocatedResources]:
        return list(self._allocated_resources.values())

    def get_resource_summary(self) -> Dict:
        snapshot = self.get_system_resources()
        return {
            "total_cores": self._total_cores,
            "total_memory_gb": float(self._total_memory_gb),
            "max_allowed_cores": self.config.max_cpu_cores,
            "max_allowed_memory_gb": float(self.config.max_memory_gb),
            "allocated_cores": sum(alloc.cpu_cores for alloc in self._allocated_resources.values()),
            "allocated_memory_gb": float(sum(alloc.memory_gb for alloc in self._allocated_resources.values())),
            "available_cores": snapshot.available_cores,
            "available_memory_gb": float(snapshot.available_memory_gb),
            "cpu_percent": float(snapshot.cpu_percent),
            "memory_percent": float(snapshot.memory_percent),
            "status": self.get_resource_status().value,
            "active_tasks": len(self._allocated_resources)
        }

    def get_resource_history(self, last_n_seconds: int = 60) -> List[ResourceSnapshot]:
        if not self._resource_history:
            return []
        cutoff_time = time.time() - last_n_seconds
        return [s for s in self._resource_history if s.timestamp >= cutoff_time]

    def estimate_task_resources(self, mesh_size: int, num_iterations: int) -> Tuple[int, float]:
        estimated_memory = max(0.5, mesh_size * 8 * 1e-6 * 10)
        estimated_cores = min(8, max(1, int(mesh_size / 10000)))
        return estimated_cores, estimated_memory
