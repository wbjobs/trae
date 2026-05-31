import yaml
import os
from typing import List, Dict, Any, Optional

class RemoteConfig:
    def __init__(self, data: Dict[str, Any]):
        self.host = data.get('host', '')
        self.port = data.get('port', 22)
        self.username = data.get('username', '')
        self.auth_method = data.get('auth_method', 'key_file')
        self.password = data.get('password', '')
        self.key_file = data.get('key_file', '')

    def to_dict(self) -> Dict[str, Any]:
        return {
            'host': self.host,
            'port': self.port,
            'username': self.username,
            'auth_method': self.auth_method,
            'password': self.password,
            'key_file': self.key_file
        }

class SyncTask:
    def __init__(self, data: Dict[str, Any]):
        self.name = data.get('name', '')
        self.local_path = data.get('local_path', '')
        self.remote_path = data.get('remote_path', '')
        self.remote_config = RemoteConfig(data.get('remote', {}))
        self.direction = data.get('direction', 'bidirectional')
        self.conflict_resolution = data.get('conflict_resolution', 'newer_wins')
        self.merge_strategy = data.get('merge_strategy', 'line_by_line')
        self.ignore_patterns = data.get('ignore_patterns', [])
        self.max_file_size = data.get('max_file_size', '')
        self.exclude_hidden = data.get('exclude_hidden', False)
        self.schedule = data.get('schedule', '')
        self.generate_report = data.get('generate_report', True)
        self.report_path = data.get('report_path', '')
        self.conflict_backup = data.get('conflict_backup', False)
        self.text_file_extensions = data.get('text_file_extensions', [
            '.txt', '.md', '.json', '.xml', '.yaml', '.yml',
            '.html', '.css', '.js', '.ts', '.py', '.go',
            '.java', '.c', '.cpp', '.h', '.sh', '.bat'
        ])

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'local_path': self.local_path,
            'remote_path': self.remote_path,
            'remote_config': self.remote_config.to_dict(),
            'direction': self.direction,
            'conflict_resolution': self.conflict_resolution,
            'merge_strategy': self.merge_strategy,
            'ignore_patterns': self.ignore_patterns,
            'max_file_size': self.max_file_size,
            'exclude_hidden': self.exclude_hidden,
            'schedule': self.schedule,
            'generate_report': self.generate_report,
            'report_path': self.report_path,
            'conflict_backup': self.conflict_backup,
            'text_file_extensions': self.text_file_extensions
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict())

class Config:
    def __init__(self, data: Dict[str, Any]):
        self.version = data.get('version', '1.0')
        self.tasks: List[SyncTask] = [SyncTask(t) for t in data.get('tasks', [])]

    @staticmethod
    def load_from_file(file_path: str) -> 'Config':
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Config file not found: {file_path}")

        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        return Config(data)

    @staticmethod
    def load_from_string(yaml_str: str) -> 'Config':
        data = yaml.safe_load(yaml_str)
        return Config(data)

    def get_task(self, name: str) -> Optional[SyncTask]:
        for task in self.tasks:
            if task.name == name:
                return task
        return None

    def list_tasks(self) -> List[str]:
        return [task.name for task in self.tasks]

    def validate(self) -> List[str]:
        errors = []

        if self.version != '1.0':
            errors.append(f"Unsupported config version: {self.version}")

        for task in self.tasks:
            if not task.name:
                errors.append("Task missing required field: name")
            if not task.local_path:
                errors.append(f"Task '{task.name}' missing required field: local_path")
            if not task.remote_path:
                errors.append(f"Task '{task.name}' missing required field: remote_path")
            if not task.remote_config.host:
                errors.append(f"Task '{task.name}' missing required field: remote.host")
            if not task.remote_config.username:
                errors.append(f"Task '{task.name}' missing required field: remote.username")
            if task.direction not in ['local_to_remote', 'remote_to_local', 'bidirectional']:
                errors.append(f"Task '{task.name}' has invalid direction: {task.direction}")
            if task.conflict_resolution not in ['newer_wins', 'local_wins', 'remote_wins', 'ask', 'skip', 'auto_merge', 'keep_both', 'manual']:
                errors.append(f"Task '{task.name}' has invalid conflict_resolution: {task.conflict_resolution}")
            if task.merge_strategy not in ['local_first', 'remote_first', 'line_by_line']:
                errors.append(f"Task '{task.name}' has invalid merge_strategy: {task.merge_strategy}")

        return errors

def load_config(file_path: str = None) -> Config:
    if file_path is None:
        file_path = os.path.join(os.getcwd(), 'config', 'sync.yaml')

    return Config.load_from_file(file_path)

def create_sample_config(file_path: str):
    sample_config = {
        'version': '1.0',
        'tasks': [
            {
                'name': 'example-sync',
                'local_path': '/local/path',
                'remote_path': '/remote/path',
                'remote': {
                    'host': 'example.com',
                    'port': 22,
                    'username': 'user',
                    'auth_method': 'key_file',
                    'key_file': '~/.ssh/id_rsa'
                },
                'direction': 'bidirectional',
                'conflict_resolution': 'auto_merge',
                'merge_strategy': 'line_by_line',
                'ignore_patterns': ['*.tmp', '*.log', '.git'],
                'exclude_hidden': False,
                'generate_report': True,
                'report_path': '',
                'conflict_backup': True,
                'text_file_extensions': ['.txt', '.md', '.json', '.py', '.js']
            }
        ]
    }

    with open(file_path, 'w', encoding='utf-8') as f:
        yaml.dump(sample_config, f, default_flow_style=False, sort_keys=False)
