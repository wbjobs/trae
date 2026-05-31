import concurrent.futures
from typing import Dict, List, Any, Optional
from remote_connector import SSHConnector
from inspection_config import get_os_command


class ServiceInspector:
    def __init__(self, nodes: List[Dict[str, Any]], services: List[Dict[str, Any]], 
                 ssh_defaults: Dict[str, Any] = None):
        self.nodes = nodes
        self.services = services
        self.ssh_defaults = ssh_defaults or {}
        self.results: List[Dict[str, Any]] = []

    def _create_ssh(self, node: Dict[str, Any]) -> SSHConnector:
        return SSHConnector(
            host=node.get('host', ''),
            port=node.get('port', self.ssh_defaults.get('port', 22)),
            username=node.get('username', self.ssh_defaults.get('username', '')),
            password=node.get('password', self.ssh_defaults.get('password', '')),
            key_file=node.get('key_file', self.ssh_defaults.get('key_file', '')),
            timeout=node.get('timeout', self.ssh_defaults.get('timeout', 10))
        )

    def _check_process(self, ssh: SSHConnector, process_name: str) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'check_process', process=process_name)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=10)
        
        result = {
            'exists': False,
            'output': stdout.strip(),
            'error': stderr.strip()
        }
        
        if success and stdout.strip():
            if os_type == 'linux':
                lines = stdout.strip().split('\n')
                valid_lines = []
                for line in lines:
                    if line.strip() and process_name.lower() in line.lower():
                        valid_lines.append(line)
                result['exists'] = len(valid_lines) > 0
                if result['exists']:
                    result['pid'] = valid_lines[0].split()[1] if len(valid_lines[0].split()) > 1 else ''
            elif os_type == 'windows':
                output_lower = stdout.lower()
                process_lower = process_name.lower()
                if process_lower in output_lower and 'no tasks' not in output_lower:
                    result['exists'] = True
        
        return result

    def _check_service(self, ssh: SSHConnector, service_name: str) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        result = {
            'running': False,
            'output': '',
            'error': ''
        }
        
        if os_type == 'linux':
            cmd = get_os_command('linux', 'check_service_systemd', service=service_name)
            success, stdout, stderr = ssh.execute_command(cmd, timeout=10)
            output_lower = stdout.strip().lower()
            if output_lower == 'active' or output_lower.startswith('active'):
                result['running'] = True
                result['output'] = stdout.strip()
            elif output_lower == 'inactive' or output_lower == 'failed':
                result['running'] = False
                result['output'] = stdout.strip()
            else:
                cmd = get_os_command('linux', 'check_service_sysv', service=service_name)
                success, stdout, stderr = ssh.execute_command(cmd, timeout=10)
                output_lower = stdout.lower()
                if success and ('is running' in output_lower or 'running' in output_lower):
                    if 'not running' not in output_lower and 'stopped' not in output_lower:
                        result['running'] = True
                        result['output'] = stdout.strip()
        elif os_type == 'windows':
            cmd = get_os_command('windows', 'check_service', service=service_name)
            success, stdout, stderr = ssh.execute_command(cmd, timeout=10)
            output_lower = stdout.lower()
            if 'running' in output_lower and 'stopped' not in output_lower:
                result['running'] = True
                result['output'] = stdout.strip()
        
        return result

    def _check_port(self, ssh: SSHConnector, port: int) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'check_port', port=port)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=10)
        
        result = {
            'listening': False,
            'output': stdout.strip(),
            'error': stderr.strip()
        }
        
        if success and stdout.strip():
            if os_type == 'linux':
                result['listening'] = f':{port}' in stdout
            elif os_type == 'windows':
                result['listening'] = f':{port}' in stdout and 'LISTENING' in stdout.upper()
        
        return result

    def inspect_node_services(self, node: Dict[str, Any]) -> Dict[str, Any]:
        node_name = node.get('name', node.get('host', 'unknown'))
        result = {
            'node': node_name,
            'host': node.get('host', ''),
            'status': 'unknown',
            'os_type': 'unknown',
            'services': [],
            'error': ''
        }
        
        ssh = self._create_ssh(node)
        connected, msg = ssh.connect()
        
        if not connected:
            result['status'] = 'failed'
            result['error'] = msg
            ssh.close()
            return result
        
        result['status'] = 'success'
        result['os_type'] = ssh.os_type or 'unknown'
        
        for service in self.services:
            service_result = {
                'name': service.get('name', ''),
                'process': service.get('process', ''),
                'port': service.get('port', 0),
                'status': 'unknown',
                'process_check': None,
                'service_check': None,
                'port_check': None,
                'error': ''
            }
            
            try:
                if service.get('process'):
                    process_result = self._check_process(ssh, service['process'])
                    service_result['process_check'] = process_result
                
                if service.get('port'):
                    port_result = self._check_port(ssh, service['port'])
                    service_result['port_check'] = port_result
                
                if service.get('service_name'):
                    service_status = self._check_service(ssh, service['service_name'])
                    service_result['service_check'] = service_status
                
                is_running = False
                if service_result.get('process_check') and service_result['process_check']['exists']:
                    is_running = True
                if service_result.get('service_check') and service_result['service_check']['running']:
                    is_running = True
                
                if service_result.get('port_check') and not service_result['port_check']['listening']:
                    if is_running:
                        service_result['status'] = 'warning'
                    else:
                        service_result['status'] = 'stopped'
                elif is_running:
                    service_result['status'] = 'running'
                else:
                    service_result['status'] = 'stopped'
            
            except Exception as e:
                service_result['error'] = str(e)
                service_result['status'] = 'error'
            
            result['services'].append(service_result)
        
        ssh.close()
        return result

    def inspect_all(self, parallel: bool = True, max_workers: int = 5) -> List[Dict[str, Any]]:
        self.results = []
        
        if parallel and len(self.nodes) > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {executor.submit(self.inspect_node_services, node): node for node in self.nodes}
                for future in concurrent.futures.as_completed(future_to_node):
                    result = future.result()
                    self.results.append(result)
        else:
            for node in self.nodes:
                result = self.inspect_node_services(node)
                self.results.append(result)
        
        return self.results

    def get_summary(self) -> Dict[str, Any]:
        total_nodes = len(self.results)
        successful_nodes = sum(1 for r in self.results if r['status'] == 'success')
        failed_nodes = total_nodes - successful_nodes
        
        total_services = 0
        running_services = 0
        stopped_services = 0
        warning_services = 0
        error_services = 0
        
        for node_result in self.results:
            for service in node_result.get('services', []):
                total_services += 1
                status = service.get('status', 'unknown')
                if status == 'running':
                    running_services += 1
                elif status == 'stopped':
                    stopped_services += 1
                elif status == 'warning':
                    warning_services += 1
                elif status == 'error':
                    error_services += 1
        
        return {
            'total_nodes': total_nodes,
            'successful_nodes': successful_nodes,
            'failed_nodes': failed_nodes,
            'total_services': total_services,
            'running_services': running_services,
            'stopped_services': stopped_services,
            'warning_services': warning_services,
            'error_services': error_services,
            'details': self.results
        }
