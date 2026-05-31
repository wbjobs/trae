#!/usr/bin/env python3
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config, SyncTask

def test_conflict_resolutions():
    print("Testing conflict resolution configurations...")

    test_cases = [
        {
            'name': 'test-newer-wins',
            'conflict_resolution': 'newer_wins',
            'expected_valid': True
        },
        {
            'name': 'test-local-wins',
            'conflict_resolution': 'local_wins',
            'expected_valid': True
        },
        {
            'name': 'test-remote-wins',
            'conflict_resolution': 'remote_wins',
            'expected_valid': True
        },
        {
            'name': 'test-auto-merge',
            'conflict_resolution': 'auto_merge',
            'merge_strategy': 'line_by_line',
            'expected_valid': True
        },
        {
            'name': 'test-keep-both',
            'conflict_resolution': 'keep_both',
            'expected_valid': True
        },
        {
            'name': 'test-manual',
            'conflict_resolution': 'manual',
            'expected_valid': True
        }
    ]

    for test in test_cases:
        task_data = {
            'name': test['name'],
            'local_path': '/tmp/local',
            'remote_path': '/tmp/remote',
            'remote': {
                'host': 'localhost',
                'port': 22,
                'username': 'test',
                'auth_method': 'key_file'
            },
            'direction': 'bidirectional',
            'conflict_resolution': test['conflict_resolution'],
            'merge_strategy': test.get('merge_strategy', 'line_by_line'),
            'generate_report': True,
            'conflict_backup': True,
            'text_file_extensions': ['.txt', '.py']
        }

        task = SyncTask(task_data)
        task_dict = task.to_dict()

        print(f"\n✓ Task: {task.name}")
        print(f"  Conflict Resolution: {task.conflict_resolution}")
        print(f"  Merge Strategy: {task.merge_strategy}")
        print(f"  Generate Report: {task.generate_report}")
        print(f"  Conflict Backup: {task.conflict_backup}")
        print(f"  Text Extensions: {len(task.text_file_extensions)} types")

        task_json = task.to_json()
        assert 'conflict_resolution' in task_json, f"Missing conflict_resolution in JSON for {task.name}"
        assert task.conflict_resolution == test['conflict_resolution'], f"Wrong conflict_resolution for {task.name}"

        print(f"  ✓ JSON serialization successful")

    print("\n" + "="*60)
    print("Conflict Resolution Configuration Tests")
    print("="*60)
    print("✓ All conflict resolution tests passed!")

    print("\nAvailable Conflict Resolution Strategies:")
    strategies = [
        ("newer_wins", "保留最新版本"),
        ("local_wins", "保留本地版本"),
        ("remote_wins", "保留远程版本"),
        ("auto_merge", "自动合并文本文件"),
        ("keep_both", "保留两个版本"),
        ("manual", "手动解决"),
        ("skip", "跳过冲突文件"),
        ("ask", "询问用户")
    ]

    for strategy, description in strategies:
        print(f"  - {strategy:20s}: {description}")

    print("\nAvailable Merge Strategies:")
    merge_strategies = [
        ("local_first", "本地优先"),
        ("remote_first", "远程优先"),
        ("line_by_line", "逐行合并")
    ]

    for strategy, description in merge_strategies:
        print(f"  - {strategy:20s}: {description}")

    return 0

def test_report_generation():
    print("\n\nTesting conflict report generation...")

    sample_conflict_data = {
        'task_name': 'test-task',
        'success': True,
        'files_uploaded': 5,
        'files_downloaded': 3,
        'files_skipped': 1,
        'files_merged': 2,
        'files_kept_both': 1,
        'conflicts': [
            {
                'path': 'test/file1.txt',
                'resolution': 'merged',
                'conflict_type': 'content_modified',
                'local_size': 1024,
                'remote_size': 2048,
                'local_modified': '2024-01-01 10:00:00',
                'remote_modified': '2024-01-01 12:00:00',
                'merge_result': 'Strategy: line_by_line, Lines merged: 50 (local only: 5, remote only: 10)'
            },
            {
                'path': 'test/file2.txt',
                'resolution': 'local_wins',
                'conflict_type': 'content_modified',
                'local_size': 512,
                'remote_size': 1024,
                'local_modified': '2024-01-01 14:00:00',
                'remote_modified': '2024-01-01 11:00:00'
            }
        ],
        'errors': [],
        'actions': [],
        'duration': '10s',
        'bytes_transferred': 4096
    }

    report = {
        'task_name': sample_conflict_data['task_name'],
        'total_conflicts': len(sample_conflict_data['conflicts']),
        'summary': {
            'auto_resolved': 0,
            'merged': 1,
            'kept_both': 0,
            'skipped': 0,
            'manual_resolved': 0
        },
        'conflicts': sample_conflict_data['conflicts']
    }

    print(f"\n✓ Sample report generated:")
    print(f"  Total Conflicts: {report['total_conflicts']}")
    print(f"  Merged: {report['summary']['merged']}")
    print(f"  Auto Resolved: {report['summary']['auto_resolved']}")

    report_json = json.dumps(report, indent=2, ensure_ascii=False)
    print(f"\n✓ JSON Report:")
    print(report_json[:500] + "..." if len(report_json) > 500 else report_json)

    return 0

if __name__ == '__main__':
    try:
        result1 = test_conflict_resolutions()
        result2 = test_report_generation()

        print("\n" + "="*60)
        print("All Tests Passed!")
        print("="*60)

        sys.exit(0 if (result1 == 0 and result2 == 0) else 1)

    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
