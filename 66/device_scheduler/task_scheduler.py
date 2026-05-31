import uuid
import time
import threading
from typing import Dict, Any, Optional, List, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
import logging

from .task_queue import TaskQueue, PriorityQueue, Task, TaskStatus, TaskPriority

logger = logging.getLogger(__name__)


class SchedulingStrategy(Enum):
    FIFO = 'fifo'
    PRIORITY = 'priority'
    ROUND_ROBIN = 'round_robin'
    DEVICE_PARALLEL = 'device_parallel'


@dataclass
class WorkerState:
    worker_id: str
    device_id: str
    current_task: Optional[Task] = None
    is_running: bool = True
    task_count: int = 0


class TaskScheduler:
    def __init__(self, device_manager=None, strategy: SchedulingStrategy = SchedulingStrategy.PRIORITY):
        self._device_manager = device_manager
        self._strategy = strategy
        self._queue = PriorityQueue(max_size=1000)
        self._workers: Dict[str, WorkerState] = {}
        self._worker_threads: Dict[str, threading.Thread] = {}
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._is_running = False
        self._device_busy: Set[str] = set()
        self._on_task_completed: Optional[Callable[[Task], None]] = None
        self._on_task_failed: Optional[Callable[[Task], None]] = None

        self._queue.set_on_task_status_changed(self._on_task_status)

    @property
    def queue(self) -> TaskQueue:
        return self._queue

    def set_device_manager(self, device_manager) -> None:
        self._device_manager = device_manager

    def set_strategy(self, strategy: SchedulingStrategy) -> None:
        self._strategy = strategy
        logger.info(f'Scheduling strategy changed to: {strategy.value}')

    def set_on_task_completed(self, callback: Callable[[Task], None]) -> None:
        self._on_task_completed = callback

    def set_on_task_failed(self, callback: Callable[[Task], None]) -> None:
        self._on_task_failed = callback

    def start(self) -> None:
        if self._is_running:
            return

        self._stop_event.clear()
        self._is_running = True
        self._start_workers()
        logger.info('Task scheduler started')

    def stop(self) -> None:
        self._stop_event.set()
        self._is_running = False

        for worker_id, thread in self._worker_threads.items():
            if thread.is_alive():
                thread.join(timeout=2.0)

        self._worker_threads.clear()
        self._workers.clear()
        logger.info('Task scheduler stopped')

    def _start_workers(self) -> None:
        if not self._device_manager:
            return

        for device in self._device_manager.get_all_devices():
            self._add_worker(device.device_id)

    def _add_worker(self, device_id: str) -> None:
        with self._lock:
            if device_id in self._workers:
                return

            worker = WorkerState(
                worker_id=f'worker_{device_id}',
                device_id=device_id
            )
            self._workers[device_id] = worker

            thread = threading.Thread(
                target=self._worker_loop,
                args=(device_id,),
                daemon=True,
                name=f'Worker-{device_id}'
            )
            self._worker_threads[device_id] = thread
            thread.start()

            logger.info(f'Worker added for device: {device_id}')

    def _remove_worker(self, device_id: str) -> None:
        with self._lock:
            if device_id in self._workers:
                self._workers[device_id].is_running = False

            if device_id in self._worker_threads:
                thread = self._worker_threads[device_id]
                if thread.is_alive():
                    thread.join(timeout=1.0)
                del self._worker_threads[device_id]

            if device_id in self._workers:
                del self._workers[device_id]

            if device_id in self._device_busy:
                self._device_busy.discard(device_id)

            logger.info(f'Worker removed for device: {device_id}')

    def submit_task(self, name: str, device_id: str, command: str,
                    params: Dict[str, Any] = None,
                    priority: TaskPriority = TaskPriority.NORMAL,
                    timeout: float = 10.0,
                    max_retries: int = 0,
                    dependencies: List[str] = None,
                    callback: Callable[[Dict[str, Any]], None] = None) -> str:
        task = Task(
            task_id=str(uuid.uuid4()),
            name=name,
            device_id=device_id,
            command=command,
            params=params or {},
            priority=priority,
            timeout=timeout,
            max_retries=max_retries,
            dependencies=dependencies or [],
            callback=callback
        )

        if self._queue.add_task(task):
            return task.task_id
        return ''

    def submit_command_tasks(self, command_steps: List[Dict[str, Any]],
                             priority: TaskPriority = TaskPriority.NORMAL) -> List[str]:
        task_ids = []
        prev_task_id = None

        for i, step in enumerate(command_steps):
            dependencies = [prev_task_id] if prev_task_id else []
            task_id = self.submit_task(
                name=step.get('name', f'Step {i + 1}'),
                device_id=step['device_id'],
                command=step['command'],
                params=step.get('params', {}),
                priority=priority,
                timeout=step.get('timeout', 10.0),
                max_retries=step.get('retry_count', 0),
                dependencies=dependencies
            )
            if task_id:
                task_ids.append(task_id)
                prev_task_id = task_id

        return task_ids

    def cancel_task(self, task_id: str) -> bool:
        return self._queue.cancel_task(task_id)

    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        task = self._queue.get_task(task_id)
        return task.status if task else None

    def wait_for_task(self, task_id: str, timeout: float = None) -> Optional[Task]:
        return self._queue.wait_for_task(task_id, timeout)

    def get_statistics(self) -> Dict[str, Any]:
        with self._lock:
            total_tasks = self._queue.size()
            queued = self._queue.queued_count()
            running = self._queue.running_count()
            completed = sum(1 for t in self._queue.get_all_tasks()
                            if t.status == TaskStatus.COMPLETED)
            failed = sum(1 for t in self._queue.get_all_tasks()
                         if t.status in [TaskStatus.FAILED, TaskStatus.TIMEOUT, TaskStatus.CANCELLED])

            worker_stats = {}
            for device_id, worker in self._workers.items():
                worker_stats[device_id] = {
                    'current_task': worker.current_task.task_id if worker.current_task else None,
                    'task_count': worker.task_count,
                    'is_busy': device_id in self._device_busy
                }

            return {
                'total_tasks': total_tasks,
                'queued': queued,
                'running': running,
                'completed': completed,
                'failed': failed,
                'workers': worker_stats,
                'strategy': self._strategy.value
            }

    def _worker_loop(self, device_id: str) -> None:
        logger.info(f'Worker started for device: {device_id}')

        while not self._stop_event.is_set():
            try:
                worker = self._workers.get(device_id)
                if not worker or not worker.is_running:
                    break

                task = self._get_next_task_for_device(device_id)
                if not task:
                    time.sleep(0.1)
                    continue

                self._execute_task(device_id, task)

            except Exception as e:
                logger.error(f'Worker loop error for {device_id}: {e}')
                time.sleep(0.5)

        logger.info(f'Worker stopped for device: {device_id}')

    def _get_next_task_for_device(self, device_id: str) -> Optional[Task]:
        with self._lock:
            if device_id in self._device_busy:
                return None

            if self._strategy == SchedulingStrategy.ROUND_ROBIN:
                return self._queue.get_next_task([device_id])
            else:
                return self._queue.get_next_task([device_id])

    def _execute_task(self, device_id: str, task: Task) -> None:
        with self._lock:
            self._device_busy.add(device_id)
            worker = self._workers.get(device_id)
            if worker:
                worker.current_task = task

        self._queue.update_task_status(task.task_id, TaskStatus.RUNNING)
        logger.info(f'Executing task: {task.task_id} - {task.name}')

        success = False
        error_message = ''
        start_time = time.time()

        try:
            if self._device_manager:
                success = self._device_manager.send_command(
                    task.device_id,
                    task.command,
                    task.params
                )
                if not success:
                    error_message = 'Command execution failed'
            else:
                error_message = 'Device manager not available'
        except Exception as e:
            error_message = str(e)
            logger.error(f'Task execution error: {e}')

        execution_time = time.time() - start_time

        if success:
            task.result = {'execution_time': execution_time}
            self._queue.update_task_status(task.task_id, TaskStatus.COMPLETED)
            logger.info(f'Task completed: {task.task_id} in {execution_time:.2f}s')

            if task.callback:
                try:
                    task.callback(task.to_dict())
                except Exception as e:
                    logger.error(f'Task callback error: {e}')

            if self._on_task_completed:
                try:
                    self._on_task_completed(task)
                except Exception as e:
                    logger.error(f'Task completed callback error: {e}')
        else:
            if task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = TaskStatus.QUEUED
                task.scheduled_at = time.time()
                with self._lock:
                    import heapq
                    heapq.heappush(self._queue._queue, task)
                logger.info(f'Task retry scheduled: {task.task_id} ({task.retry_count}/{task.max_retries})')
            else:
                self._queue.update_task_status(task.task_id, TaskStatus.FAILED, error_message)
                logger.warning(f'Task failed: {task.task_id} - {error_message}')

                if self._on_task_failed:
                    try:
                        self._on_task_failed(task)
                    except Exception as e:
                        logger.error(f'Task failed callback error: {e}')

        with self._lock:
            self._device_busy.discard(device_id)
            worker = self._workers.get(device_id)
            if worker:
                worker.current_task = None
                worker.task_count += 1

    def _on_task_status(self, task: Task, old_status: TaskStatus) -> None:
        pass

    def on_device_added(self, device_id: str) -> None:
        self._add_worker(device_id)

    def on_device_removed(self, device_id: str) -> None:
        self._remove_worker(device_id)
