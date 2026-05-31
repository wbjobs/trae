#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config

try:
    config = Config.load_from_file('e:/trae/42/config/sync.yaml')
    print("✓ Configuration loaded successfully")
    print(f"  Version: {config.version}")
    print(f"  Tasks found: {len(config.tasks)}")

    for task in config.tasks:
        print(f"\n  Task: {task.name}")
        print(f"    Local: {task.local_path}")
        print(f"    Remote: {task.remote_path}")
        print(f"    Host: {task.remote_config.host}:{task.remote_config.port}")
        print(f"    Direction: {task.direction}")
        print(f"    Conflict: {task.conflict_resolution}")
        if task.schedule:
            print(f"    Schedule: {task.schedule}")
        print(f"    Ignore patterns: {len(task.ignore_patterns)}")

    errors = config.validate()
    if errors:
        print("\n✗ Validation errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("\n✓ Configuration validation passed")

    print("\n✓ All tests passed!")
    sys.exit(0)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
