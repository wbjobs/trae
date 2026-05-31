import json
import os
from pathlib import Path
from typing import Dict, Any, Optional


class ConfigManager:
    _instance = None
    _config: Dict[str, Any] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load_default_config()
        return cls._instance

    def _load_default_config(self):
        self._config = {
            "app": {
                "name": "Industrial Config Studio",
                "version": "1.0.0",
                "theme": "dark",
                "language": "zh_CN"
            },
            "communication": {
                "default_timeout": 5000,
                "retry_count": 3,
                "poll_interval": 1000,
                "max_connections": 10
            },
            "project": {
                "auto_save": True,
                "auto_save_interval": 60,
                "backup_enabled": True,
                "backup_count": 5
            },
            "security": {
                "encryption_algorithm": "AES-256",
                "password_hashing": "SHA-256",
                "require_password": False
            },
            "paths": {
                "project_dir": "",
                "backup_dir": "",
                "log_dir": "",
                "temp_dir": ""
            }
        }
        self._load_user_config()

    def _load_user_config(self):
        config_file = self._get_config_path()
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                    self._merge_config(self._config, user_config)
            except Exception as e:
                print(f"Load config error: {e}")

    def _get_config_path(self) -> Path:
        if os.name == 'nt':
            base_dir = Path(os.environ.get('APPDATA', Path.home()))
        else:
            base_dir = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
        config_dir = base_dir / "IndustrialConfigStudio"
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "config.json"

    def _merge_config(self, base: Dict, override: Dict):
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value

    def save_config(self):
        config_file = self._get_config_path()
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Save config error: {e}")

    def get(self, key: str, default: Any = None) -> Any:
        keys = key.split('.')
        value = self._config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

    def set(self, key: str, value: Any):
        keys = key.split('.')
        config = self._config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value
        self.save_config()
