import os
import json
import threading
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


class ConfigStore(ABC):
    def __init__(self, config_dir: str):
        self._config_dir = config_dir
        self._lock = threading.RLock()
        self._ensure_dir()

    def _ensure_dir(self) -> None:
        if not os.path.exists(self._config_dir):
            os.makedirs(self._config_dir, exist_ok=True)

    @abstractmethod
    def load(self, filename: str, default: Any = None) -> Any:
        pass

    @abstractmethod
    def save(self, filename: str, data: Any) -> bool:
        pass

    @abstractmethod
    def update(self, filename: str, key: str, value: Any) -> bool:
        pass

    @abstractmethod
    def delete(self, filename: str) -> bool:
        pass

    @abstractmethod
    def exists(self, filename: str) -> bool:
        pass

    def list_files(self, extension: str = None) -> List[str]:
        with self._lock:
            if not os.path.exists(self._config_dir):
                return []
            files = os.listdir(self._config_dir)
            if extension:
                files = [f for f in files if f.endswith(extension)]
            return sorted(files)

    def get_file_path(self, filename: str) -> str:
        return os.path.join(self._config_dir, filename)


class JsonConfigStore(ConfigStore):
    def __init__(self, config_dir: str):
        super().__init__(config_dir)

    def load(self, filename: str, default: Any = None) -> Any:
        file_path = self.get_file_path(filename)
        with self._lock:
            if not os.path.exists(file_path):
                return default
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f'Load JSON config error: {e}')
                return default

    def save(self, filename: str, data: Any) -> bool:
        file_path = self.get_file_path(filename)
        with self._lock:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return True
            except Exception as e:
                logger.error(f'Save JSON config error: {e}')
                return False

    def update(self, filename: str, key: str, value: Any) -> bool:
        data = self.load(filename, {})
        if not isinstance(data, dict):
            data = {}
        keys = key.split('.')
        current = data
        for k in keys[:-1]:
            if k not in current or not isinstance(current[k], dict):
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value
        return self.save(filename, data)

    def delete(self, filename: str) -> bool:
        file_path = self.get_file_path(filename)
        with self._lock:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    return True
                except Exception as e:
                    logger.error(f'Delete config file error: {e}')
                    return False
            return False

    def exists(self, filename: str) -> bool:
        return os.path.exists(self.get_file_path(filename))


class YamlConfigStore(ConfigStore):
    def __init__(self, config_dir: str):
        super().__init__(config_dir)
        try:
            import yaml
            self._yaml = yaml
        except ImportError:
            self._yaml = None
            logger.warning('PyYAML not available, YAML config store may not work')

    def load(self, filename: str, default: Any = None) -> Any:
        if not self._yaml:
            logger.error('PyYAML not installed')
            return default

        file_path = self.get_file_path(filename)
        with self._lock:
            if not os.path.exists(file_path):
                return default
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return self._yaml.safe_load(f)
            except Exception as e:
                logger.error(f'Load YAML config error: {e}')
                return default

    def save(self, filename: str, data: Any) -> bool:
        if not self._yaml:
            logger.error('PyYAML not installed')
            return False

        file_path = self.get_file_path(filename)
        with self._lock:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    self._yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
                return True
            except Exception as e:
                logger.error(f'Save YAML config error: {e}')
                return False

    def update(self, filename: str, key: str, value: Any) -> bool:
        data = self.load(filename, {})
        if not isinstance(data, dict):
            data = {}
        keys = key.split('.')
        current = data
        for k in keys[:-1]:
            if k not in current or not isinstance(current[k], dict):
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value
        return self.save(filename, data)

    def delete(self, filename: str) -> bool:
        file_path = self.get_file_path(filename)
        with self._lock:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    return True
                except Exception as e:
                    logger.error(f'Delete config file error: {e}')
                    return False
            return False

    def exists(self, filename: str) -> bool:
        return os.path.exists(self.get_file_path(filename))


class AppConfig:
    def __init__(self, store: ConfigStore):
        self._store = store
        self._config_filename = 'app_config.json'
        self._default_config = {
            'appearance': {
                'theme': 'light',
                'language': 'zh_CN',
                'window_size': [1024, 768],
                'window_position': [100, 100]
            },
            'behavior': {
                'auto_start': False,
                'minimize_to_tray': True,
                'show_notifications': True,
                'notification_timeout': 3000
            },
            'devices': {
                'auto_connect': True,
                'reconnect_interval': 5000,
                'connection_timeout': 10000
            },
            'scheduler': {
                'strategy': 'priority',
                'max_queue_size': 1000,
                'cleanup_interval': 3600
            },
            'advanced': {
                'log_level': 'INFO',
                'enable_debug': False,
                'cache_ttl': 300
            }
        }

    def load(self) -> Dict[str, Any]:
        config = self._store.load(self._config_filename, None)
        if config is None:
            self._store.save(self._config_filename, self._default_config)
            return dict(self._default_config)
        return self._merge_config(self._default_config, config)

    def save(self, config: Dict[str, Any]) -> bool:
        return self._store.save(self._config_filename, config)

    def get(self, key: str, default: Any = None) -> Any:
        config = self.load()
        keys = key.split('.')
        current = config
        for k in keys:
            if isinstance(current, dict) and k in current:
                current = current[k]
            else:
                return default
        return current

    def set(self, key: str, value: Any) -> bool:
        return self._store.update(self._config_filename, key, value)

    def reset(self) -> bool:
        return self._store.save(self._config_filename, self._default_config)

    def _merge_config(self, default: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(default)
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_config(result[key], value)
            else:
                result[key] = value
        return result
