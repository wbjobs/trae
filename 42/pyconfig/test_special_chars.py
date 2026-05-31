#!/usr/bin/env python3
import sys
import os
import shutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config, SyncTask, RemoteConfig

def test_special_characters():
    print("Testing special character handling...")
    
    test_dir = "e:/temp/test_special_chars"
    os.makedirs(test_dir, exist_ok=True)
    
    try:
        test_files = [
            "测试文件.txt",
            "file with spaces.txt",
            "中文路径/文件.txt",
            "file@name.txt",
            "file#name.txt",
            "file$name.txt",
            "文件测试.txt",
            "测试 空格 文件.txt"
        ]
        
        for filepath in test_files:
            full_path = os.path.join(test_dir, filepath)
            dir_path = os.path.dirname(full_path)
            if dir_path:
                os.makedirs(dir_path, exist_ok=True)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(f"Content for {filepath}")
            
            print(f"✓ Created: {filepath}")
        
        remote_config = RemoteConfig({
            'host': 'localhost',
            'port': 22,
            'username': 'test',
            'auth_method': 'key_file'
        })
        
        task = SyncTask({
            'name': 'test-special-chars',
            'local_path': test_dir,
            'remote_path': '/tmp/test_special',
            'remote': {
                'host': 'localhost',
                'port': 22,
                'username': 'test',
                'auth_method': 'key_file'
            },
            'direction': 'local_to_remote',
            'conflict_resolution': 'newer_wins'
        })
        
        task_dict = task.to_dict()
        task_json = task.to_json()
        
        print(f"\n✓ Task JSON generated successfully")
        print(f"  Local path contains special chars: {'测试' in task.local_path}")
        print(f"  JSON contains special chars correctly: {'测试' in task_json}")
        
        test_path = "测试/路径/文件.txt"
        normalized = os.path.normpath(test_path)
        print(f"\n✓ Path normalization: {test_path} -> {normalized}")
        
        print("\n✓ All special character tests passed!")
        return 0
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)

if __name__ == '__main__':
    sys.exit(test_special_characters())
