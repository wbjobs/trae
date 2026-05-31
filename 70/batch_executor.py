import concurrent.futures
from typing import Dict, List, Any, Optional, Callable
from remote_connector import SSHConnector


class BatchExecutor:
    def __init__(self, nodes: List[Dict[str, Any]], ssh_defaults: Dict[str, Any] = None):
        self.nodes = nodes
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

    def _check_permission_error(self, stderr: str) -> Optional[str]:
        permission_errors = [
            ('permission denied', '权限不足，需要sudo或root权限'),
            ('operation not permitted', '操作不允许，权限不足'),
            ('sudo: no tty present', '需要sudo权限，但无终端交互'),
            ('password is required', '需要sudo密码'),
            ('not in sudoers', '用户不在sudoers列表中'),
            ('access denied', '访问被拒绝'),
            ('eacces', '权限不足 (EACCES)'),
            ('eperm', '操作不允许 (EPERM)'),
        ]
        
        stderr_lower = stderr.lower()
        for error_keyword, error_msg in permission_errors:
            if error_keyword in stderr_lower:
                return error_msg
        
        return None

    def _prepare_command(self, cmd: str, use_sudo: bool, 
                        sudo_password: str = None) -> str:
        if not use_sudo:
            return cmd
        
        if sudo_password:
            return f"echo '{sudo_password}' | sudo -S -p '' {cmd}"
        else:
            return f"sudo -n {cmd}"

    def _check_sudo_available(self, ssh: SSHConnector) -> bool:
        success, stdout, stderr = ssh.execute_command('which sudo', timeout=5)
        return success

    def execute_on_node(self, node: Dict[str, Any], commands: List[str],
                       timeout: int = 30, silent: bool = False,
                       use_sudo: bool = False, sudo_password: str = None) -> Dict[str, Any]:
        node_name = node.get('name', node.get('host', 'unknown'))
        node_sudo = node.get('use_sudo', use_sudo)
        node_sudo_password = node.get('sudo_password', sudo_password)
        
        result = {
            'node': node_name,
            'host': node.get('host', ''),
            'status': 'unknown',
            'os_type': 'unknown',
            'sudo_available': False,
            'commands': [],
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
        result['sudo_available'] = self._check_sudo_available(ssh)
        
        for cmd in commands:
            cmd_to_execute = self._prepare_command(cmd, node_sudo, node_sudo_password)
            
            cmd_result = {
                'command': cmd,
                'executed_command': cmd_to_execute,
                'success': False,
                'stdout': '',
                'stderr': '',
                'exit_code': -1,
                'permission_error': None
            }
            
            try:
                success, stdout, stderr = ssh.execute_command(cmd_to_execute, timeout)
                cmd_result['success'] = success
                cmd_result['stdout'] = stdout
                cmd_result['stderr'] = stderr
                cmd_result['exit_code'] = 0 if success else 1
                
                if not success:
                    perm_error = self._check_permission_error(stderr)
                    if perm_error:
                        cmd_result['permission_error'] = perm_error
                
                if not silent:
                    if success:
                        print(f"  [{node_name}] ✓ {cmd[:50]}...")
                    else:
                        if cmd_result['permission_error']:
                            print(f"  [{node_name}] ✗ {cmd[:50]}... - {cmd_result['permission_error']}")
                        else:
                            print(f"  [{node_name}] ✗ {cmd[:50]}...")
            
            except Exception as e:
                cmd_result['stderr'] = str(e)
                perm_error = self._check_permission_error(str(e))
                if perm_error:
                    cmd_result['permission_error'] = perm_error
                if not silent:
                    if cmd_result['permission_error']:
                        print(f"  [{node_name}] ✗ {cmd[:50]}... - {cmd_result['permission_error']}")
                    else:
                        print(f"  [{node_name}] ✗ {cmd[:50]}... - {str(e)}")
            
            result['commands'].append(cmd_result)
        
        ssh.close()
        return result

    def execute_all(self, commands: List[str], parallel: bool = True,
                   max_workers: int = 10, timeout: int = 30,
                   silent: bool = False, use_sudo: bool = False,
                   sudo_password: str = None) -> List[Dict[str, Any]]:
        self.results = []
        
        if not silent:
            sudo_str = " (sudo模式)" if use_sudo else ""
            print(f"\n开始在 {len(self.nodes)} 个节点上执行 {len(commands)} 条命令{sudo_str}...")
        
        if parallel and len(self.nodes) > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {
                    executor.submit(
                        self.execute_on_node, node, commands, timeout, silent,
                        use_sudo, sudo_password
                    ): node for node in self.nodes
                }
                for future in concurrent.futures.as_completed(future_to_node):
                    result = future.result()
                    self.results.append(result)
        else:
            for node in self.nodes:
                result = self.execute_on_node(node, commands, timeout, silent,
                                             use_sudo, sudo_password)
                self.results.append(result)
        
        if not silent:
            self._print_execution_summary()
        
        return self.results

    def execute_with_callback(self, commands: List[str],
                            callback: Callable[[Dict[str, Any]], None],
                            parallel: bool = True, max_workers: int = 10,
                            timeout: int = 30, use_sudo: bool = False,
                            sudo_password: str = None) -> List[Dict[str, Any]]:
        self.results = []
        
        if parallel and len(self.nodes) > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {
                    executor.submit(
                        self.execute_on_node, node, commands, timeout, True,
                        use_sudo, sudo_password
                    ): node for node in self.nodes
                }
                for future in concurrent.futures.as_completed(future_to_node):
                    result = future.result()
                    callback(result)
                    self.results.append(result)
        else:
            for node in self.nodes:
                result = self.execute_on_node(node, commands, timeout, True,
                                             use_sudo, sudo_password)
                callback(result)
                self.results.append(result)
        
        return self.results

    def _print_execution_summary(self) -> None:
        total_nodes = len(self.results)
        successful_nodes = sum(1 for r in self.results if r['status'] == 'success')
        failed_nodes = total_nodes - successful_nodes
        
        total_cmds = 0
        successful_cmds = 0
        failed_cmds = 0
        
        for node_result in self.results:
            for cmd in node_result.get('commands', []):
                total_cmds += 1
                if cmd['success']:
                    successful_cmds += 1
                else:
                    failed_cmds += 1
        
        print(f"\n执行完成:")
        print(f"  节点: {successful_nodes}/{total_nodes} 成功")
        print(f"  命令: {successful_cmds}/{total_cmds} 成功")

    def get_summary(self) -> Dict[str, Any]:
        total_nodes = len(self.results)
        successful_nodes = sum(1 for r in self.results if r['status'] == 'success')
        failed_nodes = total_nodes - successful_nodes
        
        total_cmds = 0
        successful_cmds = 0
        failed_cmds = 0
        
        for node_result in self.results:
            for cmd in node_result.get('commands', []):
                total_cmds += 1
                if cmd['success']:
                    successful_cmds += 1
                else:
                    failed_cmds += 1
        
        return {
            'total_nodes': total_nodes,
            'successful_nodes': successful_nodes,
            'failed_nodes': failed_nodes,
            'total_commands': total_cmds,
            'successful_commands': successful_cmds,
            'failed_commands': failed_cmds,
            'details': self.results
        }

    def get_failed_commands(self) -> List[Dict[str, Any]]:
        failed = []
        for node_result in self.results:
            for cmd in node_result.get('commands', []):
                if not cmd['success']:
                    failed.append({
                        'node': node_result['node'],
                        'host': node_result['host'],
                        'command': cmd['command'],
                        'stderr': cmd['stderr'],
                        'permission_error': cmd.get('permission_error')
                    })
        return failed

    def get_permission_errors(self) -> List[Dict[str, Any]]:
        perm_errors = []
        for node_result in self.results:
            for cmd in node_result.get('commands', []):
                if cmd.get('permission_error'):
                    perm_errors.append({
                        'node': node_result['node'],
                        'host': node_result['host'],
                        'command': cmd['command'],
                        'permission_error': cmd['permission_error'],
                        'sudo_available': node_result.get('sudo_available', False)
                    })
        return perm_errors

    def get_successful_outputs(self) -> List[Dict[str, Any]]:
        outputs = []
        for node_result in self.results:
            for cmd in node_result.get('commands', []):
                if cmd['success'] and cmd['stdout']:
                    outputs.append({
                        'node': node_result['node'],
                        'host': node_result['host'],
                        'command': cmd['command'],
                        'stdout': cmd['stdout']
                    })
        return outputs
