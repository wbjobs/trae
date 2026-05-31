import os
import yaml
import uuid
import time
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class TaskType(Enum):
    MAP = "map"
    REDUCE = "reduce"


@dataclass
class Task:
    id: str
    type: TaskType
    job_id: str
    input_path: str
    output_path: str
    status: TaskStatus = TaskStatus.PENDING
    worker: Optional[str] = None
    attempt: int = 0
    max_attempts: int = 3
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    partition: int = 0

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["type"] = self.type.value
        d["status"] = self.status.value
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        data["type"] = TaskType(data["type"])
        data["status"] = TaskStatus(data["status"])
        return cls(**data)


@dataclass
class JobConfig:
    name: str
    mapper: str
    reducer: str
    input_dir: str
    output_dir: str
    num_mappers: int = 2
    num_reducers: int = 2
    partition: str = "hash"
    max_retries: int = 3

    @classmethod
    def from_yaml(cls, path: str) -> "JobConfig":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls(**data)


@dataclass
class Job:
    id: str
    config: JobConfig
    status: TaskStatus = TaskStatus.PENDING
    map_tasks: List[Task] = field(default_factory=list)
    reduce_tasks: List[Task] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None

    def add_log(self, message: str) -> None:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        self.logs.append(f"[{timestamp}] {message}")

    def get_progress(self) -> Dict[str, Any]:
        total_map = len(self.map_tasks)
        completed_map = sum(1 for t in self.map_tasks if t.status == TaskStatus.COMPLETED)
        total_reduce = len(self.reduce_tasks)
        completed_reduce = sum(1 for t in self.reduce_tasks if t.status == TaskStatus.COMPLETED)
        failed_tasks = [t for t in self.map_tasks + self.reduce_tasks if t.status == TaskStatus.FAILED]

        return {
            "status": self.status.value,
            "map_progress": f"{completed_map}/{total_map}" if total_map > 0 else "0/0",
            "reduce_progress": f"{completed_reduce}/{total_reduce}" if total_reduce > 0 else "0/0",
            "map_percent": (completed_map / total_map * 100) if total_map > 0 else 0,
            "reduce_percent": (completed_reduce / total_reduce * 100) if total_reduce > 0 else 0,
            "failed_tasks": len(failed_tasks),
            "logs": self.logs[-20:],
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "config": asdict(self.config),
            "status": self.status.value,
            "map_tasks": [t.to_dict() for t in self.map_tasks],
            "reduce_tasks": [t.to_dict() for t in self.reduce_tasks],
            "logs": self.logs,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Job":
        config = JobConfig(**data["config"])
        job = cls(
            id=data["id"],
            config=config,
            status=TaskStatus(data["status"]),
            map_tasks=[Task.from_dict(t) for t in data["map_tasks"]],
            reduce_tasks=[Task.from_dict(t) for t in data["reduce_tasks"]],
            logs=data.get("logs", []),
            created_at=data.get("created_at", time.time()),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
        )
        return job


def generate_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:8]}"


def generate_task_id() -> str:
    return f"task_{uuid.uuid4().hex[:8]}"


def save_job_state(job: Job, state_dir: str) -> None:
    os.makedirs(state_dir, exist_ok=True)
    state_file = os.path.join(state_dir, f"{job.id}.yaml")
    with open(state_file, "w", encoding="utf-8") as f:
        yaml.dump(job.to_dict(), f, default_flow_style=False)


def load_job_state(job_id: str, state_dir: str) -> Optional[Job]:
    state_file = os.path.join(state_dir, f"{job_id}.yaml")
    if not os.path.exists(state_file):
        return None
    with open(state_file, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return Job.from_dict(data)


def list_jobs(state_dir: str) -> List[str]:
    if not os.path.exists(state_dir):
        return []
    return [f.replace(".yaml", "") for f in os.listdir(state_dir) if f.endswith(".yaml")]
