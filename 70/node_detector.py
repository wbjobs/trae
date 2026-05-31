import socket
import concurrent.futures
from typing import Dict, List, Any, Optional
from remote_connector import SSHConnector, ping_host
from inspection_config import get_os_command


class NodeDetector:
    def __init__(self, nodes: List[Dict[str, Any]], ssh_defaults: Dict[str, Any] = None):
        self.nodes = nodes
        self.ssh_defaults = ssh_defaults or {}
        self.results: List[Dict[str, Any]] = []

    def detect_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        host = node.get('host', '')
        name = node.get('name', host)
        port = node.get('port', self.ssh_defaults.get('port', 22))
        username = node.get('username', self.ssh_defaults.get('username', ''))
        password = node.get('password', self.ssh_defaults.get('password', ''))
        key_file = node.get('key_file', self.ssh_defaults.get('key_file', ''))
        timeout = node.get('timeout', self.ssh_defaults.get('timeout', 10))

        result = {
            'name': name,
            'host': host,
            'port': port,
            'status': 'unknown',
            'os_type': 'unknown',
            'hostname': '',
            'uptime': '',
            'ip_address': '',
            'port_reachable': False,
            'error': ''
        }

        try:
            ip_address = socket.gethostbyname(host)
            result['ip_address'] = ip_address
        except:
            result['error'] = 'DNS解析失败'
            result['status'] = 'failed'
            return result

        port_open = ping_host(host, port, timeout=3)
        result['port_reachable'] = port_open

        ssh = SSHConnector(
            host=host,
            port=port,
            username=username,
            password=password,
            key_file=key_file,
            timeout=timeout
        )

        connected, msg = ssh.connect()
        if not connected:
            if not port_open:
                result['error'] = f'端口 {port} 不可达，SSH连接失败: {msg}'
            else:
                result['error'] = f'SSH连接失败: {msg}'
            result['status'] = 'failed'
            ssh.close()
            return result

        result['status'] = 'success'
        result['os_type'] = ssh.os_type or 'unknown'

        if ssh.os_type == 'linux':
            hostname_cmd = get_os_command('linux', 'check_hostname')
            uptime_cmd = get_os_command('linux', 'check_uptime')
        elif ssh.os_type == 'windows':
            hostname_cmd = get_os_command('windows', 'check_hostname')
            uptime_cmd = get_os_command('windows', 'check_uptime')
        else:
            hostname_cmd = 'hostname'
            uptime_cmd = 'uptime'

        success, stdout, stderr = ssh.execute_command(hostname_cmd, timeout=5)
        if success:
            result['hostname'] = stdout.strip()

        success, stdout, stderr = ssh.execute_command(uptime_cmd, timeout=5)
        if success:
            result['uptime'] = stdout.strip()

        ssh.close()
        return result

    def detect_all(self, parallel: bool = True, max_workers: int = 10) -> List[Dict[str, Any]]:
        self.results = []
        
        if parallel and len(self.nodes) > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {executor.submit(self.detect_node, node): node for node in self.nodes}
                for future in concurrent.futures.as_completed(future_to_node):
                    result = future.result()
                    self.results.append(result)
        else:
            for node in self.nodes:
                result = self.detect_node(node)
                self.results.append(result)
        
        return self.results

    def get_summary(self) -> Dict[str, Any]:
        total = len(self.results)
        success = sum(1 for r in self.results if r['status'] == 'success')
        failed = total - success
        
        os_types = {}
        for r in self.results:
            os_type = r.get('os_type', 'unknown')
            os_types[os_type] = os_types.get(os_type, 0) + 1
        
        return {
            'total': total,
            'success': success,
            'failed': failed,
            'os_types': os_types,
            'nodes': self.results
        }
