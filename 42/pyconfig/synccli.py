#!/usr/bin/env python3
import sys
import os
import argparse
import json
import subprocess
import signal
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config, load_config
from scheduler import SyncScheduler

SYNCENGINE_BIN = None

def find_syncengine():
    if getattr(sys, 'frozen', False):
        return os.path.join(os.path.dirname(sys.executable), 'syncengine')
    else:
        syncengine_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'syncengine')
        if sys.platform == 'win32':
            return os.path.join(syncengine_dir, 'syncengine.exe')
        else:
            return os.path.join(syncengine_dir, 'syncengine')

def sync_task(task, args):
    try:
        task_dict = task.to_dict()
        task_dict['dry_run'] = args.dry_run
        task_dict['force'] = args.force
        task_dict['verbose'] = args.verbose

        syncengine = find_syncengine()

        if not os.path.exists(syncengine):
            print(f"Error: syncengine binary not found at {syncengine}", file=sys.stderr)
            print("Please build the Go syncengine first.", file=sys.stderr)
            return 1

        task_json = json.dumps(task_dict, ensure_ascii=False)

        proc = subprocess.Popen(
            [syncengine, 'sync', task_json],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )

        stdout, stderr = proc.communicate()

        if stderr:
            print(f"syncengine error: {stderr}", file=sys.stderr)

        if stdout:
            try:
                result = json.loads(stdout.strip())
                print_sync_result(result, args.verbose)
            except json.JSONDecodeError:
                print(f"Failed to parse syncengine output: {stdout}", file=sys.stderr)
                return 1

        return 0 if proc.returncode == 0 else 1

    except Exception as e:
        print(f"Error during sync: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

def print_sync_result(result, verbose=False):
    print(f"\nSync Result for task: {result.get('task_name', 'unknown')}")
    print(f"Success: {result.get('success', False)}")
    print(f"Duration: {result.get('duration', 'unknown')}")

    if result.get('files_uploaded', 0) > 0:
        print(f"Files uploaded: {result.get('files_uploaded', 0)}")
    if result.get('files_downloaded', 0) > 0:
        print(f"Files downloaded: {result.get('files_downloaded', 0)}")
    if result.get('files_skipped', 0) > 0:
        print(f"Files skipped: {result.get('files_skipped', 0)}")
    if result.get('bytes_transferred', 0) > 0:
        print(f"Bytes transferred: {result.get('bytes_transferred', 0)}")

    if result.get('conflicts'):
        print(f"\nConflicts detected: {len(result['conflicts'])}")
        for conflict in result['conflicts']:
            print(f"  - {conflict['path']}: {conflict['resolution']}")

    if result.get('errors'):
        print(f"\nErrors: {len(result['errors'])}")
        for error in result['errors']:
            print(f"  - {error}")

    if verbose and result.get('actions'):
        print(f"\nActions performed: {len(result['actions'])}")
        for action in result['actions'][:10]:
            print(f"  [{action['type']}] {action['path']} - {action['reason']}")
        if len(result['actions']) > 10:
            print(f"  ... and {len(result['actions']) - 10} more")

def cmd_sync(args):
    config = load_config(args.config)

    errors = config.validate()
    if errors:
        print("Configuration errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if args.task_name:
        task = config.get_task(args.task_name)
        if not task:
            print(f"Error: Task '{args.task_name}' not found", file=sys.stderr)
            return 1

        if args.verbose:
            print(f"Running sync for task: {args.task_name}")

        return sync_task(task, args)
    else:
        print("Available tasks:")
        for task_name in config.list_tasks():
            print(f"  - {task_name}")
        return 0

def cmd_list(args):
    config = load_config(args.config)

    tasks = config.list_tasks()
    if not tasks:
        print("No tasks configured")
        return 0

    print("Configured tasks:")
    for task_name in tasks:
        task = config.get_task(task_name)
        print(f"\n  Task: {task.name}")
        print(f"    Local path: {task.local_path}")
        print(f"    Remote path: {task.remote_path}")
        print(f"    Host: {task.remote_config.host}:{task.remote_config.port}")
        print(f"    Direction: {task.direction}")
        print(f"    Conflict resolution: {task.conflict_resolution}")
        if task.schedule:
            print(f"    Schedule: {task.schedule}")
        if task.ignore_patterns:
            print(f"    Ignore patterns: {', '.join(task.ignore_patterns)}")

    return 0

def cmd_status(args):
    print("Checking task status...")
    config = load_config(args.config)

    for task_name in config.list_tasks():
        task = config.get_task(task_name)
        if task.schedule:
            print(f"  {task_name}: scheduled ({task.schedule})")
        else:
            print(f"  {task_name}: manual only")

    return 0

def cmd_validate(args):
    try:
        config = load_config(args.config)

        errors = config.validate()
        if errors:
            print("Configuration validation failed:")
            for error in errors:
                print(f"  - {error}")
            return 1
        else:
            print("Configuration is valid!")
            print(f"Found {len(config.tasks)} task(s)")
            return 0

    except Exception as e:
        print(f"Failed to load config: {e}", file=sys.stderr)
        return 1

def cmd_daemon(args):
    print("Starting filesync daemon...")
    config = load_config(args.config)

    errors = config.validate()
    if errors:
        print("Configuration errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    scheduler = SyncScheduler()

    def run_task(task_name):
        task = config.get_task(task_name)
        if task:
            from datetime import datetime
            print(f"[{datetime.now()}] Running scheduled task: {task_name}")
            sync_task(task, args)

    from datetime import datetime

    for task_name in config.list_tasks():
        task = config.get_task(task_name)
        if task and task.schedule:
            try:
                scheduler.add_job(task_name, task.schedule, lambda tn=task_name: run_task(tn))
                next_run = scheduler.get_next_run(task_name)
                print(f"  {task_name}: scheduled, next run at {next_run}")
            except Exception as e:
                print(f"  {task_name}: failed to schedule - {e}", file=sys.stderr)

    if not scheduler.list_jobs():
        print("No scheduled tasks found")
        return 1

    def signal_handler(sig, frame):
        print("\nStopping daemon...")
        scheduler.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("Daemon is running. Press Ctrl+C to stop.")
    scheduler.run_continuously(interval=60)

    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        scheduler.stop()

    return 0

def main():
    import time

    parser = argparse.ArgumentParser(
        description='FileSync - Cross-platform file synchronization tool',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument('-c', '--config', default=None,
                        help='Path to configuration file')

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    sync_parser = subparsers.add_parser('sync', help='Run synchronization')
    sync_parser.add_argument('task_name', nargs='?', help='Task name to sync')
    sync_parser.add_argument('-n', '--dry-run', action='store_true',
                             help='Perform a trial run without making changes')
    sync_parser.add_argument('--force', action='store_true',
                             help='Force synchronization ignoring conflicts')
    sync_parser.add_argument('-v', '--verbose', action='store_true',
                             help='Verbose output')

    list_parser = subparsers.add_parser('list', help='List configured tasks')

    status_parser = subparsers.add_parser('status', help='Show task status')

    validate_parser = subparsers.add_parser('validate', help='Validate configuration')

    daemon_parser = subparsers.add_parser('daemon', help='Run as daemon for scheduled sync')
    daemon_parser.add_argument('-v', '--verbose', action='store_true',
                               help='Verbose output')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    commands = {
        'sync': cmd_sync,
        'list': cmd_list,
        'status': cmd_status,
        'validate': cmd_validate,
        'daemon': cmd_daemon
    }

    if args.command in commands:
        return commands[args.command](args)
    else:
        print(f"Unknown command: {args.command}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
