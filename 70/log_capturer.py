import os
import concurrent.futures
from typing import Dict, List, Any, Optional
from remote_connector import SSHConnector
from inspection_config import get_os_command


class LogCapturer:
    def __init__(self, nodes: List[Dict[str, Any]], log_paths: List[Dict[str, Any]],
                 ssh_defaults: Dict[str, Any] = None):
        self.nodes = nodes
        self.log_paths = log_paths
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

    def _tail_log(self, ssh: SSHConnector, log_path: str, lines: int = 100) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'tail_log', log_path=log_path, lines=lines)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=30)
        
        return {
            'success': success,
            'content': stdout,
            'error': stderr
        }

    def _grep_log(self, ssh: SSHConnector, log_path: str, keyword: str, 
                  lines: int = 50) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'grep_log', log_path=log_path, 
                            keyword=keyword, lines=lines)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=30)
        
        return {
            'success': success,
            'content': stdout,
            'error': stderr
        }

    def _count_keyword(self, ssh: SSHConnector, log_path: str, keyword: str) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'count_log_keyword', log_path=log_path, keyword=keyword)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=30)
        
        count = 0
        if success and stdout.strip():
            try:
                count = int(stdout.strip().split()[-1])
            except:
                pass
        
        return {
            'success': success,
            'count': count,
            'error': stderr
        }

    def _find_logs_by_time(self, ssh: SSHConnector, log_dir: str, 
                          pattern: str, minutes: int = 60) -> Dict[str, Any]:
        os_type = ssh.os_type or 'linux'
        cmd = get_os_command(os_type, 'find_logs_by_time', log_dir=log_dir, 
                            pattern=pattern, minutes=minutes)
        success, stdout, stderr = ssh.execute_command(cmd, timeout=30)
        
        files = []
        if success and stdout.strip():
            files = [f.strip() for f in stdout.strip().split('\n') if f.strip()]
        
        return {
            'success': success,
            'files': files,
            'error': stderr
        }

    def _extract_stacktrace(self, content: str, keyword: str = "") -> List[str]:
        lines = content.split('\n')
        stacktraces = []
        current_trace = []
        in_trace = False
        
        for line in lines:
            if keyword and keyword.lower() in line.lower():
                in_trace = True
                current_trace = [line]
            elif in_trace:
                if line.strip() == '' or (not line.startswith((' ', '\t', 'at', 'Caused by:', '...'))):
                    if current_trace:
                        stacktraces.append('\n'.join(current_trace))
                    current_trace = []
                    in_trace = False
                else:
                    current_trace.append(line)
        
        if current_trace:
            stacktraces.append('\n'.join(current_trace))
        
        return stacktraces

    def capture_node_logs(self, node: Dict[str, Any]) -> Dict[str, Any]:
        node_name = node.get('name', node.get('host', 'unknown'))
        result = {
            'node': node_name,
            'host': node.get('host', ''),
            'status': 'unknown',
            'os_type': 'unknown',
            'logs': [],
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
        
        for log_config in self.log_paths:
            log_path = log_config.get('path', '')
            log_type = log_config.get('type', 'tail')
            keyword = log_config.get('keyword', '')
            lines = log_config.get('lines', 100)
            
            log_result = {
                'path': log_path,
                'type': log_type,
                'keyword': keyword,
                'success': False,
                'content': '',
                'error': '',
                'error_count': 0,
                'stacktraces': []
            }
            
            try:
                if log_type == 'tail':
                    capture_result = self._tail_log(ssh, log_path, lines)
                    log_result['success'] = capture_result['success']
                    log_result['content'] = capture_result['content']
                    log_result['error'] = capture_result['error']
                elif log_type == 'grep' and keyword:
                    capture_result = self._grep_log(ssh, log_path, keyword, lines)
                    log_result['success'] = capture_result['success']
                    log_result['content'] = capture_result['content']
                    log_result['error'] = capture_result['error']
                elif log_type == 'count' and keyword:
                    count_result = self._count_keyword(ssh, log_path, keyword)
                    log_result['success'] = count_result['success']
                    log_result['error_count'] = count_result['count']
                    log_result['error'] = count_result['error']
                
                if log_result['content'] and keyword:
                    log_result['stacktraces'] = self._extract_stacktrace(
                        log_result['content'], keyword
                    )
                
            except Exception as e:
                log_result['error'] = str(e)
            
            result['logs'].append(log_result)
        
        ssh.close()
        return result

    def capture_all(self, parallel: bool = True, max_workers: int = 5) -> List[Dict[str, Any]]:
        self.results = []
        
        if parallel and len(self.nodes) > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {executor.submit(self.capture_node_logs, node): node for node in self.nodes}
                for future in concurrent.futures.as_completed(future_to_node):
                    result = future.result()
                    self.results.append(result)
        else:
            for node in self.nodes:
                result = self.capture_node_logs(node)
                self.results.append(result)
        
        return self.results

    def get_summary(self) -> Dict[str, Any]:
        total_nodes = len(self.results)
        successful_nodes = sum(1 for r in self.results if r['status'] == 'success')
        failed_nodes = total_nodes - successful_nodes
        
        total_logs = 0
        successful_logs = 0
        total_errors = 0
        total_stacktraces = 0
        
        for node_result in self.results:
            for log in node_result.get('logs', []):
                total_logs += 1
                if log['success']:
                    successful_logs += 1
                total_errors += log.get('error_count', 0)
                total_stacktraces += len(log.get('stacktraces', []))
        
        return {
            'total_nodes': total_nodes,
            'successful_nodes': successful_nodes,
            'failed_nodes': failed_nodes,
            'total_logs': total_logs,
            'successful_logs': successful_logs,
            'total_errors': total_errors,
            'total_stacktraces': total_stacktraces,
            'details': self.results
        }
