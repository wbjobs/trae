import os
import hashlib
from typing import Dict, List, Tuple


def hash_partition(key: str, num_partitions: int) -> int:
    hash_value = hashlib.md5(key.encode("utf-8")).hexdigest()
    return int(hash_value, 16) % num_partitions


def shuffle_map_output(map_output_dir: str, num_reducers: int,
                      reduce_input_dir: str) -> Dict[int, str]:
    partition_files = {i: os.path.join(reduce_input_dir, f"partition_{i}.txt") for i in range(num_reducers)}

    for fpath in partition_files.values():
        os.makedirs(os.path.dirname(fpath), exist_ok=True)
        with open(fpath, "w", encoding="utf-8") as f:
            pass

    for filename in os.listdir(map_output_dir):
        if filename.endswith(".txt") and filename.startswith("mapper_") and "_output.txt" in filename:
            filepath = os.path.join(map_output_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split("\t", 1)
                    if len(parts) == 2:
                        key, value = parts
                        partition = hash_partition(key, num_reducers)
                        with open(partition_files[partition], "a", encoding="utf-8") as pf:
                            pf.write(f"{key}\t{value}\n")

    return partition_files


def merge_partitions(partition_files: List[str], output_path: str) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    all_data = []
    for fpath in partition_files:
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        all_data.append(line)

    all_data.sort()

    with open(output_path, "w", encoding="utf-8") as f:
        for line in all_data:
            f.write(line + "\n")


def collect_reduce_outputs(reduce_output_dir: str, final_output_path: str) -> None:
    os.makedirs(os.path.dirname(final_output_path), exist_ok=True)

    all_lines = []
    for filename in sorted(os.listdir(reduce_output_dir)):
        if filename.endswith(".txt"):
            filepath = os.path.join(reduce_output_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        all_lines.append(line)

    all_lines.sort()

    with open(final_output_path, "w", encoding="utf-8") as f:
        for line in all_lines:
            f.write(line + "\n")
