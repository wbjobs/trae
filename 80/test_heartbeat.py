import os
import sys
import time
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mr.task import JobConfig, Job, generate_job_id, TaskStatus
from mr.scheduler import RoundRobinScheduler, HEARTBEAT_INTERVAL


def test_worker_info():
    print("Testing WorkerInfo...")
    from mr.scheduler import WorkerInfo
    from mr.rpc import WorkerClient

    client = WorkerClient("localhost", 12345)
    worker = WorkerInfo(host="localhost", port=12345, client=client)

    assert worker.address == "localhost:12345"
    assert worker.available is True
    assert worker.blacklisted is False
    assert worker.consecutive_failures == 0
    print("  PASSED")


def test_scheduler_initialization():
    print("Testing scheduler initialization...")
    workers = [("localhost", 12345), ("localhost", 12346)]
    with tempfile.TemporaryDirectory() as tmpdir:
        scheduler = RoundRobinScheduler(workers, tmpdir)

        assert len(scheduler.workers) == 2
        assert scheduler.workers[0].address == "localhost:12345"
        assert scheduler.workers[1].address == "localhost:12346"
        assert scheduler._heartbeat_thread is not None
        assert scheduler._heartbeat_thread.is_alive()

        scheduler.stop()
        time.sleep(0.5)
        assert not scheduler._heartbeat_thread.is_alive()
    print("  PASSED")


def test_blacklist_mechanism():
    print("Testing blacklist mechanism...")
    with tempfile.TemporaryDirectory() as tmpdir:
        scheduler = RoundRobinScheduler([("localhost", 12345)], tmpdir)

        worker = scheduler.workers[0]
        scheduler._blacklist_worker(worker, "Test reason")

        assert worker.blacklisted is True
        assert worker.blacklist_reason == "Test reason"
        assert worker.available is False

        blacklisted = scheduler.get_blacklisted_workers()
        assert len(blacklisted) == 1
        assert blacklisted[0] == worker

        available = scheduler.get_available_workers()
        assert len(available) == 0

        next_worker = scheduler.get_next_worker()
        assert next_worker is None

        scheduler.stop()
    print("  PASSED")


def test_exclude_workers():
    print("Testing exclude_workers in get_next_worker...")
    with tempfile.TemporaryDirectory() as tmpdir:
        workers = [("localhost", 12345), ("localhost", 12346), ("localhost", 12347)]
        scheduler = RoundRobinScheduler(workers, tmpdir)

        exclude = {"localhost:12345", "localhost:12346"}
        worker = scheduler.get_next_worker(exclude)
        assert worker is not None
        assert worker.address == "localhost:12347"

        exclude_all = {"localhost:12345", "localhost:12346", "localhost:12347"}
        worker = scheduler.get_next_worker(exclude_all)
        assert worker is None

        scheduler.stop()
    print("  PASSED")


def test_task_worker_mapping():
    print("Testing task-worker mapping...")
    with tempfile.TemporaryDirectory() as tmpdir:
        scheduler = RoundRobinScheduler([("localhost", 12345)], tmpdir)

        worker = scheduler.workers[0]
        scheduler.assign_task_to_worker("task_123", worker)

        assigned = scheduler.get_worker_for_task("task_123")
        assert assigned == worker

        scheduler.unassign_task("task_123")
        assigned = scheduler.get_worker_for_task("task_123")
        assert assigned is None

        scheduler.stop()
    print("  PASSED")


def main():
    print("=" * 50)
    print("Running Heartbeat & Failover Tests")
    print("=" * 50)

    try:
        test_worker_info()
        test_scheduler_initialization()
        test_blacklist_mechanism()
        test_exclude_workers()
        test_task_worker_mapping()

        print("=" * 50)
        print("All tests PASSED!")
        print("=" * 50)
        return 0
    except AssertionError as e:
        print(f"\nTest FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
