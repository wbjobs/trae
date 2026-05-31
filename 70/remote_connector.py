import paramiko
import socket
import time
from typing import Optional, Tuple, Dict, Any


class SSHConnector:
    def __init__(self, host: str, port: int = 22, username: str = "", 
                 password: str = "", key_file: str = "", timeout: int = 10):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.key_file = key_file
        self.timeout = timeout
        self.client: Optional[paramiko.SSHClient] = None
        self.os_type: Optional[str] = None

    def connect(self) -> Tuple[bool, str]:
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if self.key_file:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.key_file,
                    timeout=self.timeout,
                    banner_timeout=self.timeout
                )
            else:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=self.timeout,
                    banner_timeout=self.timeout
                )
            
            self._detect_os()
            return True, "连接成功"
        except paramiko.AuthenticationException:
            return False, "认证失败"
        except paramiko.SSHException as e:
            return False, f"SSH异常: {str(e)}"
        except socket.timeout:
            return False, "连接超时"
        except Exception as e:
            return False, f"连接异常: {str(e)}"

    def _detect_os(self) -> None:
        if not self.client:
            return
        
        commands = {
            "linux": "uname -s",
            "windows": "ver"
        }
        
        for os_type, cmd in commands.items():
            try:
                stdin, stdout, stderr = self.client.exec_command(cmd, timeout=5)
                output = stdout.read().decode().strip().lower()
                if output:
                    if "linux" in output:
                        self.os_type = "linux"
                    elif "windows" in output:
                        self.os_type = "windows"
                    break
            except:
                continue

    def execute_command(self, command: str, timeout: int = 30, 
                       read_buffer_size: int = 4096) -> Tuple[bool, str, str]:
        if not self.client:
            return False, "", "未建立连接"
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
            
            stdout_chunks = []
            stderr_chunks = []
            
            while not stdout.channel.exit_status_ready():
                if stdout.channel.recv_ready():
                    chunk = stdout.channel.recv(read_buffer_size)
                    stdout_chunks.append(chunk)
                if stderr.channel.recv_stderr_ready():
                    chunk = stderr.channel.recv_stderr(read_buffer_size)
                    stderr_chunks.append(chunk)
            
            while stdout.channel.recv_ready():
                chunk = stdout.channel.recv(read_buffer_size)
                stdout_chunks.append(chunk)
            while stderr.channel.recv_stderr_ready():
                chunk = stderr.channel.recv_stderr(read_buffer_size)
                stderr_chunks.append(chunk)
            
            exit_status = stdout.channel.recv_exit_status()
            
            stdout_output = b''.join(stdout_chunks).decode('utf-8', errors='ignore')
            stderr_output = b''.join(stderr_chunks).decode('utf-8', errors='ignore')
            
            if exit_status == 0:
                return True, stdout_output, stderr_output
            else:
                return False, stdout_output, stderr_output
        except paramiko.SSHException as e:
            return False, "", f"SSH执行异常: {str(e)}"
        except socket.timeout:
            return False, "", "执行超时"
        except Exception as e:
            return False, "", f"执行异常: {str(e)}"

    def execute_commands(self, commands: list, timeout: int = 30) -> list:
        results = []
        for cmd in commands:
            success, stdout, stderr = self.execute_command(cmd, timeout)
            results.append({
                "command": cmd,
                "success": success,
                "stdout": stdout,
                "stderr": stderr
            })
        return results

    def transfer_file(self, local_path: str, remote_path: str) -> Tuple[bool, str]:
        if not self.client:
            return False, "未建立连接"
        
        try:
            sftp = self.client.open_sftp()
            sftp.put(local_path, remote_path)
            sftp.close()
            return True, "文件传输成功"
        except Exception as e:
            return False, f"文件传输失败: {str(e)}"

    def download_file(self, remote_path: str, local_path: str) -> Tuple[bool, str]:
        if not self.client:
            return False, "未建立连接"
        
        try:
            sftp = self.client.open_sftp()
            sftp.get(remote_path, local_path)
            sftp.close()
            return True, "文件下载成功"
        except Exception as e:
            return False, f"文件下载失败: {str(e)}"

    def read_file(self, remote_path: str) -> Tuple[bool, str]:
        if not self.client:
            return False, "未建立连接"
        
        if self.os_type == "windows":
            cmd = f'type "{remote_path}"'
        else:
            cmd = f'cat "{remote_path}"'
        
        return self.execute_command(cmd)

    def close(self) -> None:
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.client = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def ping_host(host: str, port: int = 22, timeout: int = 3) -> bool:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except:
        return False
