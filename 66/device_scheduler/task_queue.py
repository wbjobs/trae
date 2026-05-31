import uuid
import time
import heapq
import threading
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = 'pending'
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'
    TIMEOUT = 'timeout'


class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3
    IMMEDIATE = 4


@dataclass
class Task:
    task_id: str
    name: str
    device_id: str
    command: str
    params: Dict[str, Any] = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    created_at: float = field(default_factory=time.time)
    scheduled_at: float = 0.0
    started_at: float = 0.0
    completed_at: float = 0.0
    timeout: float = 10.0
    retry_count: int = 0
    max_retries: int = 0
    dependencies: List[str] = field(default_factory=list)
    result: Any = None
    error_message: str = ''
    callback: Optional[Callable[[Dict[str, Any]], None]] = None

    def __lt__(self, other: 'Task') -> bool:
        return self.priority.value > other.priority.value

    def to_dict(self) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'name': self.name,
            'device_id': self.device_id,
            'command': self.command,
            'params': self.params,
            'priority': self.priority.value,
            'status': self.status.value,
            'created_at': self.created_at,
            'scheduled_at': self.scheduled_at,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'timeout': self.timeout,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'dependencies': self.dependencies,
            'error_message': self.error_message
        }


class TaskQueue:
    def __init__(self, max_size: int = 1000):
        self._tasks: Dict[str, Task] = {}
        self._queue: List[Task] = []
        self._max_size = max_size
        self._lock = threading.RLock()
        self._task_added = threading.Event()
        self._on_task_added: Optional[Callable[[Task], None]] = None
        self._on_task_removed: Optional[Callable[[Task], None]] = None
        self._on_task_status_changed: Optional[Callable[[Task, TaskStatus], None]] = None

    def set_on_task_added(self, callback: Callable[[Task], None]) -> None:
        self._on_task_added = callback

    def set_on_task_removed(self, callback: Callable[[Task], None]) -> None:
        self._on_task_removed = callback

    def set_on_task_status_changed(self, callback: Callable[[Task, TaskStatus], None]) -> None:
        self._on_task_status_changed = callback

    def add_task(self, task: Task) -> bool:
        with self._lock:
            if len(self._tasks) >= self._max_size:
                logger.warning('Task queue is full')
                return False

            if task.task_id in self._tasks:
                logger.warning(f'Task {task.task_id} already exists')
                return False

            task.status = TaskStatus.QUEUED
            task.scheduled_at = time.time()
            self._tasks[task.task_id] = task
            heapq.heappush(self._queue, task)
            self._task_added.set()

            if self._on_task_added:
                try:
                    self._on_task_added(task)
                except Exception as e:
                    logger.error(f'Task added callback error: {e}')

            logger.info(f'Task added: {task.task_id} - {task.name}')
            return True

    def get_task(self, task_id: str) -> Optional[Task]:
        with self._lock:
            return self._tasks.get(task_id)

    def get_all_tasks(self) -> List[Task]:
        with self._lock:
            return list(self._tasks.values())

    def get_tasks_by_status(self, status: TaskStatus) -> List[Task]:
        with self._lock:
            return [t for t in self._tasks.values() if t.status == status]

    def get_tasks_by_device(self, device_id: str) -> List[Task]:
        with self._lock:
            return [t for t in self._tasks.values() if t.device_id == device_id]

    def update_task_status(self, task_id: str, status: TaskStatus, error_message: str = '') -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return

            old_status = task.status
            task.status = status
            if error_message:
                task.error_message = error_message

            if status == TaskStatus.RUNNING:
                task.started_at = time.time()
            elif status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.TIMEOUT]:
                task.completed_at = time.time()

            if self._on_task_status_changed:
                try:
                    self._on_task_status_changed(task, old_status)
                except Exception as e:
                    logger.error(f'Task status changed callback error: {e}')

            logger.info(f'Task {task_id} status changed: {old_status.value} -> {status.value}')

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task or task.status in [TaskStatus.RUNNING, TaskStatus.COMPLETED, TaskStatus.FAILED]:
                return False

            self.update_task_status(task_id, TaskStatus.CANCELLED)
            return True

    def get_next_task(self, device_ids: List[str] = None) -> Optional[Task]:
        with self._lock:
            ready_tasks = []
            for task in self._queue:
                if task.status != TaskStatus.QUEUED:
                    continue
                if device_ids and task.device_id not in device_ids:
                    continue
                if not self._check_dependencies(task):
                    continue
                ready_tasks.append(task)

            if not ready_tasks:
                return None

            ready_tasks.sort(key=lambda t: (t.priority.value, t.scheduled_at), reverse=True)
            task = ready_tasks[0]

            self._queue.remove(task)
            heapq.heapify(self._queue)

            return task

    def _check_dependencies(self, task: Task) -> bool:
        if not task.dependencies:
            return True

        for dep_id in task.dependencies:
            dep_task = self._tasks.get(dep_id)
            if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                return False
        return True

    def remove_completed_tasks(self, older_than: float = 3600) -> int:
        with self._lock:
            current_time = time.time()
            to_remove = []
            for task_id, task in self._tasks.items():
                if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.TIMEOUT]:
                    if current_time - task.completed_at > older_than:
                        to_remove.append(task_id)

            for task_id in to_remove:
                task = self._tasks.pop(task_id)
                if self._on_task_removed:
                    try:
                        self._on_task_removed(task)
                    except Exception as e:
                        logger.error(f'Task removed callback error: {e}')

            if to_remove:
                self._queue = [t for t in self._queue if t.status == TaskStatus.QUEUED]
                heapq.heapify(self._queue)

            return len(to_remove)

    def clear(self) -> None:
        with self._lock:
            for task in list(self._tasks.values()):
                if task.status == TaskStatus.QUEUED:
                    self.cancel_task(task.task_id)
            self._tasks.clear()
            self._queue.clear()
            logger.info('Task queue cleared')

    def size(self) -> int:
        with self._lock:
            return len(self._tasks)

    def queued_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if t.status == TaskStatus.QUEUED)

    def running_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if t.status == TaskStatus.RUNNING)

    def wait_for_task(self, task_id: str, timeout: float = None) -> Optional[Task]:
        start_time = time.time()
        while True:
            task = self.get_task(task_id)
            if not task or task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.TIMEOUT]:
                return task

            if timeout and (time.time() - start_time) > timeout:
                return None

            time.sleep(0.1)


class PriorityQueue(TaskQueue):
    def __init__(self, max_size: int = 1000):
        super().__init__(max_size)

    def get_next_task(self, device_ids: List[str] = None) -> Optional[Task]:
        with self._lock:
            ready_tasks = []
            for task in self._queue:
                if task.status != TaskStatus.QUEUED:
                    continue
                if device_ids and task.device_id not in device_ids:
                    continue
                if not self._check_dependencies(task):
                    continue
                ready_tasks.append(task)

            if not ready_tasks:
                return None

            ready_tasks.sort(key=lambda t: (-t.priority.value, t.scheduled_at))
            task = ready_tasks[0]

            self._queue.remove(task)
            heapq.heapify(self._queue)

            return task
