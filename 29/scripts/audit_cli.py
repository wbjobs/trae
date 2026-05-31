#!/usr/bin/env python3
import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from collections import defaultdict

try:
    from kafka import KafkaConsumer, TopicPartition
except ImportError:
    print("Error: kafka-python library not installed.")
    print("Please install it with: pip install kafka-python")
    sys.exit(1)

DEFAULT_BOOTSTRAP_SERVERS = "localhost:9092"
DEFAULT_TOPIC = "flink-iceberg-audit"
DEFAULT_HOURS = 1


def format_timestamp(ts):
    return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")


def consume_audit_logs(bootstrap_servers, topic, hours, table_name=None, row_id=None):
    consumer = KafkaConsumer(
        bootstrap_servers=bootstrap_servers,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda x: json.loads(x.decode("utf-8")) if x else None,
        consumer_timeout_ms=5000
    )

    partitions = consumer.partitions_for_topic(topic)
    if not partitions:
        print(f"Error: Topic '{topic}' not found or has no partitions")
        consumer.close()
        return []

    topic_partitions = [TopicPartition(topic, p) for p in partitions]
    consumer.assign(topic_partitions)

    start_time_ms = int((datetime.now() - timedelta(hours=hours)).timestamp() * 1000)

    for tp in topic_partitions:
        offsets = consumer.offsets_for_times({tp: start_time_ms})
        if tp in offsets and offsets[tp] is not None:
            consumer.seek(tp, offsets[tp].offset)
        else:
            consumer.seek_to_beginning(tp)

    results = []
    message_count = 0
    start_poll = time.time()
    timeout = 30

    print(f"Consuming audit logs from last {hours} hour(s)...")
    print(f"Filter: table_name={table_name or 'any'}, row_id={row_id or 'any'}")
    print("-" * 80)

    while True:
        if time.time() - start_poll > timeout:
            break

        records = consumer.poll(timeout_ms=1000)
        if not records:
            continue

        for tp, messages in records.items():
            for message in messages:
                message_count += 1
                if message.value is None:
                    continue

                audit = message.value

                if table_name and audit.get("target_table") != table_name:
                    if audit.get("source_table") != table_name:
                        continue

                if row_id and str(audit.get("row_id")) != str(row_id):
                    continue

                results.append(audit)

                print(f"[{format_timestamp(audit.get('timestamp', 0))}] "
                      f"{audit.get('operation', 'UNKNOWN'):8s} "
                      f"row_id={audit.get('row_id', 'N/A'):10s} "
                      f"table={audit.get('target_table', 'N/A')}")

                changed_columns = audit.get("changed_columns", {})
                if changed_columns:
                    for col, change in changed_columns.items():
                        old = change.get("old", "NULL")
                        new = change.get("new", "NULL")
                        print(f"  * {col}: {old} -> {new}")
                    print()

    consumer.close()
    print("-" * 80)
    print(f"Scanned {message_count} messages, found {len(results)} matching records")

    return results


def show_statistics(results):
    if not results:
        return

    print("\n" + "=" * 80)
    print("STATISTICS")
    print("=" * 80)

    ops_count = defaultdict(int)
    table_count = defaultdict(int)
    row_changes = defaultdict(int)

    for audit in results:
        op = audit.get("operation", "UNKNOWN")
        ops_count[op] += 1
        table_count[audit.get("target_table", "unknown")] += 1
        row_id = audit.get("row_id", "unknown")
        row_changes[row_id] += 1

    print("\nOperation counts:")
    for op, count in sorted(ops_count.items()):
        print(f"  {op:10s}: {count}")

    print("\nTable counts:")
    for table, count in sorted(table_count.items()):
        print(f"  {table:30s}: {count}")

    print("\nTop 10 most changed rows:")
    sorted_rows = sorted(row_changes.items(), key=lambda x: x[1], reverse=True)[:10]
    for row_id, count in sorted_rows:
        print(f"  row_id={row_id:10s}: {count} changes")

    print("\nTime range:")
    timestamps = [a.get("timestamp", 0) for a in results]
    if timestamps:
        print(f"  From: {format_timestamp(min(timestamps))}")
        print(f"  To:   {format_timestamp(max(timestamps))}")


def export_results(results, output_file):
    with open(output_file, "w") as f:
        for audit in results:
            f.write(json.dumps(audit) + "\n")
    print(f"\nExported {len(results)} records to {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Flink Iceberg Audit Log CLI - Query data change history",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Query all changes in last 1 hour
  python scripts/audit_cli.py --query

  # Query changes for a specific table
  python scripts/audit_cli.py --query --table default.sync_table

  # Query changes for a specific row
  python scripts/audit_cli.py --query --table default.sync_table --row-id 1001

  # Query changes in last 6 hours
  python scripts/audit_cli.py --query --hours 6

  # Export results to file
  python scripts/audit_cli.py --query --table default.sync_table --export changes.json

  # Use custom Kafka cluster
  python scripts/audit_cli.py --query --bootstrap-servers kafka1:9092,kafka2:9092
        """
    )

    parser.add_argument("--bootstrap-servers", "-b", default=DEFAULT_BOOTSTRAP_SERVERS,
                        help=f"Kafka bootstrap servers (default: {DEFAULT_BOOTSTRAP_SERVERS})")
    parser.add_argument("--topic", "-t", default=DEFAULT_TOPIC,
                        help=f"Kafka audit topic (default: {DEFAULT_TOPIC})")
    parser.add_argument("--query", action="store_true",
                        help="Query audit logs")
    parser.add_argument("--table", "-T",
                        help="Filter by table name (source or target)")
    parser.add_argument("--row-id", "-r",
                        help="Filter by row ID")
    parser.add_argument("--hours", type=int, default=DEFAULT_HOURS,
                        help=f"Query last N hours (default: {DEFAULT_HOURS})")
    parser.add_argument("--export", "-e",
                        help="Export results to JSON file")
    parser.add_argument("--stats", action="store_true",
                        help="Show statistics summary")
    parser.add_argument("--list-topics", action="store_true",
                        help="List available Kafka topics")
    parser.add_argument("--tail", action="store_true",
                        help="Tail audit logs in real-time")

    args = parser.parse_args()

    if args.list_topics:
        consumer = KafkaConsumer(bootstrap_servers=args.bootstrap_servers)
        topics = consumer.topics()
        consumer.close()
        print("Available topics:")
        for topic in sorted(topics):
            print(f"  - {topic}")
        return

    if args.tail:
        tail_logs(args.bootstrap_servers, args.topic, args.table, args.row_id)
        return

    if args.query:
        results = consume_audit_logs(
            args.bootstrap_servers,
            args.topic,
            args.hours,
            args.table,
            args.row_id
        )

        if args.export:
            export_results(results, args.export)

        if args.stats:
            show_statistics(results)
    else:
        parser.print_help()


def tail_logs(bootstrap_servers, topic, table_name=None, row_id=None):
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap_servers,
        auto_offset_reset="latest",
        enable_auto_commit=False,
        value_deserializer=lambda x: json.loads(x.decode("utf-8")) if x else None
    )

    print(f"Tailing audit logs from topic '{topic}'... (Press Ctrl+C to stop)")
    print("-" * 80)

    try:
        for message in consumer:
            if message.value is None:
                continue

            audit = message.value

            if table_name and audit.get("target_table") != table_name:
                if audit.get("source_table") != table_name:
                    continue

            if row_id and str(audit.get("row_id")) != str(row_id):
                continue

            print(f"[{format_timestamp(audit.get('timestamp', 0))}] "
                  f"{audit.get('operation', 'UNKNOWN'):8s} "
                  f"row_id={audit.get('row_id', 'N/A'):10s} "
                  f"table={audit.get('target_table', 'N/A')}")

            changed_columns = audit.get("changed_columns", {})
            if changed_columns:
                for col, change in changed_columns.items():
                    old = change.get("old", "NULL")
                    new = change.get("new", "NULL")
                    print(f"  * {col}: {old} -> {new}")
                print()

    except KeyboardInterrupt:
        print("\nStopped tailing logs")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
