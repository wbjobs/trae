# Dapr Wasm State Manager

基于 Go + Wasm 的 Dapr 状态管理组件，支持可插拔的 Wasm 插件，用户可以上传自定义 Wasm 模块来扩展状态存储逻辑（如加密、压缩、日志等）。

## 功能特性

- **CRUD API**: 完整的状态管理接口 (get/set/delete/bulk)
- **版本控制**: 每个 Key 自动保留最近 10 个版本，支持版本历史查询
- **时间旅行查询**: 支持查询指定时间点的状态值
- **Wasm 插件系统**: 支持上传自定义 Wasm 模块扩展状态存储逻辑
- **多后端存储**: 支持内存存储和 Redis
- **监控指标**: 实时监控 QPS、延迟、成功率等指标
- **可视化界面**: React 前端提供友好的监控和管理界面

## 项目结构

```
.
├── backend/                  # Go 后端服务
│   ├── cmd/server/          # 主程序入口
│   ├── pkg/
│   │   ├── api/             # HTTP API 处理
│   │   ├── monitor/         # 监控指标采集
│   │   ├── service/         # 状态服务层
│   │   ├── store/           # 存储抽象层和实现
│   │   └── wasm/            # Wasm 插件加载器
│   └── plugin-sdk/          # Wasm 插件 SDK
├── frontend/                # React 前端
│   └── src/
│       ├── components/      # React 组件
│       └── services/        # API 服务
└── examples/                # 示例 Wasm 插件
    ├── encrypt-plugin/      # 加密插件示例
    └── logging-plugin/      # 日志插件示例
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend

# 安装依赖
go mod tidy

# 启动服务（使用内存存储）
go run cmd/server/main.go

# 或使用 Redis 存储
STORE_TYPE=redis REDIS_ADDR=localhost:6379 go run cmd/server/main.go
```

服务默认运行在 `http://localhost:8080`

### 2. 启动前端开发服务器

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 `http://localhost:3000`

### 3. 构建前端

```bash
cd frontend
npm run build
```

构建产物将输出到 `backend/web/` 目录，后端服务会自动提供静态文件。

## API 文档

### 状态管理 API

#### Get
```bash
POST /api/v1/state/get
Content-Type: application/json

{
  "key": "my-key"
}
```

#### Set
```bash
POST /api/v1/state/set
Content-Type: application/json

{
  "key": "my-key",
  "value": "my-value"
}
```

#### Delete
```bash
POST /api/v1/state/delete
Content-Type: application/json

{
  "key": "my-key"
}
```

#### Bulk Get
```bash
POST /api/v1/state/bulk_get
Content-Type: application/json

{
  "keys": ["key1", "key2", "key3"]
}
```

#### Bulk Set
```bash
POST /api/v1/state/bulk_set
Content-Type: application/json

{
  "items": {
    "key1": "value1",
    "key2": "value2"
  }
}
```

#### Bulk Delete
```bash
POST /api/v1/state/bulk_delete
Content-Type: application/json

{
  "keys": ["key1", "key2"]
}
```

### 版本控制 API

#### 获取指定版本
```bash
POST /api/v1/state/version
Content-Type: application/json

{
  "key": "my-key",
  "version": 1234567890
}
```

#### 获取版本历史
```bash
POST /api/v1/state/versions
Content-Type: application/json

{
  "key": "my-key"
}
```

#### 时间旅行查询
```bash
POST /api/v1/state/timetravel
Content-Type: application/json

{
  "key": "my-key",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 删除版本历史
```bash
POST /api/v1/state/versions/delete
Content-Type: application/json

{
  "key": "my-key"
}
```

### 监控 API

#### 获取指标
```bash
GET /api/v1/metrics
```

#### 重置指标
```bash
POST /api/v1/metrics/reset
```

### 插件管理 API

#### 列出插件
```bash
GET /api/v1/plugins
```

#### 上传插件
```bash
POST /api/v1/plugins/upload
Content-Type: multipart/form-data

file: <wasm-file>
name: "my-plugin"
description: "Plugin description"
version: "1.0.0"
```

#### 激活插件
```bash
POST /api/v1/plugins/activate
Content-Type: application/json

{
  "plugin_id": "plugin-id"
}
```

#### 停用插件
```bash
POST /api/v1/plugins/deactivate
```

#### 删除插件
```bash
POST /api/v1/plugins/delete
Content-Type: application/json

{
  "plugin_id": "plugin-id"
}
```

#### 获取当前激活插件
```bash
GET /api/v1/plugins/active
```

## 开发 Wasm 插件

### 插件接口

Wasm 插件可以实现以下可选的钩子函数：

- `before_get(key)` - 在 Get 操作前处理 Key
- `after_get(key, value)` - 在 Get 操作后处理 Value
- `before_set(key, value)` - 在 Set 操作前处理 Key 和 Value
- `after_set(key, value)` - 在 Set 操作后处理
- `before_delete(key)` - 在 Delete 操作前处理 Key
- `after_delete(key)` - 在 Delete 操作后处理

### 示例插件

#### 加密插件 (`examples/encrypt-plugin`)

使用 AES-GCM 加密存储的数据：

```bash
cd examples/encrypt-plugin
GOOS=wasip1 GOARCH=wasm go build -o encrypt.wasm main.go
```

#### 日志插件 (`examples/logging-plugin`)

记录所有状态操作日志：

```bash
cd examples/logging-plugin
GOOS=wasip1 GOARCH=wasm go build -o logging.wasm main.go
```

### 插件 SDK

使用 `plugin-sdk` 包简化 Wasm 插件开发：

```go
package main

import (
    sdk "github.com/dapr-wasm-state/plugin-sdk"
)

//go:export before_set
func before_set(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
    key := sdk.ReadString(keyPtr, keyLen)
    value := sdk.ReadBytes(valuePtr, valueLen)

    // 自定义处理逻辑
    processedValue := process(value)

    return sdk.ReturnBytes(processedValue)
}

func main() {}
```

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | `8080` | 服务端口 |
| `STORE_TYPE` | `memory` | 存储类型 (`memory` 或 `redis`) |
| `REDIS_ADDR` | - | Redis 地址 |
| `REDIS_PASSWORD` | - | Redis 密码 |
| `REDIS_KEY_PREFIX` | - | Redis Key 前缀 |
| `PLUGIN_DIR` | `./plugins` | Wasm 插件目录 |
| `WASM_MAX_CONCURRENCY` | `10` | Wasm 最大并发数 |
| `WASM_SINGLE_TIMEOUT` | `1s` | 单操作 Wasm 超时时间 |
| `WASM_BULK_TIMEOUT` | `5s` | 批量操作 Wasm 超时时间 |
| `SERVER_READ_TIMEOUT` | `15s` | HTTP 读取超时 |
| `SERVER_WRITE_TIMEOUT` | `15s` | HTTP 写入超时 |

## 技术栈

- **后端**: Go 1.21+, wazero (Wasm 运行时), Redis 客户端
- **前端**: React 18, Ant Design, Recharts, Vite
- **Wasm**: Go wasip1/wasi 目标

## 许可证

MIT
