# 分布式配置同步服务

基于 Go + NATS + JetStream KV 的分布式配置同步服务，支持多实例实时配置同步、版本管理、配置回滚和 Webhook 回调。

## 架构特性

- **多实例同步**：多个服务实例通过 NATS KV Watch 实时同步配置变更
- **版本管理**：完整的配置历史记录，支持查看任意历史版本
- **配置回滚**：一键回滚到任意历史版本
- **HTTP API**：提供 RESTful API 用于配置管理
- **Webhook 回调**：配置变更时自动触发 HTTP Webhook 通知

## 目录结构

```
.
├── cmd/
│   └── main.go              # 主入口文件
├── internal/
│   ├── api/
│   │   └── server.go        # HTTP API 服务
│   ├── config/
│   │   └── config.go        # 配置加载
│   ├── crypto/
│   │   └── aes_gcm.go       # AES-GCM 加解密
│   ├── store/
│   │   └── store.go         # NATS KV 存储层
│   ├── sync/
│   │   └── manager.go       # 同步管理器
│   └── webhook/
│       └── webhook.go       # Webhook 通知
├── config.yaml              # 配置文件
└── go.mod                   # Go 模块定义
```

## 前置要求

- Go 1.21+
- NATS Server 2.10+ (启用 JetStream)

## 快速开始

### 1. 启动 NATS Server (启用 JetStream)

```bash
nats-server --jetstream
```

### 2. 配置服务

编辑 `config.yaml`：

```yaml
service:
  name: config-sync-node-1    # 服务实例名称
  http_port: 8080             # HTTP 服务端口
  data_dir: ./data            # 数据目录

nats:
  url: nats://localhost:4222  # NATS 服务器地址
  kv_bucket: config_sync      # KV Bucket 名称
  watch_subject: config.*     # 监听的配置 subject

webhook:
  url: ""                     # Webhook 回调地址 (可选)
  timeout: 10s                # 超时时间
  retry_count: 3              # 重试次数
  retry_interval: 5s          # 重试间隔

log:
  level: info                 # 日志级别
  format: json                # 日志格式
```

### 3. 启动服务

```bash
go run ./cmd/main.go
```

或指定配置文件：

```bash
go run ./cmd/main.go /path/to/config.yaml
```

## API 文档

### 健康检查

```
GET /api/v1/health
```

响应：
```json
{
  "status": "ok",
  "service": "config-sync-node-1",
  "time": "2024-01-01T00:00:00Z"
}
```

### 获取所有配置

```
GET /api/v1/config
```

响应：
```json
{
  "count": 2,
  "items": [
    {
      "key": "database.host",
      "value": "localhost",
      "version": 3,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T01:00:00Z",
      "updated_by": "admin"
    }
  ]
}
```

### 获取单个配置

```
GET /api/v1/config/{key}
```

响应：
```json
{
  "key": "database.host",
  "value": "localhost",
  "version": 3,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T01:00:00Z",
  "updated_by": "admin"
}
```

### 更新配置

```
PUT /api/v1/config/{key}
Content-Type: application/json

{
  "value": "new-value",
  "updated_by": "admin",
  "meta": {
    "description": "Database host address"
  }
}
```

响应：
```json
{
  "key": "database.host",
  "version": 4,
  "status": "updated"
}
```

### 删除配置

```
DELETE /api/v1/config/{key}
```

响应：
```json
{
  "key": "database.host",
  "status": "deleted"
}
```

### 获取配置历史

```
GET /api/v1/config/{key}/history
```

响应：
```json
{
  "key": "database.host",
  "count": 3,
  "items": [
    {
      "key": "database.host",
      "value": "old-host",
      "version": 1,
      "operation": "update",
      "timestamp": "2024-01-01T00:00:00Z",
      "updated_by": "admin"
    },
    {
      "key": "database.host",
      "value": "new-host",
      "version": 2,
      "operation": "update",
      "timestamp": "2024-01-01T01:00:00Z",
      "updated_by": "admin"
    }
  ]
}
```

### 回滚配置

```
POST /api/v1/config/{key}/rollback
Content-Type: application/json

{
  "version": 1,
  "updated_by": "admin"
}
```

响应：
```json
{
  "key": "database.host",
  "rolled_back_to": 1,
  "new_version": 4,
  "status": "rolled_back"
}
```

### 获取冲突列表

```
GET /api/v1/conflicts
```

响应：
```json
{
  "count": 1,
  "items": [
    {
      "key": "database.host",
      "type": "update_conflict",
      "local_version": 5,
      "remote_version": 3,
      "local_entry": {
        "key": "database.host",
        "value": "local-host",
        "version": 5,
        "updated_at": "2024-01-01T02:00:00Z"
      },
      "remote_entry": {
        "key": "database.host",
        "value": "remote-host",
        "version": 3,
        "updated_at": "2024-01-01T01:00:00Z"
      },
      "resolved": false,
      "created_at": "2024-01-01T02:00:00Z"
    }
  ]
}
```

### 解决冲突

```
POST /api/v1/conflicts/{key}/resolve
Content-Type: application/json

{
  "choose_local": true,
  "updated_by": "admin"
}
```

响应：
```json
{
  "key": "database.host",
  "chose_local": true,
  "version": 6,
  "status": "resolved"
}
```

### 设置合并策略

```
POST /api/v1/strategy
Content-Type: application/json

{
  "strategy": "last_write_wins"
}
```

支持的策略：
- `last_write_wins` - 基于时间戳，最后写入的获胜（默认）
- `remote_wins` - 远程版本获胜
- `local_wins` - 本地版本获胜
- `manual` - 手动解决冲突

响应：
```json
{
  "strategy": "last_write_wins",
  "status": "updated"
}
```

### 获取本地缓存

```
GET /api/v1/cache
```

响应：
```json
{
  "count": 2,
  "items": {
    "database.host": {
      "key": "database.host",
      "value": "localhost",
      "version": 4,
      "updated_at": "2024-01-01T01:00:00Z"
    },
    "app.debug": {
      "key": "app.debug",
      "value": true,
      "version": 2,
      "updated_at": "2024-01-01T00:00:00Z"
    }
  }
}
```

## 脑裂场景与冲突解决

### 问题描述

当网络分区发生时，不同节点可能各自独立更新同一个配置。当网络恢复后，需要解决配置冲突，避免旧配置覆盖新配置。

### 解决方案

1. **乐观并发控制**：使用 NATS KV 的 `Update` 方法，传入期望的版本号，防止并发覆盖

2. **本地版本缓存**：SyncManager 维护本地配置版本缓存，用于检测远程更新是否落后于本地版本

3. **自动冲突检测**：当检测到本地版本 > 远程版本时，自动触发冲突检测

4. **合并策略**：支持多种合并策略
   - `last_write_wins`：基于时间戳，保留最新的配置（默认）
   - `remote_wins`：始终接受远程版本
   - `local_wins`：始终保留本地版本
   - `manual`：记录冲突，等待手动解决

5. **冲突解决 API**：提供 HTTP API 查看和解决冲突

### 示例场景

```bash
# 1. 网络分区前，两边节点都有 version=1 的配置

# 2. 网络分区期间：
#    - 节点A 更新配置，version=2，value="node-a-config"
#    - 节点B 更新配置，version=2，value="node-b-config"

# 3. 网络恢复后：
#    - 节点A 收到节点B 的更新，检测到冲突
#    - 根据合并策略（默认 last_write_wins）比较时间戳
#    - 自动选择时间戳较新的配置

# 4. 手动检查冲突：
curl http://localhost:8080/api/v1/conflicts

# 5. 手动解决冲突（选择本地版本）：
curl -X POST http://localhost:8080/api/v1/conflicts/database.host/resolve \
  -H "Content-Type: application/json" \
  -d '{"choose_local": true, "updated_by": "admin"}'
```

## Webhook 回调

当配置发生变更时，服务会向配置的 Webhook URL 发送 POST 请求：

### 请求头

```
Content-Type: application/json
X-Config-Sync-Event: config-change
```

### 请求体

```json
{
  "event": "config.updated",
  "key": "database.host",
  "entry": {
    "key": "database.host",
    "value": "localhost",
    "version": 3,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T01:00:00Z",
    "updated_by": "admin"
  },
  "timestamp": "2024-01-01T01:00:00Z",
  "service": "config-sync-node-1"
}
```

### 事件类型

- `config.updated` - 配置更新
- `config.deleted` - 配置删除
- `config.rolled_back` - 配置回滚

## 多实例部署

启动多个服务实例连接到同一个 NATS 集群：

```bash
# 实例 1
go run ./cmd/main.go config.yaml

# 实例 2 (使用不同端口)
go run ./cmd/main.go config2.yaml
```

所有实例会通过 NATS KV Watch 自动同步配置变更。

## 使用示例

```
# 更新配置
curl -X PUT http://localhost:8080/api/v1/config/app.debug \
  -H "Content-Type: application/json" \
  -d '{"value": true, "updated_by": "admin"}'

# 更新敏感配置（自动加密存储）
curl -X PUT http://localhost:8080/api/v1/config/db.password \
  -H "Content-Type: application/json" \
  -d '{"value": "my-secret-password", "updated_by": "admin", "sensitive": true}'

# 查询配置（自动解密）
curl http://localhost:8080/api/v1/config/db.password

# 查询历史
curl http://localhost:8080/api/v1/config/app.debug/history

# 回滚到版本 1
curl -X POST http://localhost:8080/api/v1/config/app.debug/rollback \
  -H "Content-Type: application/json" \
  -d '{"version": 1, "updated_by": "admin"}'
```

## 配置加密

### 概述

敏感配置（如密钥、密码）在存储到 NATS KV 之前使用 AES-GCM 加密，读取时自动解密，确保配置数据即使被直接从 KV 存储中读取也无法获得明文。

### 配置方式

在 `config.yaml` 中配置加密：

```yaml
encryption:
  enabled: true                      # 启用加密
  master_key: "base64-encoded-key"   # 主密钥（Base64 编码，32 字节）
  master_key_file: ""                # 主密钥文件路径（可选，与 master_key 二选一）
  encrypt_by_default: false          # 是否默认加密所有配置
```

### 生成主密钥

```bash
# 方式一：让服务自动生成（首次启动时）
# 未配置 master_key 时服务会自动生成并打印，请保存好生成的密钥

# 方式二：手动生成
# 使用 openssl 生成 32 字节随机密钥并 Base64 编码
openssl rand -base64 32
```

### 使用加密配置

```bash
# 创建敏感配置
curl -X PUT http://localhost:8080/api/v1/config/db.password \
  -H "Content-Type: application/json" \
  -d '{"value": "secret123", "updated_by": "admin", "sensitive": true}'

# 读取时自动解密
curl http://localhost:8080/api/v1/config/db.password
# 返回明文: {"key": "db.password", "value": "secret123", "encrypted": false, "sensitive": true}

# 从 NATS KV 直接读取会看到加密后的值
# nats kv get config_sync db.password
# 返回: {"key": "db.password", "value": "ENC:...", "encrypted": true}
```

### 加密策略

- 只有标记为 `sensitive: true` 的配置才会加密（或设置 `encrypt_by_default: true` 加密所有）
- 加密使用 AES-256-GCM，每条配置使用独立的随机 nonce
- 配置键名（key）作为 AAD（附加认证数据），确保密文与 key 绑定
- 加密后的值以 `ENC:` 前缀标识，便于识别

## License

MIT
