# 分布式任务调度服务

基于 Go + Gin + Redis + MySQL 开发的分布式任务调度服务。

## 功能特性

### 1. 任务定义API
- 支持创建任务，配置任务类型（Shell命令/HTTP请求/自定义脚本）
- 支持执行时间配置（定时/单次/循环）
- 支持超时时间和重试次数配置
- 支持任务依赖配置，形成DAG（有向无环图）

### 2. 调度核心模块
- 基于Redis实现分布式锁，确保任务在多个调度节点间不重复执行
- 基于Redis实现任务队列
- 实现任务状态流转（待调度/运行中/成功/失败/取消）
- 支持任务状态查询接口

### 3. 执行器模块
- 轻量级任务执行器，支持异步执行任务
- 将执行结果、日志同步回调度中心
- 支持任务执行超时自动终止
- 支持失败任务的自动重试（指数退避策略）

### 4. 额外功能
- 任务日志的持久化存储（MySQL）
- 日志查询接口
- 简单的服务注册与发现，支持调度节点的动态加入与退出

## 项目结构

```
.
├── cmd/
│   ├── scheduler/          # 调度中心入口
│   │   └── main.go
│   └── executor/           # 执行器入口
│       └── main.go
├── internal/
│   ├── config/             # 配置管理
│   │   └── config.go
│   ├── database/           # 数据库连接和迁移
│   │   └── database.go
│   ├── redis/              # Redis模块（锁/队列）
│   │   ├── redis.go
│   │   ├── lock.go
│   │   └── queue.go
│   ├── models/             # 数据模型
│   │   └── task.go
│   ├── repository/         # 数据访问层
│   │   ├── task_repository.go
│   │   └── log_repository.go
│   ├── scheduler/          # 调度核心模块
│   │   └── scheduler.go
│   ├── executor/           # 执行器模块
│   │   └── executor.go
│   ├── service/            # 服务注册与发现
│   │   └── registry.go
│   ├── handler/            # API控制器
│   │   ├── task_handler.go
│   │   └── service_handler.go
│   └── router/             # 路由配置
│       └── router.go
├── config.yaml             # 配置文件
├── go.mod
└── README.md
```

## 快速开始

### 环境要求
- Go 1.21+
- MySQL 5.7+
- Redis 5.0+

### 安装依赖

```bash
go mod tidy
```

### 配置

修改 `config.yaml` 文件，配置数据库和Redis连接信息：

```yaml
server:
  port: 8080

database:
  host: localhost
  port: 3306
  user: root
  password: your_password
  dbname: scheduler

redis:
  host: localhost
  port: 6379
  password: ""
  db: 0
```

### 初始化数据库

```sql
CREATE DATABASE scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 运行

#### 启动调度中心

```bash
go run cmd/scheduler/main.go
```

#### 启动执行器（可以启动多个）

```bash
go run cmd/executor/main.go
```

## API接口

### 任务管理

#### 创建任务
```
POST /api/v1/tasks
```

请求体示例（Shell任务）：
```json
{
  "name": "备份数据库",
  "description": "每日数据库备份任务",
  "task_type": "shell",
  "command": "mysqldump -u root -p123456 mydb > /backup/mydb.sql",
  "schedule_type": "once",
  "execute_at": "2024-01-01T00:00:00Z",
  "timeout_seconds": 300,
  "max_retries": 3,
  "retry_backoff": 1
}
```

请求体示例（HTTP任务）：
```json
{
  "name": "健康检查",
  "task_type": "http",
  "http_method": "GET",
  "http_url": "https://example.com/health",
  "http_headers": {
    "Content-Type": "application/json"
  },
  "schedule_type": "interval",
  "interval_seconds": 60,
  "timeout_seconds": 10,
  "max_retries": 2
}
```

请求体示例（带依赖的任务）：
```json
{
  "name": "处理数据",
  "task_type": "script",
  "command": "python process_data.py",
  "schedule_type": "once",
  "timeout_seconds": 60,
  "max_retries": 1,
  "dependencies": ["task-uuid-1", "task-uuid-2"]
}
```

#### 获取任务列表
```
GET /api/v1/tasks?page=1&page_size=20
```

#### 获取单个任务
```
GET /api/v1/tasks/:id
```

#### 更新任务
```
PUT /api/v1/tasks/:id
```

#### 删除任务
```
DELETE /api/v1/tasks/:id
```

#### 立即触发任务
```
POST /api/v1/tasks/:id/trigger
```

#### 取消任务
```
POST /api/v1/tasks/:id/cancel
```

#### 获取任务状态
```
GET /api/v1/tasks/:id/status
```

#### 获取任务日志
```
GET /api/v1/tasks/:id/logs?page=1&page_size=20
```

#### 获取日志详情
```
GET /api/v1/logs/:id
```

### 服务发现

#### 获取所有服务
```
GET /api/v1/services
```

#### 获取调度中心列表
```
GET /api/v1/services/schedulers
```

#### 获取执行器列表
```
GET /api/v1/services/executors
```

#### 健康检查
```
GET /api/v1/health
```

## 任务类型

### Shell任务 (`task_type: "shell"`)
执行系统Shell命令。

必填字段：
- `command`: 要执行的命令

### HTTP任务 (`task_type: "http"`)
发送HTTP请求。

必填字段：
- `http_url`: 请求URL

可选字段：
- `http_method`: 请求方法（默认GET）
- `http_headers`: 请求头
- `http_body`: 请求体

### 脚本任务 (`task_type: "script"`)
执行脚本（Windows使用PowerShell，Linux/Mac使用Bash）。

必填字段：
- `command`: 脚本内容

## 调度类型

### 单次执行 (`schedule_type: "once"`)
在指定时间执行一次。

可选字段：
- `execute_at`: 执行时间（RFC3339格式）

### 定时执行 (`schedule_type: "cron"`)
按Cron表达式定时执行。

必填字段：
- `cron_expression`: Cron表达式

### 间隔执行 (`schedule_type: "interval"`)
按固定间隔重复执行。

必填字段：
- `interval_seconds`: 间隔秒数

## 任务状态

| 状态 | 说明 |
|------|------|
| pending | 待调度 |
| scheduled | 已调度 |
| running | 运行中 |
| success | 成功 |
| failed | 失败 |
| cancelled | 已取消 |
| timeout | 超时 |

## 重试机制

系统支持指数退避重试策略：

```
等待时间 = retry_backoff * 2^(retry_count)
```

例如，当 `retry_backoff=1` 时：
- 第1次重试：等待 1 秒
- 第2次重试：等待 2 秒
- 第3次重试：等待 4 秒
- 第4次重试：等待 8 秒
- ...

## 分布式特性

### 分布式锁
使用Redis的SETNX实现分布式锁，确保同一任务不会被多个调度节点同时调度。

### 任务队列
使用Redis的ZSet实现优先级任务队列，支持按调度时间排序。

### 服务注册与发现
- 调度中心和执行器启动时自动注册到Redis
- 通过心跳机制维持服务状态
- 自动清理过期（超过120秒无心跳）的服务节点

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                        调度中心集群                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  调度中心 1   │    │  调度中心 2   │    │  调度中心 3   │  │
│  │  (API+调度)   │    │  (API+调度)   │    │  (API+调度)   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
└─────────┼───────────────────┼───────────────────┼──────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │  Redis  │     │  MySQL  │     │  Redis  │
        │ (锁/队列)│     │ (任务/日志)│    │(服务发现)│
        └────┬────┘     └────┬────┘     └────┬────┘
             │               │               │
             └───────────────┼───────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │ 执行器 1 │    │ 执行器 2 │    │ 执行器 N │
        │ (多Worker)│    │ (多Worker)│    │ (多Worker)│
        └─────────┘    └─────────┘    └─────────┘
```

## License

MIT
