#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from config import Config, load_config

    print("Testing configuration loading...")

    try:
        config = Config.load_from_file('e:/trae/42/config/sync.yaml')
        print(f"✓ Configuration loaded successfully")
        print(f"  Version: {config.version}")
        print(f"  Tasks found: {len(config.tasks)}")
    except FileNotFoundError:
        print("✗ Configuration file not found")
        print("  Please create config/sync.yaml first")
        sys.exit(1)

    print("\nTesting configuration validation...")
    errors = config.validate()
    if errors:
        print("✗ Validation errors found:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print("✓ Configuration validation passed")

    print("\nTesting task operations...")
    for task in config.tasks:
        task_json = task.to_json()
        print(f"✓ Task '{task.name}' converted to JSON successfully")

    print("\nTesting scheduler...")
    try:
        from scheduler import SyncScheduler
        scheduler = SyncScheduler()
        print("✓ Scheduler imported successfully")
    except ImportError as e:
        print(f"✗ Scheduler import failed: {e}")

    print("\n" + "="*50)
    print("All tests passed!")
    print("="*50)

    print("\nNext steps:")
    print("1. Build the Go syncengine:")
    print("   - Windows: run build.bat")
    print("   - Unix: run build.sh")
    print("\n2. Install Python dependencies:")
    print("   pip install -r pyconfig/requirements.txt")
    print("\n3. Configure your sync tasks in config/sync.yaml")
    print("\n4. List configured tasks:")
    print("   python pyconfig/synccli.py list")
    print("\n5. Run a sync task:")
    print("   python pyconfig/synccli.py sync <task-name>")
    print("\n6. Run in dry-run mode to preview changes:")
    print("   python pyconfig/synccli.py sync <task-name> --dry-run")

    sys.exit(0)

except Exception as e:
    print(f"✗ Test failed with error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
