import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable, Any
from enum import Enum
import concurrent.futures
import threading
import queue
import time
from abc import ABC, abstractmethod


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(Enum):
    """任务类型"""
    ORBIT_PROPAGATION = "orbit_propagation"
    PERTURBATION_CALCULATION = "perturbation"
    DEVIATION_ANALYSIS = "deviation_analysis"
    FITTING = "fitting"
    COUPLING_CALCULATION = "coupling_calculation"


class SchedulingStrategy(Enum):
    """调度策略"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    PRIORITY = "priority"
    LOAD_BALANCED = "load_balanced"


@dataclass
class ComputationTask:
    """计算任务"""
    task_id: str
    task_type: TaskType
    body_name: str
    start_time: float
    end_time: float
    priority: int = 5
    parameters: Dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[Any] = None
    error: Optional[Exception] = None
    worker_id: Optional[int] = None
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    def execute(self, executor: Any) -> Any:
        """执行任务"""
        raise NotImplementedError


@dataclass
class TaskChunk:
    """任务块（拆分后的子任务）"""
    chunk_id: str
    parent_task_id: str
    body_name: str
    start_mjd: float
    end_mjd: float
    parameters: Dict[str, Any]
    result: Optional[Any] = None
    status: TaskStatus = TaskStatus.PENDING
    error: Optional[str] = None


@dataclass
class WorkerStatus:
    """工作节点状态"""
    worker_id: int
    cpu_cores: int
    memory_gb: float
    current_load: float
    active_tasks: int
    total_tasks_completed: int = 0
    total_errors: int = 0


class TaskSplitter:
    """任务拆分器"""
    
    @staticmethod
    def split_by_time(
        task: ComputationTask,
        num_chunks: int,
        overlap: float = 0.0
    ) -> List[TaskChunk]:
        """按时间拆分任务
        
        Args:
            task: 原始任务
            num_chunks: 块数
            overlap: 重叠比例 (0.0-0.5)
            
        Returns:
            任务块列表
        """
        duration = task.end_time - task.start_time
        chunk_duration = duration / num_chunks
        overlap_duration = chunk_duration * overlap
        
        chunks = []
        for i in range(num_chunks):
            chunk_start = task.start_time + i * chunk_duration
            chunk_end = chunk_start + chunk_duration + overlap_duration
            
            if i > 0:
                chunk_start -= overlap_duration
            
            chunk = TaskChunk(
                chunk_id=f"{task.task_id}_chunk_{i}",
                parent_task_id=task.task_id,
                body_name=task.body_name,
                start_mjd=chunk_start,
                end_mjd=min(chunk_end, task.end_time),
                parameters=task.parameters.copy()
            )
            chunks.append(chunk)
        
        return chunks
    
    @staticmethod
    def split_by_body(
        task: ComputationTask,
        body_names: List[str]
    ) -> List[TaskChunk]:
        """按天体拆分任务
        
        Args:
            task: 原始任务
            body_names: 天体名称列表
            
        Returns:
            任务块列表
        """
        chunks = []
        for i, body_name in enumerate(body_names):
            chunk = TaskChunk(
                chunk_id=f"{task.task_id}_body_{i}",
                parent_task_id=task.task_id,
                body_name=body_name,
                start_mjd=task.start_time,
                end_mjd=task.end_time,
                parameters=task.parameters.copy()
            )
            chunks.append(chunk)
        return chunks
    
    @staticmethod
    def split_by_computation(
        task: ComputationTask,
        computation_types: List[str]
    ) -> List[TaskChunk]:
        """按计算类型拆分任务"""
        chunks = []
        for i, comp_type in enumerate(computation_types):
            params = task.parameters.copy()
            params['computation_type'] = comp_type
            chunk = TaskChunk(
                chunk_id=f"{task.task_id}_comp_{i}",
                parent_task_id=task.task_id,
                body_name=task.body_name,
                start_mjd=task.start_time,
                end_mjd=task.end_time,
                parameters=params
            )
            chunks.append(chunk)
        return chunks


class TaskScheduler:
    """任务调度器"""
    
    def __init__(
        self,
        strategy: SchedulingStrategy = SchedulingStrategy.PARALLEL,
        max_workers: int = 4,
        enable_load_balancing: bool = True
    ):
        self.strategy = strategy
        self.max_workers = max_workers
        self.enable_load_balancing = enable_load_balancing
        self.task_queue: 'queue.Queue[ComputationTask] = queue.Queue()
        self.completed_tasks: List[ComputationTask] = []
        self.workers: Dict[int, WorkerStatus] = {}
        self._lock = threading.Lock()
        
        for i in range(max_workers):
            self.workers[i] = WorkerStatus(
                worker_id=i,
                cpu_cores=1,
                memory_gb=4.0,
                current_load=0.0,
                active_tasks=0
            )
    
    def add_task(self, task: ComputationTask):
        """添加任务到队列"""
        self.task_queue.put(task)
    
    def add_tasks(self, tasks: List[ComputationTask]):
        """批量添加任务"""
        for task in tasks:
            self.task_queue.put(task)
    
    def get_next_task(self, worker_id: int) -> Optional[ComputationTask]:
        """获取下一个任务"""
        try:
            return self.task_queue.get_nowait()
        except queue.Empty:
            return None
    
    def complete_task(self, task: ComputationTask):
        """标记任务完成"""
        with self._lock:
            self.completed_tasks.append(task)
            if task.worker_id is not None and task.worker_id in self.workers:
                self.workers[task.worker_id].active_tasks -= 1
                if task.status == TaskStatus.COMPLETED:
                    self.workers[task.worker_id].total_tasks_completed += 1
                else:
                    self.workers[task.worker_id].total_errors += 1
    
    def get_worker_load(self, worker_id: int) -> float:
        """获取工作节点负载"""
        if worker_id not in self.workers:
            return 1.0
        return self.workers[worker_id].current_load
    
    def get_least_loaded_worker(self) -> int:
        """获取负载最低的工作节点"""
        min_load = float('inf')
        best_worker = 0
        for worker_id, status in self.workers.items():
            if status.current_load < min_load:
                min_load = status.current_load
                best_worker = worker_id
        return best_worker
    
    def get_queue_size(self) -> int:
        """获取队列大小"""
        return self.task_queue.qsize()
    
    def get_progress(self) -> float:
        """获取总体进度"""
        total = len(self.completed_tasks) + self.task_queue.qsize()
        if total == 0:
            return 1.0
        return len(self.completed_tasks) / total


class DistributedOrbitExecutor:
    """分布式轨道计算执行器"""
    
    def __init__(
        self,
        max_workers: int = 4,
        scheduler: Optional[TaskScheduler] = None
    ):
        self.max_workers = max_workers
        self.scheduler = scheduler or TaskScheduler(
            max_workers=max_workers
        )
        self.task_splitter = TaskSplitter()
        self.results: Dict[str, Any] = {}
        self.errors: Dict[str, Exception] = {}
        self._shutdown = threading.Event()
    
    def execute_task(self, task: ComputationTask, engine: Any) -> Any:
        """执行单个计算任务"""
        task.status = TaskStatus.RUNNING
        task.started_at = time.time()
        
        try:
            if task.task_type == TaskType.ORBIT_PROPAGATION:
                result = self._execute_propagation(task, engine)
            elif task.task_type == TaskType.PERTURBATION_CALCULATION:
                result = self._execute_perturbation(task, engine)
            elif task.task_type == TaskType.DEVIATION_ANALYSIS:
                result = self._execute_deviation(task, engine)
            elif task.task_type == TaskType.FITTING:
                result = self._execute_fitting(task, engine)
            elif task.task_type == TaskType.COUPLING_CALCULATION:
                result = self._execute_coupling(task, engine)
            else:
                raise ValueError(f"未知任务类型: {task.task_type}")
            
            task.result = result
            task.status = TaskStatus.COMPLETED
            return result
            
        except Exception as e:
            task.error = e
            task.status = TaskStatus.FAILED
            raise e
        finally:
            task.completed_at = time.time()
    
    def execute_parallel(
        self,
        tasks: List[ComputationTask],
        engine: Any,
        timeout: Optional[float] = None
    ) -> Dict[str, Any]:
        """并行执行多个任务"""
        results = {}
        errors = {}
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_task = {}
            for task in tasks:
                future = executor.submit(self.execute_task, task, engine)
                future_to_task[future] = task
            
            for future in concurrent.futures.as_completed(future_to_task, timeout=timeout):
                task = future_to_task[future]
                try:
                    result = future.result()
                    results[task.task_id] = result
                except Exception as e:
                    errors[task.task_id] = e
        
        self.results.update(results)
        self.errors.update(errors)
        
        return results
    
    def execute_distributed(
        self,
        tasks: List[ComputationTask],
        engine: Any,
        num_chunks: Optional[int] = None
    ) -> Dict[str, Any]:
        """分布式执行（任务拆分+并行）"""
        all_results = {}
        
        for task in tasks:
            if num_chunks is None:
                num_chunks = self.max_workers
            
            chunks = self.task_splitter.split_by_time(task, num_chunks)
            chunk_tasks = [
                ComputationTask(
                    task_id=chunk.chunk_id,
                    task_type=task.task_type,
                    body_name=chunk.body_name,
                    start_time=chunk.start_mjd,
                    end_time=chunk.end_mjd,
                    parameters=chunk.parameters
                )
                for chunk in chunks
            ]
            
            chunk_results = self.execute_parallel(chunk_tasks, engine)
            merged_result = self._merge_results(chunk_results, task)
            all_results[task.task_id] = merged_result
        
        return all_results
    
    def execute_priority_batched(
        self,
        tasks: List[ComputationTask],
        engine: Any,
        batch_size: int = 10
    ) -> Dict[str, Any]:
        """按优先级批量执行"""
        sorted_tasks = sorted(tasks, key=lambda t: t.priority, reverse=True)
        all_results = {}
        
        for i in range(0, len(sorted_tasks), batch_size):
            batch = sorted_tasks[i:i + batch_size]
            results = self.execute_parallel(batch, engine)
            all_results.update(results)
        
        return all_results
    
    def _execute_propagation(self, task: ComputationTask, engine: Any) -> Any:
        """执行轨道传播任务"""
        include_perturbations = task.parameters.get('include_perturbations', True)
        return engine.propagate(
            task.body_name,
            task.start_time,
            task.end_time,
            include_perturbations
        )
    
    def _execute_perturbation(self, task: ComputationTask, engine: Any) -> Any:
        """执行摄动计算任务"""
        return engine.compute_orbit_deviation(
            task.body_name,
            task.start_time,
            task.end_time
        )
    
    def _execute_deviation(self, task: ComputationTask, engine: Any) -> Any:
        """执行偏差分析任务"""
        return engine.compute_orbit_deviation(
            task.body_name,
            task.start_time,
            task.end_time
        )
    
    def _execute_fitting(self, task: ComputationTask, engine: Any) -> Any:
        """执行拟合任务"""
        return engine.fit_deviation(
            task.body_name,
            task.parameters.get('data_type', 'position')
        )
    
    def _execute_coupling(self, task: ComputationTask, engine: Any) -> Any:
        """执行耦合计算任务"""
        body_names = task.parameters.get('body_names', [task.body_name])
        return engine.multi_body_simulation(
            body_names,
            task.start_time,
            task.end_time
        )
    
    def _merge_results(
        self,
        chunk_results: Dict[str, Any],
        original_task: ComputationTask
    ) -> Any:
        """合并分块结果"""
        if not chunk_results:
            return None
        
        sorted_keys = sorted(chunk_results.keys())
        first_result = chunk_results[sorted_keys[0]]
        
        if hasattr(first_result, '__class__') and first_result.__class__.__name__ == 'PropagationResult':
            return self._merge_propagation_results(
                [chunk_results[k] for k in sorted_keys]
            )
        elif isinstance(first_result, dict):
            merged = {}
            for key in sorted_keys:
                merged.update(chunk_results[key])
            return merged
        else:
            return [chunk_results[k] for k in sorted_keys]
    
    def _merge_propagation_results(self, results: List[Any]) -> Any:
        """合并传播结果"""
        if not results:
            return None
        
        all_time = np.concatenate([r.time for r in results])
        all_position = np.concatenate([r.position for r in results])
        all_velocity = np.concatenate([r.velocity for r in results])
        
        sort_idx = np.argsort(all_time)
        all_time = all_time[sort_idx]
        all_position = all_position[sort_idx]
        all_velocity = all_velocity[sort_idx]
        
        _, unique_idx = np.unique(all_time, return_index=True)
        
        result = results[0].__class__(
            body_name=results[0].body_name,
            time=all_time[unique_idx],
            position=all_position[unique_idx],
            velocity=all_velocity[unique_idx],
            metadata={
                'merged': True,
                'num_chunks': len(results)
            }
        )
        
        return result
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取执行统计信息"""
        total_completed = len(self.results)
        total_errors = len(self.errors)
        total = total_completed + total_errors
        
        return {
            'total_tasks': total,
            'completed': total_completed,
            'errors': total_errors,
            'success_rate': total_completed / total if total > 0 else 0.0,
            'workers': {
                worker_id: {
                    'completed': status.total_tasks_completed,
                    'errors': status.total_errors,
                    'load': status.current_load
                }
                for worker_id, status in self.scheduler.workers.items()
            }
        }
