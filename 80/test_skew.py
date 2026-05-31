import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mr.skew_handler import (
    analyze_data_skew,
    create_split_plans,
    split_skewed_partition,
    merge_skewed_results,
    process_data_skew,
    SKEW_THRESHOLD,
    MIN_SPLIT_SIZE,
)


def test_analyze_data_skew():
    print("Testing analyze_data_skew...")

    with tempfile.TemporaryDirectory() as tmpdir:
        partition_file = os.path.join(tmpdir, "partition_0.txt")
        with open(partition_file, "w") as f:
            for _ in range(1000):
                f.write("skewed_key\t1\n")
            for i in range(100):
                f.write(f"normal_key_{i}\t1\n")

        key_counts, report = analyze_data_skew(partition_file, threshold=2.0)

        assert "skewed_key" in key_counts
        assert key_counts["skewed_key"] == 1000
        assert len(key_counts) == 101
        assert report is not None
        assert len(report.skewed_keys) == 1
        assert report.skewed_keys[0]["key"] == "skewed_key"
        assert report.skewed_keys[0]["value_count"] == 1000
        assert report.avg_values_per_key > 0

        print(f"  Total keys: {report.total_keys}")
        print(f"  Total values: {report.total_values}")
        print(f"  Avg values per key: {report.avg_values_per_key:.2f}")
        print(f"  Skewed keys detected: {len(report.skewed_keys)}")
        print("  PASSED")


def test_create_split_plans():
    print("Testing create_split_plans...")

    from mr.skew_handler import SkewReport

    report = SkewReport(
        job_id="test_job",
        threshold=2.0,
        total_keys=5,
        total_values=1000,
        avg_values_per_key=200.0,
    )
    report.skewed_keys = [
        {"key": "hot_key1", "value_count": 600, "ratio": 3.0},
        {"key": "hot_key2", "value_count": 300, "ratio": 1.5},
    ]

    split_plans = create_split_plans(report, max_splits=5)

    assert "hot_key1" in split_plans
    assert "hot_key2" not in split_plans

    plan = split_plans["hot_key1"]
    assert plan.original_key == "hot_key1"
    assert plan.value_count == 600
    assert plan.split_factor == 3
    assert len(plan.prefixes) == 3

    print(f"  Split factor for hot_key1: {plan.split_factor}")
    print("  PASSED")


def test_split_skewed_partition():
    print("Testing split_skewed_partition...")

    with tempfile.TemporaryDirectory() as tmpdir:
        input_file = os.path.join(tmpdir, "input.txt")
        with open(input_file, "w") as f:
            for _ in range(100):
                f.write("hot_key\t1\n")
            for i in range(50):
                f.write(f"normal_key_{i}\t1\n")

        from mr.skew_handler import SkewReport, create_split_plans

        report = SkewReport(
            job_id="test",
            threshold=1.5,
            total_keys=51,
            total_values=150,
            avg_values_per_key=3.0,
        )
        report.skewed_keys = [{"key": "hot_key", "value_count": 100, "ratio": 33.3}]

        split_plans = create_split_plans(report)
        output_dir = os.path.join(tmpdir, "split_output")

        partition_files, split_ops = split_skewed_partition(
            input_file, output_dir, split_plans, num_reducers=3
        )

        assert len(partition_files) == 3
        assert len(split_ops) == 1
        assert split_ops[0]["original_key"] == "hot_key"
        assert split_ops[0]["split_factor"] > 1

        total_records = 0
        for fpath in partition_files:
            if os.path.exists(fpath):
                with open(fpath) as f:
                    lines = f.readlines()
                    total_records += len(lines)
                    for line in lines:
                        key = line.strip().split("\t")[0]
                        if key.startswith("split_") and "__hot_key" in key:
                            pass
                        elif key == "hot_key":
                            pass
                        else:
                            assert not key.startswith("hot_key"), f"Unexpected hot_key: {key}"

        assert total_records == 150
        print(f"  Total records after split: {total_records}")
        print(f"  Split operations: {len(split_ops)}")
        print("  PASSED")


def test_merge_skewed_results():
    print("Testing merge_skewed_results...")

    with tempfile.TemporaryDirectory() as tmpdir:
        reduce_output_dir = os.path.join(tmpdir, "reduce_output")
        os.makedirs(reduce_output_dir)

        with open(os.path.join(reduce_output_dir, "part-0000.txt"), "w") as f:
            f.write("split_0__hot_key\t50\n")
            f.write("split_1__hot_key\t50\n")
            f.write("normal_key1\t10\n")

        with open(os.path.join(reduce_output_dir, "part-0001.txt"), "w") as f:
            f.write("split_2__hot_key\t30\n")
            f.write("normal_key2\t20\n")

        final_output = os.path.join(tmpdir, "final_output.txt")

        from mr.skew_handler import SkewSplitPlan

        split_plans = {
            "hot_key": SkewSplitPlan(
                original_key="hot_key",
                value_count=130,
                split_factor=3,
                prefixes=["split_0", "split_1", "split_2"],
            )
        }

        merge_ops = merge_skewed_results(reduce_output_dir, final_output, split_plans)

        assert os.path.exists(final_output)
        assert len(merge_ops) == 1
        assert merge_ops[0]["key"] == "hot_key"
        assert merge_ops[0]["merged_from"] == 3
        assert merge_ops[0]["result"] == 130

        with open(final_output) as f:
            lines = f.readlines()
            results = {}
            for line in lines:
                parts = line.strip().split("\t")
                if len(parts) == 2:
                    results[parts[0]] = int(parts[1])

        assert results["hot_key"] == 130
        assert results["normal_key1"] == 10
        assert results["normal_key2"] == 20

        print(f"  Merged keys: {len(merge_ops)}")
        print(f"  hot_key merged result: {results['hot_key']}")
        print("  PASSED")


def test_full_skew_process():
    print("Testing full skew process...")

    with tempfile.TemporaryDirectory() as tmpdir:
        reduce_input_dir = os.path.join(tmpdir, "reduce_input")
        reduce_output_dir = os.path.join(tmpdir, "reduce_output")
        final_output = os.path.join(tmpdir, "output", "part-00000")

        os.makedirs(reduce_input_dir)
        os.makedirs(reduce_output_dir)
        os.makedirs(os.path.dirname(final_output))

        with open(os.path.join(reduce_input_dir, "partition_0.txt"), "w") as f:
            for _ in range(500):
                f.write("hot_word\t1\n")
            for i in range(50):
                f.write(f"word_{i}\t1\n")

        with open(os.path.join(reduce_input_dir, "partition_1.txt"), "w") as f:
            for _ in range(500):
                f.write("hot_word\t1\n")
            for i in range(50, 100):
                f.write(f"word_{i}\t1\n")

        report, skew_detected = process_data_skew(
            "test_job",
            reduce_input_dir,
            reduce_output_dir,
            final_output,
            num_reducers=2,
            threshold=2.0,
        )

        assert skew_detected is True
        assert report is not None
        assert len(report.skewed_keys) >= 1

        skew_key_info = None
        for sk in report.skewed_keys:
            if sk["key"] == "hot_word":
                skew_key_info = sk
                break

        assert skew_key_info is not None
        assert skew_key_info["value_count"] == 1000
        assert skew_key_info["ratio"] > 2.0

        print(f"  Skew detected: {skew_detected}")
        print(f"  Skewed keys: {len(report.skewed_keys)}")
        print(f"  hot_word count: {skew_key_info['value_count']}")
        print(f"  hot_word ratio: {skew_key_info['ratio']:.2f}x")
        print("  PASSED")


def main():
    print("=" * 60)
    print("Running Data Skew Optimization Tests")
    print("=" * 60)
    print(f"SKEW_THRESHOLD: {SKEW_THRESHOLD}x")
    print(f"MIN_SPLIT_SIZE: {MIN_SPLIT_SIZE}")
    print()

    try:
        test_analyze_data_skew()
        test_create_split_plans()
        test_split_skewed_partition()
        test_merge_skewed_results()
        test_full_skew_process()

        print()
        print("=" * 60)
        print("All data skew tests PASSED!")
        print("=" * 60)
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
