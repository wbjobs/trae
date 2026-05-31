#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
import time
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
JAR_PATH = PROJECT_ROOT / "target" / "flink-iceberg-sync-1.0.0.jar"
DEFAULT_FLINK_HOME = os.environ.get("FLINK_HOME", "")
DEFAULT_INPUT = "input/"
DEFAULT_WAREHOUSE = "./iceberg-warehouse"
DEFAULT_TABLE = "default.sync_table"
DEFAULT_PK = "id"
DEFAULT_PARALLELISM = "1"
DEFAULT_KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
DEFAULT_AUDIT_TOPIC = "flink-iceberg-audit"
DEFAULT_AUDIT_ENABLED = "true"

def check_flink_home(flink_home):
    if not flink_home:
        print("ERROR: FLINK_HOME environment variable not set and --flink-home not provided")
        print("Please set FLINK_HOME or use --flink-home to specify Flink installation path")
        return False
    flink_bin = Path(flink_home) / "bin"
    if not flink_bin.exists():
        print(f"ERROR: Flink bin directory not found at {flink_bin}")
        return False
    return True

def check_jar():
    if not JAR_PATH.exists():
        print(f"ERROR: JAR file not found at {JAR_PATH}")
        print("Please run 'mvn clean package' first to build the project")
        return False
    return True

def start_flink_cluster(flink_home):
    print(f"\n{'='*60}")
    print("Starting Flink Cluster...")
    print('='*60)
    start_script = Path(flink_home) / "bin" / "start-cluster.bat" if os.name == 'nt' else "start-cluster.sh"
    cmd = [str(start_script)] if os.name == 'nt' else ["bash", str(start_script)]
    try:
        subprocess.run(cmd, cwd=flink_home, check=True)
        print("Flink Cluster started successfully")
        print("Web UI: http://localhost:8081")
        time.sleep(3)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to start Flink cluster: {e}")
        return False

def stop_flink_cluster(flink_home):
    print(f"\n{'='*60}")
    print("Stopping Flink Cluster...")
    print('='*60)
    stop_script = Path(flink_home) / "bin" / "stop-cluster.bat" if os.name == 'nt' else "stop-cluster.sh"
    cmd = [str(stop_script)] if os.name == 'nt' else ["bash", str(stop_script)]
    try:
        subprocess.run(cmd, cwd=flink_home, check=True)
        print("Flink Cluster stopped successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to stop Flink cluster: {e}")
        return False

def submit_job(flink_home, args):
    print(f"\n{'='*60}")
    print("Submitting Flink Job...")
    print('='*60)
    print(f"Input path: {args.input}")
    print(f"Warehouse path: {args.warehouse}")
    print(f"Table name: {args.table}")
    print(f"Primary key: {args.primary_key}")
    print(f"Parallelism: {args.parallelism}")
    print(f"Audit enabled: {args.audit_enabled}")
    if args.audit_enabled:
        print(f"Kafka brokers: {args.kafka_brokers}")
        print(f"Audit topic: {args.audit_topic}")
    print('='*60)

    flink_cmd = Path(flink_home) / "bin" / "flink.bat" if os.name == 'nt' else "flink"
    cmd = [
        str(flink_cmd),
        "run",
        "-p", str(args.parallelism),
        str(JAR_PATH),
        args.input,
        args.warehouse,
        args.table,
        args.primary_key,
        str(args.parallelism),
        args.kafka_brokers,
        args.audit_topic,
        str(args.audit_enabled).lower()
    ]

    if os.name != 'nt':
        cmd = ["bash", str(Path(flink_home) / "bin" / "flink")] + cmd[1:]

    print(f"\nCommand: {' '.join(cmd)}")
    print(f"\n{'='*60}")
    print("Job Output:")
    print('='*60)

    try:
        process = subprocess.Popen(cmd, cwd=PROJECT_ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            print(line, end='')
        process.wait()
        if process.returncode == 0:
            print("\nJob completed successfully")
        else:
            print(f"\nJob failed with exit code {process.returncode}")
        return process.returncode == 0
    except KeyboardInterrupt:
        print("\nJob interrupted by user")
        process.terminate()
        return False
    except Exception as e:
        print(f"Error submitting job: {e}")
        return False

def monitor_metrics(log_path="metrics.log"):
    print(f"\n{'='*60}")
    print(f"Monitoring metrics from {log_path}")
    print("Press Ctrl+C to stop monitoring")
    print('='*60)
    try:
        if Path(log_path).exists():
            with open(log_path, 'r') as f:
                f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    print(line.strip())
                else:
                    time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped monitoring")

def build_project():
    print(f"\n{'='*60}")
    print("Building project with Maven...")
    print('='*60)
    mvn_cmd = "mvn.cmd" if os.name == 'nt' else "mvn"
    cmd = [mvn_cmd, "clean", "package", "-DskipTests"]
    try:
        subprocess.run(cmd, cwd=PROJECT_ROOT, check=True)
        print("\nBuild completed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\nBuild failed: {e}")
        return False

def clean_environment(warehouse_path):
    print(f"\n{'='*60}")
    print("Cleaning environment...")
    print('='*60)
    warehouse = Path(warehouse_path)
    if warehouse.exists():
        shutil.rmtree(warehouse)
        print(f"Removed warehouse directory: {warehouse}")
    metrics_log = Path("metrics.log")
    if metrics_log.exists():
        metrics_log.unlink()
        print("Removed metrics.log")
    print("Clean completed")

def main():
    parser = argparse.ArgumentParser(
        description="Flink Iceberg Sync Job Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Build project first
  python scripts/run_job.py --build

  # Start cluster and run job
  python scripts/run_job.py --start-cluster --run

  # Run with custom parameters
  python scripts/run_job.py --run --input ./data --warehouse ./warehouse --table db.table --pk id

  # Full workflow
  python scripts/run_job.py --build --start-cluster --generate --evolution --run

  # Monitor metrics only
  python scripts/run_job.py --monitor

  # Stop cluster
  python scripts/run_job.py --stop-cluster
        """
    )

    parser.add_argument("--flink-home", default=DEFAULT_FLINK_HOME,
                        help=f"Flink installation directory (default: $FLINK_HOME={DEFAULT_FLINK_HOME})")
    parser.add_argument("--build", action="store_true",
                        help="Build the project with Maven")
    parser.add_argument("--clean", action="store_true",
                        help="Clean warehouse and metrics before running")
    parser.add_argument("--start-cluster", action="store_true",
                        help="Start Flink cluster before running")
    parser.add_argument("--stop-cluster", action="store_true",
                        help="Stop Flink cluster after running")
    parser.add_argument("--generate", action="store_true",
                        help="Generate test data before running")
    parser.add_argument("--records", type=int, default=500,
                        help="Number of test records to generate (default: 500)")
    parser.add_argument("--evolution", action="store_true",
                        help="Include schema evolution in generated data")
    parser.add_argument("--run", action="store_true",
                        help="Run the Flink job")
    parser.add_argument("--monitor", action="store_true",
                        help="Monitor metrics.log file")
    parser.add_argument("--input", default=DEFAULT_INPUT,
                        help=f"Input directory path (default: {DEFAULT_INPUT})")
    parser.add_argument("--warehouse", default=DEFAULT_WAREHOUSE,
                        help=f"Iceberg warehouse path (default: {DEFAULT_WAREHOUSE})")
    parser.add_argument("--table", default=DEFAULT_TABLE,
                        help=f"Target table name (default: {DEFAULT_TABLE})")
    parser.add_argument("--primary-key", default=DEFAULT_PK,
                        help=f"Primary key column (default: {DEFAULT_PK})")
    parser.add_argument("--parallelism", "-p", type=int, default=int(DEFAULT_PARALLELISM),
                        help=f"Flink job parallelism (default: {DEFAULT_PARALLELISM})")
    parser.add_argument("--kafka-brokers", default=DEFAULT_KAFKA_BROKERS,
                        help=f"Kafka bootstrap servers (default: {DEFAULT_KAFKA_BROKERS})")
    parser.add_argument("--audit-topic", default=DEFAULT_AUDIT_TOPIC,
                        help=f"Kafka audit topic (default: {DEFAULT_AUDIT_TOPIC})")
    parser.add_argument("--disable-audit", action="store_true",
                        help="Disable audit log")

    args = parser.parse_args()
    args.audit_enabled = not args.disable_audit

    if not any([args.build, args.run, args.start_cluster, args.stop_cluster, args.monitor, args.generate, args.clean]):
        parser.print_help()
        sys.exit(0)

    if args.clean:
        clean_environment(args.warehouse)

    if args.build:
        if not build_project():
            sys.exit(1)

    if args.generate:
        print(f"\n{'='*60}")
        print("Generating test data...")
        print('='*60)
        gen_script = PROJECT_ROOT / "scripts" / "generate_test_data.py"
        cmd = [sys.executable, str(gen_script), "-n", str(args.records)]
        if args.evolution:
            cmd.append("-e")
        cmd.extend(["-o", str(Path(args.input) / "debezium_data.json")])
        subprocess.run(cmd, cwd=PROJECT_ROOT, check=True)

    if args.start_cluster:
        if not check_flink_home(args.flink_home):
            sys.exit(1)
        if not start_flink_cluster(args.flink_home):
            sys.exit(1)

    if args.run:
        if not check_flink_home(args.flink_home):
            sys.exit(1)
        if not check_jar():
            sys.exit(1)
        submit_job(args.flink_home, args)

    if args.monitor:
        monitor_metrics()

    if args.stop_cluster:
        if not check_flink_home(args.flink_home):
            sys.exit(1)
        stop_flink_cluster(args.flink_home)

if __name__ == "__main__":
    main()
