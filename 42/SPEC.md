# FileSync Tool Specification

## 项目概述
跨平台命令行文件同步工具，支持本地文件夹与远程服务器（SSH/SFTP）双向同步

## 技术架构
- **核心同步逻辑**: Go (syncengine)
- **配置管理**: Python (pyconfig)
- **通信接口**: JSON over stdin/stdout

## 核心功能

### 1. 同步功能
- 本地到远程同步
- 远程到本地同步
- 双向同步（需要冲突检测）
- 增量同步（基于文件修改时间和大小）
- 目录结构保持

### 2. 连接管理
- SSH/SFTP 协议支持
- 密码和密钥认证
- 连接池管理
- 自动重连

### 3. 冲突检测与处理
- 检测同一文件在两端都被修改的情况
- 冲突解决策略：
  - newer_wins: 保留最新版本
  - local_wins: 保留本地版本
  - remote_wins: 保留远程版本
  - ask: 交互式询问
  - skip: 跳过冲突文件

### 4. 配置文件 (YAML)
```yaml
version: "1.0"
tasks:
  - name: "backup-to-server"
    local_path: "/home/user/data"
    remote_path: "/backup/data"
    remote:
      host: "server.example.com"
      port: 22
      username: "user"
      # 认证方式 (password 或 key_file)
      auth_method: "key_file"
      key_file: "~/.ssh/id_rsa"
      # password: "secret" (不推荐)
    direction: "bidirectional"  # local_to_remote, remote_to_local, bidirectional
    conflict_resolution: "newer_wins"
    schedule: "0 */6 * * *"  # cron 格式
    ignore_patterns:
      - "*.tmp"
      - "*.log"
      - ".git"
      - "node_modules"
    max_file_size: "100M"
    exclude_hidden: false
```

### 5. 忽略规则
- 支持 glob 模式
- 支持目录和文件
- 支持排除特定扩展名

### 6. 定时同步
- Cron 表达式支持
- 后台守护进程模式

## 命令行接口

### Python CLI (主入口)
```
synccli.py <command> [options]

Commands:
  sync <task_name>        - 执行指定同步任务
  status                  - 显示所有任务状态
  list                    - 列出所有配置的任务
  daemon                  - 后台运行定时同步
  validate                - 验证配置文件

Options:
  -c, --config FILE       - 指定配置文件路径
  -v, --verbose           - 详细输出
  -d, --dry-run           - 模拟运行不实际同步
  --force                 - 强制同步忽略冲突
```

### Go Engine (内部调用)
```
syncengine [command] [args...]

Commands:
  ping                    - 测试连接
  list remote <host>      - 列出远程目录
  sync <task_json>        - 执行同步任务
```

## 数据结构

### FileInfo
```json
{
  "path": "relative/path/file.txt",
  "size": 1024,
  "mtime": 1234567890,
  "is_dir": false,
  "checksum": "sha256:..."
}
```

### SyncTask
```json
{
  "name": "task-name",
  "local_path": "/local/path",
  "remote_path": "/remote/path",
  "remote_config": {...},
  "direction": "bidirectional",
  "conflict_resolution": "newer_wins",
  "ignore_patterns": ["*.tmp"],
  "dry_run": false
}
```

### SyncResult
```json
{
  "task_name": "task-name",
  "success": true,
  "files_uploaded": 10,
  "files_downloaded": 5,
  "files_skipped": 3,
  "conflicts": [],
  "errors": [],
  "duration": "10s"
}
```

## 目录结构
```
filesync/
├── syncengine/           # Go 核心同步引擎
│   ├── main.go
│   ├── sync/
│   │   ├── engine.go
│   │   ├── scanner.go
│   │   └── transfer.go
│   ├── remote/
│   │   ├── sftp.go
│   │   └── ssh.go
│   └── go.mod
├── pyconfig/             # Python 配置管理
│   ├── synccli.py
│   ├── config.py
│   ├── scheduler.py
│   └── requirements.txt
├── config/
│   └── sync.yaml
├── SPEC.md
└── README.md
```

## 平台兼容性
- Linux: ✅
- macOS: ✅
- Windows: ✅

## 错误处理
- 网络超时: 自动重试 3 次
- 认证失败: 退出并提示
- 文件权限错误: 记录并继续
- 磁盘空间不足: 停止并报警
