import paramiko
import socket
import time
import os
import json
import hashlib
from typing import Optional, Tuple, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import RLock
import logging

logger = logging.getLogger(__name__)


class SSHClient:
    def __init__(self, host: str, port: int = 22, username: str = "", 
                 password: str = "", key_file: str = "", timeout: int = 10):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.key_file = key_file
        self.timeout = timeout
        self.client: Optional[paramiko.SSHClient] = None
        self.connected = False

    def connect(self) -> bool:
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if self.key_file:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.key_file,
                    timeout=self.timeout
                )
            else:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=self.timeout
                )
            self.connected = True
            logger.info(f"SSH connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"SSH connection failed to {self.host}:{self.port} - {str(e)}")
            self.connected = False
            return False

    def execute(self, command: str, timeout: int = 30) -> Tuple[int, str, str]:
        if not self.connected or not self.client:
            return -1, "", "Not connected"
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
            exit_code = stdout.channel.recv_exit_status()
            output = stdout.read().decode("utf-8", errors="ignore")
            error = stderr.read().decode("utf-8", errors="ignore")
            return exit_code, output, error
        except Exception as e:
            logger.error(f"Command execution failed on {self.host} - {str(e)}")
            return -1, "", str(e)

    def sftp_upload(self, local_path: str, remote_path: str) -> bool:
        if not self.connected or not self.client:
            return False
        try:
            sftp = self.client.open_sftp()
            sftp.put(local_path, remote_path)
            sftp.close()
            return True
        except Exception as e:
            logger.error(f"SFTP upload failed to {self.host} - {str(e)}")
            return False

    def sftp_download(self, remote_path: str, local_path: str) -> bool:
        if not self.connected or not self.client:
            return False
        try:
            sftp = self.client.open_sftp()
            sftp.get(remote_path, local_path)
            sftp.close()
            return True
        except Exception as e:
            logger.error(f"SFTP download failed from {self.host} - {str(e)}")
            return False

    def close(self):
        if self.client:
            self.client.close()
            self.connected = False
            logger.info(f"SSH disconnected from {self.host}")

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class BatchSSHExecutor:
    def __init__(self, servers: List[Dict[str, Any]], max_workers: int = 10):
        self.servers = servers
        self.max_workers = max_workers
        self.results: Dict[str, Any] = {}

    def execute_on_all(self, command: str) -> Dict[str, Any]:
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_host = {}
            for server in self.servers:
                future = executor.submit(self._execute_single, server, command)
                future_to_host[future] = server["host"]
            
            for future in as_completed(future_to_host):
                host = future_to_host[future]
                try:
                    self.results[host] = future.result()
                except Exception as e:
                    self.results[host] = {
                        "success": False,
                        "error": str(e)
                    }
        return self.results

    def _execute_single(self, server: Dict[str, Any], command: str) -> Dict[str, Any]:
        ssh = SSHClient(
            host=server["host"],
            port=server.get("port", 22),
            username=server.get("username", ""),
            password=server.get("password", ""),
            key_file=server.get("key_file", "")
        )
        try:
            if not ssh.connect():
                return {"success": False, "error": "Connection failed"}
            
            exit_code, output, error = ssh.execute(command)
            return {
                "success": exit_code == 0,
                "exit_code": exit_code,
                "output": output,
                "error": error
            }
        finally:
            ssh.close()

    def ping_all(self, timeout: int = 2) -> Dict[str, Any]:
        results = {}
        
        def _ping_single(server):
            host = server["host"]
            port = server.get("port", 22)
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout)
                start = time.time()
                result = sock.connect_ex((host, port))
                elapsed = round(time.time() - start, 3)
                sock.close()
                
                if result == 0:
                    return host, {"alive": True, "latency": elapsed}
                else:
                    return host, {"alive": False, "latency": None}
            except Exception as e:
                return host, {"alive": False, "latency": None, "error": str(e)}
        
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(self.servers))) as executor:
            future_to_host = {}
            for server in self.servers:
                future = executor.submit(_ping_single, server)
                future_to_host[future] = server["host"]
            
            for future in as_completed(future_to_host):
                host, result = future.result()
                results[host] = result
        
        return results


class SSHSessionPool:
    def __init__(self, cache_dir: str = ".ssh_cache", max_idle_time: int = 300):
        self.cache_dir = cache_dir
        self.max_idle_time = max_idle_time
        self._sessions: Dict[str, Tuple[SSHClient, float]] = {}
        self._lock = RLock()
        os.makedirs(cache_dir, exist_ok=True)

    def _get_session_key(self, server: Dict[str, Any]) -> str:
        key_data = {
            "host": server["host"],
            "port": server.get("port", 22),
            "username": server.get("username", ""),
            "key_file": server.get("key_file", "")
        }
        return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()

    def get_session(self, server: Dict[str, Any]) -> Optional[SSHClient]:
        key = self._get_session_key(server)
        
        with self._lock:
            if key in self._sessions:
                client, last_used = self._sessions[key]
                if time.time() - last_used < self.max_idle_time and client.connected:
                    self._sessions[key] = (client, time.time())
                    return client
                else:
                    try:
                        client.close()
                    except:
                        pass
                    del self._sessions[key]
            
            client = SSHClient(
                host=server["host"],
                port=server.get("port", 22),
                username=server.get("username", ""),
                password=server.get("password", ""),
                key_file=server.get("key_file", "")
            )
            if client.connect():
                self._sessions[key] = (client, time.time())
                return client
            return None

    def release_session(self, server: Dict[str, Any]) -> None:
        key = self._get_session_key(server)
        with self._lock:
            if key in self._sessions:
                client, _ = self._sessions[key]
                try:
                    client.close()
                except:
                    pass
                del self._sessions[key]

    def cleanup_expired(self) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [
                key for key, (client, last_used) in self._sessions.items()
                if now - last_used >= self.max_idle_time or not client.connected
            ]
            for key in expired_keys:
                try:
                    self._sessions[key][0].close()
                except:
                    pass
                del self._sessions[key]
                removed += 1
        return removed

    def close_all(self) -> None:
        with self._lock:
            for key, (client, _) in self._sessions.items():
                try:
                    client.close()
                except:
                    pass
            self._sessions.clear()

    def __del__(self):
        self.close_all()


class PooledSSHExecutor:
    def __init__(self, servers: List[Dict[str, Any]], pool: SSHSessionPool, max_workers: int = 10):
        self.servers = servers
        self.pool = pool
        self.max_workers = max_workers

    def execute_on_all(self, command: str) -> Dict[str, Any]:
        results = {}
        
        def _execute_single(server):
            host = server["host"]
            client = self.pool.get_session(server)
            if not client:
                return host, {"success": False, "error": "Connection failed"}
            
            try:
                exit_code, output, error = client.execute(command)
                return host, {
                    "success": exit_code == 0,
                    "exit_code": exit_code,
                    "output": output,
                    "error": error
                }
            except Exception as e:
                return host, {"success": False, "error": str(e)}
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_host = {}
            for server in self.servers:
                future = executor.submit(_execute_single, server)
                future_to_host[future] = server["host"]
            
            for future in as_completed(future_to_host):
                host, result = future.result()
                results[host] = result
        
        return results
