import os
import sys
import tempfile
import shutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mr.task import JobConfig, Job, generate_job_id
from mr.scheduler import create_tasks_for_job
from mr.examples import word_count_mapper, word_count_reducer
from mr.shuffle import hash_partition


def test_hash_partition():
    print("Testing hash_partition...")
    keys = ["apple", "banana", "cherry", "date", "elderberry"]
    partitions = set()
    for key in keys:
        p = hash_partition(key, 3)
        assert 0 <= p < 3, f"Partition {p} out of range for key {key}"
        partitions.add(p)
    print(f"  Partitions used: {len(partitions)}/3")
    print("  PASSED")


def test_word_count_mapper():
    print("Testing word_count_mapper...")
    result = word_count_mapper(0, "Hello world hello")
    expected = [("hello", 1), ("world", 1), ("hello", 1)]
    assert result == expected, f"Expected {expected}, got {result}"
    print("  PASSED")


def test_word_count_reducer():
    print("Testing word_count_reducer...")
    result = word_count_reducer("hello", ["1", "1", "1"])
    expected = [("hello", 3)]
    assert result == expected, f"Expected {expected}, got {result}"
    print("  PASSED")


def test_job_config():
    print("Testing JobConfig...")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write("""name: test
mapper: word_count_mapper
reducer: word_count_reducer
input_dir: /tmp/input
output_dir: /tmp/output
num_mappers: 2
num_reducers: 2
max_retries: 3
""")
        config_path = f.name

    try:
        config = JobConfig.from_yaml(config_path)
        assert config.name == "test"
        assert config.num_mappers == 2
        assert config.max_retries == 3
        print("  PASSED")
    finally:
        os.unlink(config_path)


def test_task_creation():
    print("Testing task creation...")
    with tempfile.TemporaryDirectory() as tmpdir:
        input_dir = os.path.join(tmpdir, "input")
        output_dir = os.path.join(tmpdir, "output")
        work_dir = os.path.join(tmpdir, "work")
        os.makedirs(input_dir)
        os.makedirs(output_dir)

        for i in range(5):
            with open(os.path.join(input_dir, f"file{i}.txt"), "w") as f:
                f.write(f"line {i} content\n")

        config = JobConfig(
            name="test",
            mapper="word_count_mapper",
            reducer="word_count_reducer",
            input_dir=input_dir,
            output_dir=output_dir,
            num_mappers=2,
            num_reducers=2,
            max_retries=3,
        )

        job = Job(id=generate_job_id(), config=config)
        create_tasks_for_job(job, work_dir)

        assert len(job.map_tasks) == 2, f"Expected 2 map tasks, got {len(job.map_tasks)}"
        assert len(job.reduce_tasks) == 2, f"Expected 2 reduce tasks, got {len(job.reduce_tasks)}"
        print(f"  Created {len(job.map_tasks)} map tasks, {len(job.reduce_tasks)} reduce tasks")
        print("  PASSED")


def main():
    print("=" * 50)
    print("Running MapReduce CLI tests")
    print("=" * 50)

    try:
        test_hash_partition()
        test_word_count_mapper()
        test_word_count_reducer()
        test_job_config()
        test_task_creation()

        print("=" * 50)
        print("All tests PASSED!")
        print("=" * 50)
        return 0
    except AssertionError as e:
        print(f"\nTest FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
