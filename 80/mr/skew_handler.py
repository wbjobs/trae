import os
import random
import time
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field, asdict
import yaml


SKEW_THRESHOLD = 2.0
MIN_SPLIT_SIZE = 100


@dataclass
class SkewReport:
    job_id: str
    detected_at: float = field(default_factory=time.time)
    threshold: float = SKEW_THRESHOLD
    total_keys: int = 0
    total_values: int = 0
    avg_values_per_key: float = 0.0
    skewed_keys: List[Dict[str, Any]] = field(default_factory=list)
    split_operations: List[Dict[str, Any]] = field(default_factory=list)
    merge_operations: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def save(self, output_path: str) -> None:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            yaml.dump(self.to_dict(), f, default_flow_style=False)


@dataclass
class SkewSplitPlan:
    original_key: str
    value_count: int
    split_factor: int
    prefixes: List[str]

    def get_splits(self) -> List[Tuple[str, str]]:
        return [(prefix, f"{prefix}__{self.original_key}") for prefix in self.prefixes]


def analyze_data_skew(partition_file: str, threshold: float = SKEW_THRESHOLD) -> Tuple[Dict[str, int], Optional[SkewReport]]:
    key_counts: Dict[str, int] = {}
    total_values = 0

    if not os.path.exists(partition_file):
        return key_counts, None

    with open(partition_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t", 1)
            if len(parts) == 2:
                key = parts[0]
                key_counts[key] = key_counts.get(key, 0) + 1
                total_values += 1

    total_keys = len(key_counts)
    if total_keys == 0:
        return key_counts, None

    avg_values_per_key = total_values / total_keys

    report = SkewReport(
        job_id="",
        threshold=threshold,
        total_keys=total_keys,
        total_values=total_values,
        avg_values_per_key=avg_values_per_key,
    )

    for key, count in key_counts.items():
        if count >= avg_values_per_key * threshold and count >= MIN_SPLIT_SIZE:
            report.skewed_keys.append({
                "key": key,
                "value_count": count,
                "ratio": count / avg_values_per_key if avg_values_per_key > 0 else 0,
            })

    return key_counts, report


def create_split_plans(report: SkewReport, max_splits: int = 10) -> Dict[str, SkewSplitPlan]:
    split_plans: Dict[str, SkewSplitPlan] = {}

    for skew_info in report.skewed_keys:
        key = skew_info["key"]
        count = skew_info["value_count"]
        avg = report.avg_values_per_key

        if avg <= 0:
            continue

        split_factor = min(max(2, int(count / avg)), max_splits)
        prefixes = [f"split_{i}" for i in range(split_factor)]

        split_plans[key] = SkewSplitPlan(
            original_key=key,
            value_count=count,
            split_factor=split_factor,
            prefixes=prefixes,
        )

    return split_plans


def split_skewed_partition(
    input_partition: str,
    output_dir: str,
    split_plans: Dict[str, SkewSplitPlan],
    num_reducers: int,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    os.makedirs(output_dir, exist_ok=True)

    split_operations: List[Dict[str, Any]] = []
    key_split_map: Dict[str, List[str]] = {}

    for key, plan in split_plans.items():
        key_split_map[key] = [new_key for _, new_key in plan.get_splits()]

    partition_files = [os.path.join(output_dir, f"split_partition_{i}.txt") for i in range(num_reducers)]
    for fpath in partition_files:
        with open(fpath, "w", encoding="utf-8") as f:
            pass

    if not os.path.exists(input_partition):
        return partition_files, split_operations

    with open(input_partition, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t", 1)
            if len(parts) == 2:
                key, value = parts

                if key in split_plans:
                    plan = split_plans[key]
                    prefix = random.choice(plan.prefixes)
                    new_key = f"{prefix}__{key}"
                    partition_idx = hash(new_key) % num_reducers
                    with open(partition_files[partition_idx], "a", encoding="utf-8") as pf:
                        pf.write(f"{new_key}\t{value}\n")
                else:
                    partition_idx = hash(key) % num_reducers
                    with open(partition_files[partition_idx], "a", encoding="utf-8") as pf:
                        pf.write(f"{key}\t{value}\n")

    for key, plan in split_plans.items():
        split_operations.append({
            "original_key": key,
            "value_count": plan.value_count,
            "split_factor": plan.split_factor,
            "new_keys": key_split_map[key],
        })

    return partition_files, split_operations


def merge_skewed_results(
    reduce_output_dir: str,
    final_output_path: str,
    split_plans: Dict[str, SkewSplitPlan],
) -> List[Dict[str, Any]]:
    merge_operations: List[Dict[str, Any]] = []
    merged_results: Dict[str, List[str]] = {}
    normal_results: Dict[str, List[str]] = {}

    for filename in os.listdir(reduce_output_dir):
        if not filename.endswith(".txt"):
            continue
        filepath = os.path.join(reduce_output_dir, filename)
        if not os.path.exists(filepath):
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    key, value = parts
                    if "__" in key:
                        prefix, original_key = key.split("__", 1)
                        if original_key not in merged_results:
                            merged_results[original_key] = []
                        merged_results[original_key].append(value)
                    else:
                        if key not in normal_results:
                            normal_results[key] = []
                        normal_results[key].append(value)

    os.makedirs(os.path.dirname(final_output_path), exist_ok=True)

    with open(final_output_path, "w", encoding="utf-8") as f:
        for key in sorted(normal_results.keys()):
            for value in normal_results[key]:
                f.write(f"{key}\t{value}\n")

        for key in sorted(merged_results.keys()):
            values = merged_results[key]
            try:
                numeric_values = [int(v) for v in values]
                total = sum(numeric_values)
                f.write(f"{key}\t{total}\n")
                merge_operations.append({
                    "key": key,
                    "merged_from": len(values),
                    "result": total,
                })
            except ValueError:
                for value in values:
                    f.write(f"{key}\t{value}\n")
                merge_operations.append({
                    "key": key,
                    "merged_from": len(values),
                    "result": "concatenated",
                })

    return merge_operations


def process_data_skew(
    job_id: str,
    reduce_input_dir: str,
    reduce_output_dir: str,
    final_output_path: str,
    num_reducers: int,
    threshold: float = SKEW_THRESHOLD,
) -> Tuple[Optional[SkewReport], bool]:
    report = None
    skew_detected = False

    all_key_counts: Dict[str, int] = {}
    reports: List[SkewReport] = []

    for i in range(num_reducers):
        partition_file = os.path.join(reduce_input_dir, f"partition_{i}.txt")
        key_counts, part_report = analyze_data_skew(partition_file, threshold)

        for key, count in key_counts.items():
            all_key_counts[key] = all_key_counts.get(key, 0) + count

        if part_report and part_report.skewed_keys:
            reports.append(part_report)

    if all_key_counts:
        total_keys = len(all_key_counts)
        total_values = sum(all_key_counts.values())
        avg_values_per_key = total_values / total_keys

        report = SkewReport(
            job_id=job_id,
            threshold=threshold,
            total_keys=total_keys,
            total_values=total_values,
            avg_values_per_key=avg_values_per_key,
        )

        for key, count in all_key_counts.items():
            if count >= avg_values_per_key * threshold and count >= MIN_SPLIT_SIZE:
                report.skewed_keys.append({
                    "key": key,
                    "value_count": count,
                    "ratio": count / avg_values_per_key if avg_values_per_key > 0 else 0,
                })
                skew_detected = True

    if skew_detected and report:
        split_plans = create_split_plans(report)

        split_output_dir = os.path.join(os.path.dirname(reduce_input_dir), "skew_split_input")
        for i in range(num_reducers):
            partition_file = os.path.join(reduce_input_dir, f"partition_{i}.txt")
            if os.path.exists(partition_file):
                partition_files, split_ops = split_skewed_partition(
                    partition_file,
                    split_output_dir,
                    split_plans,
                    num_reducers,
                )
                report.split_operations.extend(split_ops)

        for i in range(num_reducers):
            src = os.path.join(split_output_dir, f"split_partition_{i}.txt")
            dst = os.path.join(reduce_input_dir, f"partition_{i}.txt")
            if os.path.exists(src):
                os.replace(src, dst)

    return report, skew_detected
