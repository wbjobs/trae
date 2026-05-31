import os
import sys
import time
import tempfile
import threading
import subprocess
import click

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mr.task import JobConfig, Job, generate_job_id, TaskStatus
from mr.scheduler import RoundRobinScheduler, JobExecutor, create_tasks_for_job
from mr.rpc import start_worker


class TestFailover:
    def __init__(self):
        self.tmpdir = tempfile.mkdtemp(prefix="mr_test_")
        self.workers = []
        self.worker_processes = []

    def setup(self):
        print(f"Test directory: {self.tmpdir}")

        self.input_dir = os.path.join(self.tmpdir, "input")
        self.output_dir = os.path.join(self.tmpdir, "output")
        self.work_dir = os.path.join(self.tmpdir, "work")
        self.state_dir = os.path.join(self.tmpdir, "state")

        os.makedirs(self.input_dir)
        os.makedirs(self.output_dir)
        os.makedirs(self.work_dir)
        os.makedirs(self.state_dir)

        for i in range(10):
            with open(os.path.join(self.input_dir, f"file{i}.txt"), "w") as f:
                f.write(f"hello world test line {i}\n")
                f.write(f"another line with word{i}\n")

        self.worker_ports = [18871, 18872, 18873]

    def start_workers(self):
        print("\nStarting workers...")
        for i, port in enumerate(self.worker_ports):
            worker_id = f"test_worker_{i}"
            worker_work_dir = os.path.join(self.work_dir, worker_id)

            p = subprocess.Popen(
                [sys.executable, "-m", "mr.cli", "worker",
                 "--worker-id", worker_id,
                 "--port", str(port),
                 "--work-dir", self.work_dir],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            self.worker_processes.append(p)
            print(f"  Started worker {i} on port {port} (PID: {p.pid})")

        time.sleep(3)

    def kill_worker(self, index):
        if index < len(self.worker_processes):
            p = self.worker_processes[index]
            print(f"\nKilling worker {index} (PID: {p.pid})...")
            p.terminate()
            p.wait(timeout=5)
            print(f"  Worker {index} terminated")

    def test_failover(self):
        print("\n" + "=" * 60)
        print("Testing Worker Failover")
        print("=" * 60)

        self.setup()
        self.start_workers()

        try:
            config = JobConfig(
                name="test_failover",
                mapper="word_count_mapper",
                reducer="word_count_reducer",
                input_dir=self.input_dir,
                output_dir=self.output_dir,
                num_mappers=5,
                num_reducers=2,
                max_retries=3,
            )

            job = Job(id=generate_job_id(), config=config)
            create_tasks_for_job(job, self.work_dir)

            workers = [("localhost", port) for port in self.worker_ports]
            scheduler = RoundRobinScheduler(workers, self.state_dir)
            executor = JobExecutor(scheduler, self.work_dir, self.state_dir)

            print(f"\nCreated job: {job.id}")
            print(f"Map tasks: {len(job.map_tasks)}, Reduce tasks: {len(job.reduce_tasks)}")

            def run_job():
                executor.execute_job(job)

            job_thread = threading.Thread(target=run_job)
            job_thread.start()

            time.sleep(2)

            self.kill_worker(0)

            job_thread.join(timeout=60)

            if job_thread.is_alive():
                print("\nERROR: Job timed out!")
                return False

            print(f"\nJob status: {job.status.value}")

            for i, task in enumerate(job.map_tasks):
                print(f"  Map task {i}: {task.status.value} (worker: {task.worker}, attempts: {task.attempt})")

            for i, task in enumerate(job.reduce_tasks):
                print(f"  Reduce task {i}: {task.status.value} (worker: {task.worker}, attempts: {task.attempt})")

            if job.status == TaskStatus.COMPLETED:
                output_file = os.path.join(self.output_dir, "part-00000")
                if os.path.exists(output_file):
                    with open(output_file) as f:
                        lines = f.readlines()
                    print(f"\nOutput file exists with {len(lines)} lines")
                    print("First 5 lines:")
                    for line in lines[:5]:
                        print(f"  {line.strip()}")

                print("\n" + click.style("FAILOVER TEST PASSED!", fg="green"))
                return True
            else:
                print("\n" + click.style("FAILOVER TEST FAILED!", fg="red"))
                print("Logs:")
                for log in job.logs[-10:]:
                    print(f"  {log}")
                return False

        finally:
            for p in self.worker_processes:
                if p.poll() is None:
                    p.terminate()
                    try:
                        p.wait(timeout=3)
                    except:
                        p.kill()

            import shutil
            shutil.rmtree(self.tmpdir, ignore_errors=True)


def main():
    test = TestFailover()
    try:
        success = test.test_failover()
        return 0 if success else 1
    except Exception as e:
        print(f"\nTest error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
