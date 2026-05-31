import os
import time
import threading
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass, field

from .task import Task, Job, TaskStatus, TaskType, generate_task_id, save_job_state
from .rpc import WorkerClient
from .shuffle import shuffle_map_output, collect_reduce_outputs
from .skew_handler import process_data_skew, merge_skewed_results, create_split_plans, SKEW_THRESHOLD


HEARTBEAT_INTERVAL = 5
WORKER_TIMEOUT = 15


@dataclass
class WorkerInfo:
    host: str
    port: int
    client: WorkerClient
    available: bool = True
    last_heartbeat: float = field(default_factory=time.time)
    blacklisted: bool = False
    blacklist_reason: Optional[str] = None
    consecutive_failures: int = 0

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


class RoundRobinScheduler:
    def __init__(self, workers: List[Tuple[str, int]], state_dir: str):
        self.workers: List[WorkerInfo] = []
        self._worker_index = 0
        self._lock = threading.Lock()
        self.state_dir = state_dir
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._stop_heartbeat = threading.Event()
        self._task_worker_map: Dict[str, WorkerInfo] = {}

        for host, port in workers:
            client = WorkerClient(host, port)
            self.workers.append(WorkerInfo(host=host, port=port, client=client))

        self._start_heartbeat_monitor()

    def _start_heartbeat_monitor(self) -> None:
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

    def _heartbeat_loop(self) -> None:
        while not self._stop_heartbeat.is_set():
            try:
                self._check_all_heartbeats()
            except Exception as e:
                print(f"Heartbeat monitor error: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

    def _check_all_heartbeats(self) -> None:
        with self._lock:
            for worker in self.workers:
                if worker.blacklisted:
                    continue

                try:
                    is_alive = worker.client.ping()
                    if is_alive:
                        worker.last_heartbeat = time.time()
                        worker.available = True
                        worker.consecutive_failures = 0
                    else:
                        worker.consecutive_failures += 1
                        if worker.consecutive_failures >= 3:
                            worker.available = False
                except Exception:
                    worker.consecutive_failures += 1
                    if worker.consecutive_failures >= 3:
                        worker.available = False

                if not worker.available and not worker.blacklisted:
                    self._blacklist_worker(worker, "Heartbeat failed")

    def _blacklist_worker(self, worker: WorkerInfo, reason: str) -> None:
        worker.blacklisted = True
        worker.blacklist_reason = reason
        worker.available = False
        print(f"Worker {worker.address} blacklisted: {reason}")

    def unblacklist_worker(self, worker_address: str) -> bool:
        with self._lock:
            for worker in self.workers:
                if worker.address == worker_address and worker.blacklisted:
                    try:
                        if worker.client.ping():
                            worker.blacklisted = False
                            worker.blacklist_reason = None
                            worker.consecutive_failures = 0
                            worker.available = True
                            worker.last_heartbeat = time.time()
                            print(f"Worker {worker_address} removed from blacklist")
                            return True
                    except Exception:
                        pass
        return False

    def get_next_worker(self, exclude_workers: Optional[Set[str]] = None) -> Optional[WorkerInfo]:
        with self._lock:
            available_workers = [
                w for w in self.workers
                if w.available and not w.blacklisted
                and (exclude_workers is None or w.address not in exclude_workers)
            ]
            if not available_workers:
                return None

            worker = available_workers[self._worker_index % len(available_workers)]
            self._worker_index += 1
            return worker

    def assign_task_to_worker(self, task_id: str, worker: WorkerInfo) -> None:
        with self._lock:
            self._task_worker_map[task_id] = worker

    def unassign_task(self, task_id: str) -> None:
        with self._lock:
            self._task_worker_map.pop(task_id, None)

    def get_worker_for_task(self, task_id: str) -> Optional[WorkerInfo]:
        with self._lock:
            return self._task_worker_map.get(task_id)

    def get_blacklisted_workers(self) -> List[WorkerInfo]:
        return [w for w in self.workers if w.blacklisted]

    def get_available_workers(self) -> List[WorkerInfo]:
        return [w for w in self.workers if w.available and not w.blacklisted]

    def check_worker_health(self) -> List[WorkerInfo]:
        healthy = []
        with self._lock:
            for worker in self.workers:
                if worker.blacklisted:
                    continue
                try:
                    if worker.client.ping():
                        worker.available = True
                        worker.last_heartbeat = time.time()
                        worker.consecutive_failures = 0
                        healthy.append(worker)
                    else:
                        worker.available = False
                except Exception:
                    worker.available = False
        return healthy

    def stop(self) -> None:
        self._stop_heartbeat.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)


class JobExecutor:
    def __init__(self, scheduler: RoundRobinScheduler, base_dir: str, state_dir: str,
                 skew_threshold: float = SKEW_THRESHOLD):
        self.scheduler = scheduler
        self.base_dir = base_dir
        self.state_dir = state_dir
        self.skew_threshold = skew_threshold
        self._running_tasks: Dict[str, threading.Event] = {}
        self._task_lock = threading.Lock()
        self._skew_report = None
        self._skew_detected = False
        self._split_plans = None

    def execute_job(self, job: Job) -> None:
        job.status = TaskStatus.RUNNING
        job.started_at = time.time()
        job.add_log(f"Job {job.id} started")
        save_job_state(job, self.state_dir)

        monitor_thread = threading.Thread(target=self._monitor_failed_workers, args=(job,), daemon=True)
        monitor_thread.start()

        try:
            self._execute_map_phase(job)
            if job.status == TaskStatus.FAILED:
                return

            self._execute_shuffle(job)
            if job.status == TaskStatus.FAILED:
                return

            self._execute_reduce_phase(job)
            if job.status == TaskStatus.FAILED:
                return

            self._collect_results(job)

            job.status = TaskStatus.COMPLETED
            job.completed_at = time.time()
            job.add_log(f"Job {job.id} completed successfully")
        except Exception as e:
            job.status = TaskStatus.FAILED
            job.completed_at = time.time()
            job.add_log(f"Job {job.id} failed: {str(e)}")
        finally:
            save_job_state(job, self.state_dir)

    def _monitor_failed_workers(self, job: Job) -> None:
        while job.status in [TaskStatus.RUNNING, TaskStatus.PENDING]:
            try:
                self._check_and_reassign_tasks(job)
            except Exception as e:
                print(f"Monitor error: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

    def _check_and_reassign_tasks(self, job: Job) -> None:
        all_tasks = job.map_tasks + job.reduce_tasks

        for task in all_tasks:
            if task.status not in [TaskStatus.RUNNING, TaskStatus.RETRYING]:
                continue

            if not task.worker:
                continue

            worker = self._get_worker_by_address(task.worker)
            if not worker:
                continue

            if worker.blacklisted or not worker.available:
                self._reassign_task(job, task, worker)

    def _get_worker_by_address(self, address: str) -> Optional[WorkerInfo]:
        for worker in self.scheduler.workers:
            if worker.address == address:
                return worker
        return None

    def _reassign_task(self, job: Job, task: Task, failed_worker: WorkerInfo) -> None:
        with self._task_lock:
            if task.status == TaskStatus.COMPLETED or task.status == TaskStatus.FAILED:
                return

            job.add_log(
                f"Worker {failed_worker.address} failed, reassigning {task.type.value} task {task.id} "
                f"(attempt {task.attempt}/{task.max_attempts})"
            )

            self.scheduler.unassign_task(task.id)

            stop_event = self._running_tasks.get(task.id)
            if stop_event:
                stop_event.set()

            task.status = TaskStatus.PENDING
            task.worker = None
            task.error = f"Worker {failed_worker.address} failed"

            save_job_state(job, self.state_dir)

            reassign_thread = threading.Thread(
                target=self._execute_task_with_retry,
                args=(job, task, {failed_worker.address})
            )
            reassign_thread.daemon = True
            reassign_thread.start()

    def _execute_map_phase(self, job: Job) -> None:
        job.add_log("Starting Map phase")

        threads = []
        for task in job.map_tasks:
            t = threading.Thread(target=self._execute_task_with_retry, args=(job, task))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        while True:
            running_tasks = [t for t in job.map_tasks if t.status in [TaskStatus.RUNNING, TaskStatus.RETRYING, TaskStatus.PENDING]]
            if not running_tasks:
                break
            time.sleep(1)

        failed_tasks = [t for t in job.map_tasks if t.status == TaskStatus.FAILED]
        if failed_tasks:
            job.status = TaskStatus.FAILED
            job.add_log(f"Map phase failed: {len(failed_tasks)} tasks failed after max retries")
            return

        job.add_log("Map phase completed")

    def _execute_shuffle(self, job: Job) -> None:
        job.add_log("Starting Shuffle phase")

        map_output_dir = os.path.join(self.base_dir, job.id, "map_output")
        reduce_input_dir = os.path.join(self.base_dir, job.id, "reduce_input")
        reduce_output_dir = os.path.join(self.base_dir, job.id, "reduce_output")
        final_output_path = os.path.join(job.config.output_dir, "part-00000")

        shuffle_map_output(map_output_dir, job.config.num_reducers, reduce_input_dir)

        job.add_log("Shuffle phase completed")

        job.add_log("Checking for data skew...")
        self._skew_report, self._skew_detected = process_data_skew(
            job.id,
            reduce_input_dir,
            reduce_output_dir,
            final_output_path,
            job.config.num_reducers,
            self.skew_threshold,
        )

        if self._skew_detected and self._skew_report:
            job.add_log(
                f"Data skew detected! {len(self._skew_report.skewed_keys)} skewed keys, "
                f"avg values per key: {self._skew_report.avg_values_per_key:.2f}"
            )
            for skew_info in self._skew_report.skewed_keys:
                job.add_log(
                    f"  Skewed key: {skew_info['key']}, "
                    f"count: {skew_info['value_count']}, "
                    f"ratio: {skew_info['ratio']:.2f}x"
                )

            self._split_plans = create_split_plans(self._skew_report)
            for key, plan in self._split_plans.items():
                job.add_log(
                    f"  Splitting key '{key}' into {plan.split_factor} partitions "
                    f"(value count: {plan.value_count})"
                )
        else:
            job.add_log("No significant data skew detected")

    def _execute_reduce_phase(self, job: Job) -> None:
        job.add_log("Starting Reduce phase")

        threads = []
        for task in job.reduce_tasks:
            t = threading.Thread(target=self._execute_task_with_retry, args=(job, task))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        while True:
            running_tasks = [t for t in job.reduce_tasks if t.status in [TaskStatus.RUNNING, TaskStatus.RETRYING, TaskStatus.PENDING]]
            if not running_tasks:
                break
            time.sleep(1)

        failed_tasks = [t for t in job.reduce_tasks if t.status == TaskStatus.FAILED]
        if failed_tasks:
            job.status = TaskStatus.FAILED
            job.add_log(f"Reduce phase failed: {len(failed_tasks)} tasks failed after max retries")
            return

        job.add_log("Reduce phase completed")

    def _collect_results(self, job: Job) -> None:
        job.add_log("Collecting results")

        reduce_output_dir = os.path.join(self.base_dir, job.id, "reduce_output")
        final_output_path = os.path.join(job.config.output_dir, "part-00000")

        if self._skew_detected and self._split_plans:
            job.add_log("Merging skewed key results...")
            merge_ops = merge_skewed_results(
                reduce_output_dir,
                final_output_path,
                self._split_plans,
            )
            if self._skew_report:
                self._skew_report.merge_operations = merge_ops

            for op in merge_ops:
                job.add_log(
                    f"  Merged key '{op['key']}' from {op['merged_from']} parts: {op['result']}"
                )
        else:
            collect_reduce_outputs(reduce_output_dir, final_output_path)

        if self._skew_report:
            skew_report_path = os.path.join(job.config.output_dir, "skew_report.yaml")
            self._skew_report.save(skew_report_path)
            job.add_log(f"Skew report saved to {skew_report_path}")

        job.add_log(f"Results collected to {final_output_path}")

    def _execute_task_with_retry(self, job: Job, task: Task, exclude_workers: Optional[Set[str]] = None) -> None:
        if exclude_workers is None:
            exclude_workers = set()

        stop_event = threading.Event()
        with self._task_lock:
            self._running_tasks[task.id] = stop_event

        try:
            while task.attempt < task.max_attempts:
                if stop_event.is_set():
                    return

                task.attempt += 1
                task.status = TaskStatus.RUNNING if task.attempt == 1 else TaskStatus.RETRYING
                task.started_at = time.time()

                worker = self.scheduler.get_next_worker(exclude_workers)
                if not worker:
                    available = self.scheduler.get_available_workers()
                    if not available:
                        task.status = TaskStatus.FAILED
                        task.error = "No available workers"
                        job.add_log(f"Task {task.id} failed: no available workers")
                        save_job_state(job, self.state_dir)
                        return

                    time.sleep(1)
                    task.attempt -= 1
                    continue

                task.worker = worker.address
                self.scheduler.assign_task_to_worker(task.id, worker)

                job.add_log(
                    f"Executing {task.type.value} task {task.id} on {task.worker} "
                    f"(attempt {task.attempt}/{task.max_attempts})"
                )
                save_job_state(job, self.state_dir)

                try:
                    task_data = self._prepare_task_data(job, task)
                    result = worker.client.execute_task(task_data)

                    if stop_event.is_set():
                        return

                    if result["success"]:
                        task.status = TaskStatus.COMPLETED
                        task.completed_at = time.time()
                        job.add_log(f"Task {task.id} completed successfully on {task.worker}")
                        save_job_state(job, self.state_dir)
                        return
                    else:
                        task.error = result.get("error", "Unknown error")
                        job.add_log(f"Task {task.id} attempt {task.attempt} failed: {task.error}")

                except Exception as e:
                    if stop_event.is_set():
                        return

                    task.error = str(e)
                    worker.consecutive_failures += 1
                    if worker.consecutive_failures >= 3:
                        self.scheduler._blacklist_worker(worker, f"Task execution failed repeatedly: {e}")
                        exclude_workers.add(worker.address)

                    job.add_log(f"Task {task.id} attempt {task.attempt} failed with exception: {str(e)}")

                self.scheduler.unassign_task(task.id)
                save_job_state(job, self.state_dir)
                time.sleep(1)

            task.status = TaskStatus.FAILED
            task.completed_at = time.time()
            job.add_log(f"Task {task.id} failed after {task.max_attempts} attempts: {task.error}")
            save_job_state(job, self.state_dir)

        finally:
            with self._task_lock:
                self._running_tasks.pop(task.id, None)
            self.scheduler.unassign_task(task.id)

    def _prepare_task_data(self, job: Job, task: Task) -> Dict[str, Any]:
        return {
            "type": task.type.value,
            "module_path": "",
            "function_name": job.config.mapper if task.type == TaskType.MAP else job.config.reducer,
            "input_path": task.input_path,
            "output_path": task.output_path,
            "job_id": job.id,
            "partition": task.partition,
            "num_partitions": job.config.num_reducers,
        }


def create_tasks_for_job(job: Job, base_dir: str) -> None:
    input_dir = job.config.input_dir
    input_files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]

    num_mappers = min(job.config.num_mappers, len(input_files))
    files_per_mapper = (len(input_files) + num_mappers - 1) // num_mappers

    map_output_dir = os.path.join(base_dir, job.id, "map_output")
    os.makedirs(map_output_dir, exist_ok=True)

    for i in range(num_mappers):
        start_idx = i * files_per_mapper
        end_idx = min(start_idx + files_per_mapper, len(input_files))

        if start_idx >= len(input_files):
            break

        mapper_input = os.path.join(map_output_dir, f"mapper_input_{i}.txt")
        with open(mapper_input, "w", encoding="utf-8") as out_f:
            for f in input_files[start_idx:end_idx]:
                with open(os.path.join(input_dir, f), "r", encoding="utf-8") as in_f:
                    out_f.write(in_f.read())

        map_output = os.path.join(map_output_dir, f"mapper_{i}_output.txt")
        task = Task(
            id=generate_task_id(),
            type=TaskType.MAP,
            job_id=job.id,
            input_path=mapper_input,
            output_path=map_output,
            max_attempts=job.config.max_retries,
        )
        job.map_tasks.append(task)

    reduce_input_dir = os.path.join(base_dir, job.id, "reduce_input")
    reduce_output_dir = os.path.join(base_dir, job.id, "reduce_output")
    os.makedirs(reduce_input_dir, exist_ok=True)
    os.makedirs(reduce_output_dir, exist_ok=True)

    for i in range(job.config.num_reducers):
        reduce_input = os.path.join(reduce_input_dir, f"partition_{i}.txt")
        reduce_output = os.path.join(reduce_output_dir, f"part-{i:04d}.txt")

        task = Task(
            id=generate_task_id(),
            type=TaskType.REDUCE,
            job_id=job.id,
            input_path=reduce_input,
            output_path=reduce_output,
            partition=i,
            max_attempts=job.config.max_retries,
        )
        job.reduce_tasks.append(task)
