#!/usr/bin/env python3
import json
import time
import random
import os
import argparse
from datetime import datetime, timezone

def generate_debezium_record(record_id, op="c", schema_version=1):
    before = None
    after = {
        "id": record_id,
        "name": f"user_{record_id}"
    }
    if schema_version >= 2:
        after["email"] = f"user{record_id}@example.com"
    if schema_version >= 3:
        after["age"] = random.randint(18, 80)
    if schema_version >= 4:
        after["status"] = random.choice(["active", "inactive", "pending"])
    if schema_version >= 5:
        after["balance"] = round(random.uniform(0, 10000), 2)

    if op == "u":
        before = {
            "id": record_id,
            "name": f"user_{record_id}_old"
        }
        if schema_version >= 2:
            before["email"] = f"old_user{record_id}@example.com"
        after["name"] = f"user_{record_id}_updated"
    elif op == "d":
        before = after.copy()
        after = None

    return {
        "before": before,
        "after": after,
        "source": {
            "version": "2.4.0.Final",
            "connector": "mysql",
            "name": "mysql-binlog-source",
            "ts_ms": int(time.time() * 1000),
            "snapshot": "false",
            "db": "testdb",
            "sequence": None,
            "table": "users",
            "server_id": 1,
            "gtid": None,
            "file": "binlog.000001",
            "pos": 1000 + record_id * 100,
            "row": 0,
            "thread": None,
            "query": None
        },
        "op": op,
        "ts_ms": int(time.time() * 1000),
        "transaction": None
    }

def main():
    parser = argparse.ArgumentParser(description="Generate Debezium JSON test data")
    parser.add_argument("--output", "-o", default="input/debezium_data.json",
                        help="Output file path")
    parser.add_argument("--records", "-n", type=int, default=100,
                        help="Number of records to generate")
    parser.add_argument("--evolution", "-e", action="store_true",
                        help="Include schema evolution test data")
    parser.add_argument("--continuous", "-c", action="store_true",
                        help="Generate data continuously")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    if args.continuous:
        print(f"Generating continuous data to {args.output}...")
        record_id = 1
        schema_version = 1
        evolution_step = args.records // 5 if args.evolution else float('inf')

        with open(args.output, "w") as f:
            while True:
                if args.evolution and record_id % evolution_step == 0 and schema_version < 5:
                    schema_version += 1
                    print(f"Schema evolving to version {schema_version} at record {record_id}")

                op = random.choices(["c", "u", "d"], weights=[0.7, 0.2, 0.1])[0]
                record = generate_debezium_record(record_id, op, schema_version)
                f.write(json.dumps(record) + "\n")
                f.flush()

                record_id += 1
                time.sleep(0.01)
                if record_id % 100 == 0:
                    print(f"Generated {record_id} records...")
    else:
        print(f"Generating {args.records} records to {args.output}...")
        schema_version = 1
        evolution_step = args.records // 5 if args.evolution else float('inf')

        with open(args.output, "w") as f:
            for i in range(1, args.records + 1):
                if args.evolution and i % evolution_step == 0 and schema_version < 5:
                    schema_version += 1
                    print(f"  Schema evolving to version {schema_version} at record {i}")

                op = random.choices(["c", "u", "d"], weights=[0.7, 0.2, 0.1])[0]
                record = generate_debezium_record(i, op, schema_version)
                f.write(json.dumps(record) + "\n")

        print(f"Done! Generated {args.records} records.")
        if args.evolution:
            print(f"Schema evolved {schema_version - 1} time(s).")

if __name__ == "__main__":
    main()
