import os
import sys
import importlib
import traceback
from typing import Dict, Any, List, Tuple
import rpyc
from rpyc.utils.server import ThreadedServer


class WorkerService(rpyc.Service):
    def __init__(self, worker_id: str, work_dir: str):
        self.worker_id = worker_id
        self.work_dir = work_dir
        os.makedirs(work_dir, exist_ok=True)

    def exposed_get_worker_id(self) -> str:
        return self.worker_id

    def exposed_ping(self) -> bool:
        return True

    def exposed_execute_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            task_type = task_data["type"]
            module_path = task_data["module_path"]
            function_name = task_data["function_name"]
            input_path = task_data["input_path"]
            output_path = task_data["output_path"]
            job_id = task_data["job_id"]
            partition = task_data.get("partition", 0)
            num_partitions = task_data.get("num_partitions", 1)

            job_work_dir = os.path.join(self.work_dir, job_id)
            os.makedirs(job_work_dir, exist_ok=True)

            if module_path and os.path.exists(module_path):
                spec = importlib.util.spec_from_file_location("user_module", module_path)
                user_module = importlib.util.module_from_spec(spec)
                sys.modules["user_module"] = user_module
                spec.loader.exec_module(user_module)
                func = getattr(user_module, function_name)
            else:
                func = _get_builtin_function(function_name)

            if task_type == "map":
                result = self._execute_map(func, input_path, output_path, partition, num_partitions)
            elif task_type == "reduce":
                result = self._execute_reduce(func, input_path, output_path, partition)
            else:
                raise ValueError(f"Unknown task type: {task_type}")

            return {
                "success": True,
                "worker_id": self.worker_id,
                "result": result,
            }
        except Exception as e:
            return {
                "success": False,
                "worker_id": self.worker_id,
                "error": str(e),
                "traceback": traceback.format_exc(),
            }

    def _execute_map(self, mapper_func, input_path: str, output_path: str,
                     partition: int, num_partitions: int) -> Dict[str, Any]:
        intermediate = {}

        with open(input_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f):
                try:
                    pairs = mapper_func(line_num, line.strip())
                    for key, value in pairs:
                        if key not in intermediate:
                            intermediate[key] = []
                        intermediate[key].append(value)
                except Exception as e:
                    print(f"Error processing line {line_num}: {e}")

        partition_dir = os.path.dirname(output_path)
        os.makedirs(partition_dir, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            for key, values in sorted(intermediate.items()):
                for value in values:
                    f.write(f"{key}\t{value}\n")

        return {
            "records_processed": len(intermediate),
            "output_path": output_path,
        }

    def _execute_reduce(self, reducer_func, input_path: str, output_path: str,
                        partition: int) -> Dict[str, Any]:
        grouped = {}

        if os.path.exists(input_path):
            with open(input_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split("\t", 1)
                    if len(parts) == 2:
                        key, value = parts
                        if key not in grouped:
                            grouped[key] = []
                        grouped[key].append(value)

        output_dir = os.path.dirname(output_path)
        os.makedirs(output_dir, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            for key in sorted(grouped.keys()):
                try:
                    results = reducer_func(key, grouped[key])
                    for result_key, result_value in results:
                        f.write(f"{result_key}\t{result_value}\n")
                except Exception as e:
                    print(f"Error reducing key {key}: {e}")

        return {
            "keys_processed": len(grouped),
            "output_path": output_path,
        }


def _get_builtin_function(name: str):
    from . import examples
    return getattr(examples, name)


def start_worker(worker_id: str, host: str, port: int, work_dir: str) -> None:
    service = WorkerService(worker_id, work_dir)
    server = ThreadedServer(service, hostname=host, port=port, protocol_config={"allow_public_attrs": True})
    print(f"Worker {worker_id} started on {host}:{port}, work dir: {work_dir}")
    server.start()


class WorkerClient:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._conn = None

    def connect(self) -> None:
        self._conn = rpyc.connect(self.host, self.port, config={"allow_public_attrs": True})

    def disconnect(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def ping(self) -> bool:
        try:
            if not self._conn:
                self.connect()
            return self._conn.root.ping()
        except Exception:
            return False

    def get_worker_id(self) -> str:
        if not self._conn:
            self.connect()
        return self._conn.root.get_worker_id()

    def execute_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        if not self._conn:
            self.connect()
        return self._conn.root.execute_task(task_data)
