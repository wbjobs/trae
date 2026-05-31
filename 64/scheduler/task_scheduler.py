import queue
import threading
import multiprocessing
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
import time
import uuid
from .resource_manager import ResourceManager, AllocatedResources
from core import (
    MeshGenerator, MeshConfig,
    ParameterIterator, IterationConfig,
    ConvergenceChecker, ConvergenceCriteria,
    FluidSolver, SolverConfig
)


class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class TaskStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskConfig:
    mesh_config: Optional[MeshConfig] = None
    iteration_config: Optional[IterationConfig] = None
    solver_config: Optional[SolverConfig] = None
    convergence_criteria: Optional[ConvergenceCriteria] = None
    estimated_iterations: int = 100
    save_interval: int = 10
    enable_checkpointing: bool = True


@dataclass
class Task:
    task_id: str
    name: str
    config: TaskConfig
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error_message: Optional[str] = None
    allocated_resources: Optional[AllocatedResources] = None
    result_path: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "name": self.name,
            "priority": self.priority.value,
            "status": self.status.value,
            "progress": float(self.progress),
            "created_at": float(self.created_at),
            "started_at": float(self.started_at) if self.started_at else None,
            "completed_at": float(self.completed_at) if self.completed_at else None,
            "error_message": self.error_message,
            "result_path": self.result_path,
            "parameters": self.parameters,
            "allocated_resources": self.allocated_resources.to_dict() if self.allocated_resources else None
        }


class TaskScheduler:
    def __init__(self, resource_manager: ResourceManager, max_workers: int = 4):
        self.resource_manager = resource_manager
        self.max_workers = max_workers
        self._task_queue: "queue.PriorityQueue[Tuple[int, int, Task]]" = queue.PriorityQueue()
        self._tasks: Dict[str, Task] = {}
        self._active_tasks: Dict[str, threading.Thread] = {}
        self._lock = threading.RLock()
        self._shutdown = False
        self._scheduler_thread: Optional[threading.Thread] = None
        self._task_counter = 0
        self._task_original_order: Dict[str, int] = {}

    def submit_task(self, name: str, config: TaskConfig,
                    priority: TaskPriority = TaskPriority.NORMAL,
                    parameters: Optional[Dict] = None) -> str:
        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            name=name,
            config=config,
            priority=priority,
            parameters=parameters or {}
        )
        with self._lock:
            self._tasks[task_id] = task
            self._task_counter += 1
            self._task_original_order[task_id] = self._task_counter
            queue_priority = (-priority.value, self._task_counter)
            self._task_queue.put((*queue_priority, task))
            task.status = TaskStatus.QUEUED
        return task_id

    def _scheduler_loop(self):
        while not self._shutdown:
            try:
                with self._lock:
                    active_count = len(self._active_tasks)
                if active_count >= self.max_workers:
                    time.sleep(0.1)
                    continue

                try:
                    queue_item = self._task_queue.get(timeout=0.5)
                    priority_val, order_val, task = queue_item
                except queue.Empty:
                    time.sleep(0.1)
                    continue

                should_requeue = False
                with self._lock:
                    if task.task_id not in self._tasks:
                        self._task_queue.task_done()
                        continue
                    if task.status == TaskStatus.CANCELLED:
                        self._task_queue.task_done()
                        continue
                    if task.status != TaskStatus.QUEUED:
                        self._task_queue.task_done()
                        continue

                estimated_cores, estimated_memory = self.resource_manager.estimate_task_resources(
                    mesh_size=10000,
                    num_iterations=task.config.estimated_iterations
                )

                allocation = self.resource_manager.request_optimal_allocation(
                    task_id=task.task_id,
                    min_cores=1,
                    max_cores=4,
                    min_memory_gb=0.5,
                    max_memory_gb=4.0,
                    priority=task.priority.value
                )

                if allocation is None:
                    should_requeue = True
                else:
                    with self._lock:
                        task.allocated_resources = allocation
                        task.status = TaskStatus.RUNNING
                        task.started_at = time.time()

                    thread = threading.Thread(
                        target=self._execute_task,
                        args=(task,),
                        daemon=True
                    )
                    with self._lock:
                        self._active_tasks[task.task_id] = thread

                if should_requeue:
                    original_order = self._task_original_order.get(task.task_id, order_val)
                    self._task_queue.put((priority_val, original_order, task))
                    self._task_queue.task_done()
                    time.sleep(0.5)
                else:
                    self._task_queue.task_done()
                    thread.start()

            except Exception as e:
                print(f"Scheduler error: {e}")
                time.sleep(0.5)

    def _execute_task(self, task: Task):
        try:
            result = self._run_simulation(task)
            with self._lock:
                if task.task_id in self._tasks:
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = time.time()
                    task.progress = 1.0
                    task.result_path = result
        except Exception as e:
            with self._lock:
                if task.task_id in self._tasks:
                    task.status = TaskStatus.FAILED
                    task.error_message = str(e)
                    task.completed_at = time.time()
        finally:
            try:
                with self._lock:
                    if task.task_id in self._active_tasks:
                        del self._active_tasks[task.task_id]
            except Exception:
                pass
            try:
                self.resource_manager.release_resources(task.task_id)
            except Exception:
                pass

    def _run_simulation(self, task: Task) -> str:
        mesh_gen = MeshGenerator(task.config.mesh_config or MeshConfig())
        mesh = mesh_gen.generate_structured_mesh()

        solver = FluidSolver(mesh, task.config.solver_config or SolverConfig())
        solver.initialize_state()

        param_iterator = ParameterIterator(task.config.iteration_config or IterationConfig())
        param_iterator.start_iteration()

        convergence = ConvergenceChecker(task.config.convergence_criteria or ConvergenceCriteria())

        from storage import ResultStorage
        storage = ResultStorage()
        storage.initialize_task(task.task_id, task.name, task.parameters)

        dummy_param = type('obj', (object,), {'param_id': 'default'})()
        check_interval = max(1, task.config.estimated_iterations // 100)

        for iteration in range(task.config.estimated_iterations):
            if self._shutdown:
                raise RuntimeError("Task cancelled due to scheduler shutdown")

            if iteration % check_interval == 0:
                with self._lock:
                    if task.status == TaskStatus.CANCELLED:
                        raise RuntimeError("Task cancelled by user")

            try:
                residual = solver.solve_step()
            except Exception as e:
                raise RuntimeError(f"Solver error at iteration {iteration}: {str(e)}")

            try:
                param_iterator.record_iteration(dummy_param, residual.mass_residual)
                status = convergence.check_convergence(residual)
            except Exception:
                status = type('obj', (object,), {'value': 'not_converged'})()

            if iteration % check_interval == 0:
                with self._lock:
                    task.progress = (iteration + 1) / task.config.estimated_iterations

            if iteration % task.config.save_interval == 0:
                try:
                    storage.save_snapshot(task.task_id, iteration, solver.state, residual)
                except Exception:
                    pass

            if status.value == "converged":
                break

            if not param_iterator.should_continue(residual.mass_residual):
                break

        try:
            storage.finalize_task(task.task_id, solver.get_state_dict(), convergence.get_convergence_metrics())
        except Exception:
            pass
        return storage.get_task_path(task.task_id)

    def start(self):
        if self._scheduler_thread is None or not self._scheduler_thread.is_alive():
            self._shutdown = False
            self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
            self._scheduler_thread.start()

    def stop(self, wait_for_tasks: bool = True):
        self._shutdown = True
        if wait_for_tasks:
            with self._lock:
                active_task_ids = list(self._active_tasks.keys())
            for task_id in active_task_ids:
                self.cancel_task(task_id)
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5.0)

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            task = self._tasks[task_id]
            if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                return False
            task.status = TaskStatus.CANCELLED
            task.completed_at = time.time()
        return True

    def get_task_status(self, task_id: str) -> Optional[Task]:
        with self._lock:
            return self._tasks.get(task_id)

    def get_all_tasks(self) -> List[Task]:
        with self._lock:
            return list(self._tasks.values())

    def get_queue_size(self) -> int:
        return self._task_queue.qsize()

    def get_active_count(self) -> int:
        with self._lock:
            return len(self._active_tasks)

    def get_scheduler_stats(self) -> Dict:
        with self._lock:
            tasks = list(self._tasks.values())
        return {
            "total_tasks": len(tasks),
            "pending": sum(1 for t in tasks if t.status == TaskStatus.PENDING),
            "queued": sum(1 for t in tasks if t.status == TaskStatus.QUEUED),
            "running": sum(1 for t in tasks if t.status == TaskStatus.RUNNING),
            "completed": sum(1 for t in tasks if t.status == TaskStatus.COMPLETED),
            "failed": sum(1 for t in tasks if t.status == TaskStatus.FAILED),
            "cancelled": sum(1 for t in tasks if t.status == TaskStatus.CANCELLED),
            "queue_size": self.get_queue_size(),
            "max_workers": self.max_workers
        }
