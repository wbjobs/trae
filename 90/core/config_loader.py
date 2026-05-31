import json
import yaml
import os
from typing import Dict, Any, List, Optional


class ConfigLoader:
    def __init__(self, config_dir: str = "config"):
        abs_config_dir = os.path.abspath(config_dir)
        base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
        if not abs_config_dir.startswith(base_dir):
            raise ValueError(f"配置目录必须在项目根目录下: {config_dir}")
        self.config_dir = abs_config_dir
        self._servers: List[Dict[str, Any]] = []
        self._rules: Dict[str, Any] = {}
        self._schedules: List[Dict[str, Any]] = []
        self._global: Dict[str, Any] = {}

    def load_all(self) -> None:
        self.load_servers()
        self.load_rules()
        self.load_schedules()
        self.load_global()

    def load_servers(self) -> List[Dict[str, Any]]:
        servers_file = os.path.join(self.config_dir, "servers.yaml")
        loaded_servers = []
        if os.path.exists(servers_file):
            with open(servers_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                loaded_servers = data.get("servers", [])
        else:
            servers_file = os.path.join(self.config_dir, "servers.json")
            if os.path.exists(servers_file):
                with open(servers_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    loaded_servers = data.get("servers", [])
        
        valid_servers = []
        for server in loaded_servers:
            if "host" not in server:
                continue
            server.setdefault("port", 22)
            server.setdefault("username", "")
            server.setdefault("password", "")
            server.setdefault("key_file", "")
            server.setdefault("groups", [])
            valid_servers.append(server)
        
        self._servers = valid_servers
        return self._servers

    def load_rules(self) -> Dict[str, Any]:
        rules_file = os.path.join(self.config_dir, "inspection_rules.yaml")
        if os.path.exists(rules_file):
            with open(rules_file, "r", encoding="utf-8") as f:
                self._rules = yaml.safe_load(f) or {}
        else:
            rules_file = os.path.join(self.config_dir, "inspection_rules.json")
            if os.path.exists(rules_file):
                with open(rules_file, "r", encoding="utf-8") as f:
                    self._rules = json.load(f)
        return self._rules

    def load_schedules(self) -> List[Dict[str, Any]]:
        valid_tools = ["all", "alive", "process", "disk", "log", "permission", "resource", "selfheal"]
        schedules_file = os.path.join(self.config_dir, "schedules.yaml")
        loaded_schedules = []
        if os.path.exists(schedules_file):
            with open(schedules_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                loaded_schedules = data.get("schedules", [])
        else:
            schedules_file = os.path.join(self.config_dir, "schedules.json")
            if os.path.exists(schedules_file):
                with open(schedules_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    loaded_schedules = data.get("schedules", [])
        
        valid_schedules = []
        for sched in loaded_schedules:
            if "cron" not in sched or "tool" not in sched:
                continue
            if sched["tool"] not in valid_tools:
                continue
            sched.setdefault("name", f"task_{len(valid_schedules)}")
            sched.setdefault("enabled", True)
            sched.setdefault("group", None)
            valid_schedules.append(sched)
        
        self._schedules = valid_schedules
        return self._schedules

    def load_global(self) -> Dict[str, Any]:
        global_file = os.path.join(self.config_dir, "global.yaml")
        if os.path.exists(global_file):
            with open(global_file, "r", encoding="utf-8") as f:
                self._global = yaml.safe_load(f) or {}
        else:
            global_file = os.path.join(self.config_dir, "global.json")
            if os.path.exists(global_file):
                with open(global_file, "r", encoding="utf-8") as f:
                    self._global = json.load(f)
        return self._global

    def get_servers(self, group: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self._servers:
            self.load_servers()
        if group:
            return [s for s in self._servers if group in s.get("groups", [])]
        return self._servers

    def get_rule(self, rule_name: str) -> Optional[Dict[str, Any]]:
        if not self._rules:
            self.load_rules()
        return self._rules.get(rule_name)

    def get_global(self, key: str, default: Any = None) -> Any:
        if not self._global:
            self.load_global()
        return self._global.get(key, default)

    @property
    def servers(self) -> List[Dict[str, Any]]:
        return self.get_servers()

    @property
    def rules(self) -> Dict[str, Any]:
        if not self._rules:
            self.load_rules()
        return self._rules

    @property
    def schedules(self) -> List[Dict[str, Any]]:
        if not self._schedules:
            self.load_schedules()
        return self._schedules
