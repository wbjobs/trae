import os
import time
import logging
import threading
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from queue import Queue, PriorityQueue, Empty
from concurrent.futures import ThreadPoolExecutor, as_completed
from enum import Enum

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class TaskPriority(Enum):
    HIGH = 0
    NORMAL = 1
    LOW = 2


@dataclass
class ParseTask:
    task_id: str
    file_path: str
    task_type: str = "parse"
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    params: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    callback: Optional[Callable] = None
    retry_count: int = 0
    max_retries: int = 3

    def __lt__(self, other):
        if isinstance(other, ParseTask):
            return self.priority.value < other.priority.value
        return NotImplemented


@dataclass
class BatchStats:
    total_tasks: int = 0
    pending_tasks: int = 0
    processing_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    cancelled_tasks: int = 0
    total_processing_time: float = 0.0
    avg_processing_time: float = 0.0
    throughput: float = 0.0


class BatchProcessor:
    def __init__(
        self,
        process_func: Callable,
        max_workers: int = 4,
        queue_size: int = 1000,
        use_priority: bool = True,
    ):
        self.process_func = process_func
        self.max_workers = max_workers
        self.use_priority = use_priority

        if use_priority:
            self._queue: PriorityQueue = PriorityQueue(maxsize=queue_size)
        else:
            self._queue: Queue = Queue(maxsize=queue_size)

        self._tasks: Dict[str, ParseTask] = {}
        self._results: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._executor: Optional[ThreadPoolExecutor] = None
        self._stats = BatchStats()

    def start(self) -> None:
        if self._running:
            logger.warning("Batch processor already running")
            return

        self._running = True
        self._executor = ThreadPoolExecutor(max_workers=self.max_workers)
        self._worker_thread = threading.Thread(target=self._process_loop, daemon=True)
        self._worker_thread.start()
        logger.info(f"Batch processor started with {self.max_workers} workers")

    def stop(self, wait: bool = True) -> None:
        if not self._running:
            return

        self._running = False

        if wait and self._executor:
            self._executor.shutdown(wait=True)

        if self._worker_thread:
            self._worker_thread.join(timeout=5)

        logger.info("Batch processor stopped")

    def submit_task(
        self,
        file_path: str,
        task_type: str = "parse",
        priority: TaskPriority = TaskPriority.NORMAL,
        params: Optional[Dict[str, Any]] = None,
        callback: Optional[Callable] = None,
    ) -> str:
        task_id = f"task_{int(time.time() * 1000)}_{os.urandom(4).hex()}"

        task = ParseTask(
            task_id=task_id,
            file_path=file_path,
            task_type=task_type,
            priority=priority,
            params=params or {},
            callback=callback,
        )

        with self._lock:
            self._tasks[task_id] = task
            self._stats.total_tasks += 1
            self._stats.pending_tasks += 1

        try:
            self._queue.put_nowait(task)
            logger.debug(f"Task {task_id} submitted for {file_path}")
        except Exception as e:
            with self._lock:
                self._tasks[task_id].status = TaskStatus.FAILED
                self._tasks[task_id].error = str(e)
                self._stats.pending_tasks -= 1
                self._stats.failed_tasks += 1
            logger.error(f"Failed to submit task {task_id}: {e}")

        return task_id

    def submit_batch(
        self,
        file_paths: List[str],
        task_type: str = "parse",
        priority: TaskPriority = TaskPriority.NORMAL,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        task_ids = []
        for file_path in file_paths:
            task_id = self.submit_task(file_path, task_type, priority, params)
            task_ids.append(task_id)
        return task_ids

    def get_task_status(self, task_id: str) -> Optional[ParseTask]:
        with self._lock:
            return self._tasks.get(task_id)

    def get_result(self, task_id: str) -> Optional[Any]:
        with self._lock:
            task = self._tasks.get(task_id)
            if task and task.status == TaskStatus.COMPLETED:
                return task.result
        return None

    def wait_for_task(self, task_id: str, timeout: Optional[float] = None) -> Optional[Any]:
        start_time = time.time()
        while True:
            if timeout and (time.time() - start_time) > timeout:
                return None

            with self._lock:
                task = self._tasks.get(task_id)
                if task and task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                    return task.result if task.status == TaskStatus.COMPLETED else None

            time.sleep(0.1)

    def wait_for_all(self, timeout: Optional[float] = None) -> List[Any]:
        start_time = time.time()
        results = []

        while True:
            if timeout and (time.time() - start_time) > timeout:
                break

            with self._lock:
                if self._stats.pending_tasks == 0 and self._stats.processing_tasks == 0:
                    break

            time.sleep(0.1)

        with self._lock:
            for task in self._tasks.values():
                if task.status == TaskStatus.COMPLETED:
                    results.append(task.result)

        return results

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task and task.status == TaskStatus.PENDING:
                task.status = TaskStatus.CANCELLED
                self._stats.pending_tasks -= 1
                self._stats.cancelled_tasks += 1
                logger.info(f"Task {task_id} cancelled")
                return True
        return False

    def get_stats(self) -> BatchStats:
        with self._lock:
            return self._stats

    def _process_loop(self) -> None:
        while self._running:
            try:
                if self.use_priority:
                    task = self._queue.get(timeout=1)
                else:
                    task = self._queue.get(timeout=1)

                if not isinstance(task, ParseTask):
                    continue

                with self._lock:
                    if task.status != TaskStatus.PENDING:
                        continue
                    task.status = TaskStatus.PROCESSING
                    task.started_at = time.time()
                    self._stats.pending_tasks -= 1
                    self._stats.processing_tasks += 1

                if self._executor:
                    future = self._executor.submit(self._execute_task, task)
                    future.add_done_callback(lambda f, t=task: self._on_task_complete(t, f))

            except Empty:
                continue
            except Exception as e:
                logger.error(f"Process loop error: {e}")

    def _execute_task(self, task: ParseTask) -> Any:
        logger.debug(f"Executing task {task.task_id} for {task.file_path}")
        try:
            result = self.process_func(task.file_path, **task.params)
            return result
        except Exception as e:
            logger.error(f"Task {task.task_id} failed: {e}")
            raise

    def _on_task_complete(self, task: ParseTask, future) -> None:
        try:
            result = future.result()
            with self._lock:
                task.status = TaskStatus.COMPLETED
                task.result = result
                task.completed_at = time.time()
                processing_time = task.completed_at - (task.started_at or time.time())
                self._stats.total_processing_time += processing_time
                self._stats.completed_tasks += 1
                self._stats.processing_tasks -= 1

                completed = self._stats.completed_tasks
                if completed > 0:
                    self._stats.avg_processing_time = self._stats.total_processing_time / completed
                    elapsed = time.time() - task.created_at
                    self._stats.throughput = completed / max(elapsed, 0.001)

                self._results[task.task_id] = result

            if task.callback:
                try:
                    task.callback(result, None)
                except Exception as e:
                    logger.error(f"Callback error for task {task.task_id}: {e}")

            logger.debug(f"Task {task.task_id} completed successfully")

        except Exception as e:
            with self._lock:
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.status = TaskStatus.PENDING
                    logger.warning(f"Task {task.task_id} failed, retrying ({task.retry_count}/{task.max_retries})")
                    try:
                        self._queue.put_nowait(task)
                        self._stats.processing_tasks -= 1
                        self._stats.pending_tasks += 1
                        return
                    except Exception as queue_error:
                        logger.error(f"Failed to requeue task {task.task_id}: {queue_error}")

                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = time.time()
                self._stats.failed_tasks += 1
                self._stats.processing_tasks -= 1

            if task.callback:
                try:
                    task.callback(None, str(e))
                except Exception as callback_error:
                    logger.error(f"Callback error for task {task.task_id}: {callback_error}")

            logger.error(f"Task {task.task_id} failed permanently: {e}")

    def get_completed_results(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._results)

    def get_failed_tasks(self) -> List[ParseTask]:
        with self._lock:
            return [t for t in self._tasks.values() if t.status == TaskStatus.FAILED]

    def clear_completed(self) -> None:
        with self._lock:
            completed_ids = [
                tid for tid, t in self._tasks.items()
                if t.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]
            ]
            for tid in completed_ids:
                del self._tasks[tid]
                if tid in self._results:
                    del self._results[tid]

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
