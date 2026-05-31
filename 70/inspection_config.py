import yaml
import json
from typing import Dict, List, Any, Optional


class InspectionConfig:
    def __init__(self, config_path: str = ""):
        self.config_path = config_path
        self.config: Dict[str, Any] = {}
        if config_path:
            self.load_config(config_path)

    def load_config(self, config_path: str) -> bool:
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                if config_path.endswith('.yaml') or config_path.endswith('.yml'):
                    self.config = yaml.safe_load(f)
                elif config_path.endswith('.json'):
                    self.config = json.load(f)
                else:
                    self.config = yaml.safe_load(f)
            return True
        except Exception as e:
            print(f"加载配置文件失败: {str(e)}")
            return False

    def get_nodes(self) -> List[Dict[str, Any]]:
        return self.config.get('nodes', [])

    def get_node_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        for node in self.get_nodes():
            if node.get('name') == name:
                return node
        return None

    def get_services(self) -> List[Dict[str, Any]]:
        return self.config.get('services', [])

    def get_log_paths(self) -> List[Dict[str, Any]]:
        return self.config.get('log_paths', [])

    def get_commands(self) -> List[Dict[str, Any]]:
        return self.config.get('commands', [])

    def get_inspection_rules(self) -> Dict[str, Any]:
        return self.config.get('inspection_rules', {})

    def get_output_config(self) -> Dict[str, Any]:
        return self.config.get('output', {})

    def get_ssh_defaults(self) -> Dict[str, Any]:
        return self.config.get('ssh_defaults', {
            'port': 22,
            'timeout': 10,
            'username': '',
            'password': '',
            'key_file': ''
        })


OS_COMMANDS = {
    'linux': {
        'check_process': 'ps aux | grep -v grep | grep "{process}"',
        'check_service_systemd': 'systemctl is-active {service}',
        'check_service_sysv': 'service {service} status',
        'check_port': 'netstat -tlnp 2>/dev/null || ss -tlnp | grep ":{port}"',
        'check_disk': 'df -h',
        'check_memory': 'free -h',
        'check_cpu': 'top -bn1 | grep "Cpu(s)"',
        'check_uptime': 'uptime',
        'check_hostname': 'hostname',
        'check_kernel': 'uname -r',
        'count_log_keyword': 'grep -c "{keyword}" {log_path} 2>/dev/null || echo 0',
        'tail_log': 'tail -n {lines} {log_path} 2>/dev/null',
        'find_logs_by_time': 'find {log_dir} -name "{pattern}" -type f -mmin -{minutes} 2>/dev/null',
        'grep_log': 'grep "{keyword}" {log_path} 2>/dev/null | tail -n {lines}',
    },
    'windows': {
        'check_process': 'tasklist /FI "IMAGENAME eq {process}" 2>NUL',
        'check_service': 'sc query {service} | findstr STATE',
        'check_port': 'netstat -ano | findstr ":{port}"',
        'check_disk': 'wmic logicaldisk get size,freespace,caption',
        'check_memory': 'systeminfo | findstr /C:"Total Physical Memory" /C:"Available Physical Memory"',
        'check_cpu': 'wmic cpu get loadpercentage',
        'check_uptime': 'systeminfo | findstr "System Boot Time"',
        'check_hostname': 'hostname',
        'check_os_version': 'ver',
        'count_log_keyword': 'find /c "{keyword}" "{log_path}" 2>NUL || echo 0',
        'tail_log': 'powershell -Command "Get-Content \\"{log_path}\\" -Tail {lines} 2>$null"',
        'find_logs_by_time': 'powershell -Command "Get-ChildItem \\"{log_dir}\\" -Filter \\"{pattern}\\" -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-{minutes}) } | Select-Object -ExpandProperty FullName"',
        'grep_log': 'powershell -Command "Get-Content \\"{log_path}\\" | Select-String \\"{keyword}\\" | Select-Object -Last {lines} | ForEach-Object { $_.Line }"',
    }
}


def get_os_command(os_type: str, command_name: str, **kwargs) -> str:
    os_cmds = OS_COMMANDS.get(os_type, {})
    cmd_template = os_cmds.get(command_name, '')
    return cmd_template.format(**kwargs) if cmd_template else ''


DEFAULT_INSPECTION_RULES = {
    'node_detection': {
        'ping_timeout': 3,
        'ssh_timeout': 5,
        'check_ssh_port': True,
    },
    'service_check': {
        'check_process': True,
        'check_port': True,
        'check_systemd': True,
    },
    'log_capture': {
        'default_tail_lines': 100,
        'max_log_size_mb': 50,
        'include_stacktrace': True,
    },
    'command_execution': {
        'default_timeout': 30,
        'parallel': True,
        'max_workers': 10,
    }
}
