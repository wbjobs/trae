# 工业物联网管理平台

基于微前端架构和双协议后端服务的工业物联网管理平台，支持设备监控、日志溯源和权限管理。

## 技术架构

### 前端架构
- **微前端框架**: qiankun
- **UI 框架**: Vue 3 + Element Plus
- **构建工具**: Vite
- **状态管理**: Pinia
- **图表库**: ECharts
- **通信**: Axios + Socket.IO

### 后端架构
- **Web 框架**: Koa 2
- **TCP 服务**: Node.js Net 模块
- **实时推送**: Socket.IO
- **ORM**: Sequelize
- **缓存**: Redis
- **时序数据库**: InfluxDB 2.x
- **关系型数据库**: MySQL 8.0

## 项目结构

```
industrial-iot-platform/
├── frontend/                    # 前端微前端应用
│   ├── main-app/               # 主应用基座
│   │   ├── src/
│   │   │   ├── config/         # 微应用配置
│   │   │   ├── router/         # 路由配置
│   │   │   ├── stores/         # 状态管理
│   │   │   ├── utils/          # 工具函数
│   │   │   ├── views/          # 页面组件
│   │   │   ├── App.vue
│   │   │   └── main.js
│   │   └── vite.config.js
│   ├── dashboard/              # 设备看板子应用
│   ├── logtrace/               # 日志溯源子应用
│   └── auth/                   # 权限分发给用
├── backend/                     # 后端服务
│   ├── src/
│   │   ├── middleware/         # 中间件
│   │   ├── models/             # 数据模型
│   │   ├── protocol/           # 协议解析
│   │   ├── routes/             # API 路由
│   │   ├── services/           # 业务服务
│   │   ├── tcp/                # TCP 服务
│   │   ├── utils/              # 工具函数
│   │   ├── websocket/          # WebSocket 服务
│   │   └── app.js              # 应用入口
│   ├── scripts/
│   │   └── init.sql            # 数据库初始化脚本
│   └── package.json
├── scripts/                     # 部署脚本
│   ├── start-dev.bat           # 开发环境启动
│   ├── build-all.bat           # 生产构建
│   └── device-simulator.js     # 设备模拟器
├── docker-compose.yml           # Docker 编排
├── nginx.conf                   # Nginx 配置
└── package.json                 # 根项目配置
```

## 快速开始

### 环境要求
- Node.js >= 16.0.0
- Docker >= 20.10
- MySQL >= 8.0
- Redis >= 7.0
- InfluxDB >= 2.7

### 开发环境启动

1. **安装依赖**
```bash
npm install
```

2. **启动基础设施服务**
```bash
# Windows
scripts\start-dev.bat

# 或手动启动容器
docker run -d --name iot-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=123456 -e MYSQL_DATABASE=iot_platform mysql:8.0
docker run -d --name iot-redis -p 6379:6379 redis:7-alpine
docker run -d --name iot-influxdb -p 8086:8086 -e DOCKER_INFLUXDB_INIT_MODE=setup -e DOCKER_INFLUXDB_INIT_USERNAME=admin -e DOCKER_INFLUXDB_INIT_PASSWORD=admin123 -e DOCKER_INFLUXDB_INIT_ORG=iot-org -e DOCKER_INFLUXDB_INIT_BUCKET=iot-data -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=iot-token influxdb:2.7-alpine
```

3. **启动后端服务**
```bash
cd backend
npm run dev
```

4. **启动前端应用（新开终端）**
```bash
# 主应用
cd frontend/main-app
npm run dev

# 设备看板
cd frontend/dashboard
npm run dev

# 日志溯源
cd frontend/logtrace
npm run dev

# 权限分发
cd frontend/auth
npm run dev
```

5. **启动设备模拟器（可选，新开终端）**
```bash
node scripts/device-simulator.js
```

### 生产环境部署

1. **构建所有应用**
```bash
npm run build:all
```

2. **启动 Docker 容器**
```bash
docker-compose up -d --build
```

## 访问地址

| 服务 | 开发环境 | 生产环境 |
|------|----------|----------|
| 主应用 | http://localhost:8000 | http://localhost |
| 设备看板 | http://localhost:8001 | http://localhost/dashboard |
| 日志溯源 | http://localhost:8002 | http://localhost/logtrace |
| 权限分发 | http://localhost:8003 | http://localhost/auth |
| 后端 API | http://localhost:3000 | http://localhost/api |
| TCP 服务 | localhost:8888 | localhost:8888 |
| WebSocket | ws://localhost:3001 | ws://localhost/ws |

## 核心功能

### 1. 设备看板
- 设备状态实时监控
- 运行数据可视化
- 设备告警通知
- 设备远程控制

### 2. 日志溯源
- 设备运行日志查询
- 离线记录溯源分析
- 操作审计日志
- 日志导出功能

### 3. 权限分发
- 用户管理
- 角色管理
- 权限配置
- 操作日志

### 4. 后端核心
- TCP 私有协议通信
- HTTP API 服务
- WebSocket 实时推送
- 设备离线检测
- 时序数据存储

## 私有协议规范

### 消息格式
```
+----------------+----------------+----------------+----------------+----------------+----------------+
|  头部(2字节)   |  类型(2字节)   | 设备ID(16字节) | 长度(4字节)    |  数据(N字节)   |  尾部(2字节)   |
+----------------+----------------+----------------+----------------+----------------+----------------+
|    0xAA55      |    MSG_TYPE    |   DEVICE_ID    |   PAYLOAD_LEN  |   PAYLOAD      |    0x55AA      |
+----------------+----------------+----------------+----------------+----------------+----------------+
```

### 消息类型
| 类型值 | 名称 | 说明 |
|--------|------|------|
| 0x0001 | HEARTBEAT | 心跳包 |
| 0x0002 | DATA_REPORT | 数据上报 |
| 0x0003 | DEVICE_STATUS | 设备状态 |
| 0x0004 | ALARM | 告警信息 |
| 0x0005 | CONTROL_CMD | 控制命令 |
| 0x0006 | CONTROL_ACK | 控制响应 |
| 0x0007 | REGISTER | 注册请求 |
| 0x0008 | REGISTER_ACK | 注册响应 |

## API 文档

### 认证接口
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/info` - 获取用户信息

### 设备接口
- `GET /api/devices` - 获取设备列表
- `GET /api/devices/:id` - 获取设备详情
- `GET /api/devices/stats` - 获取设备统计
- `GET /api/devices/:id/metrics` - 获取设备指标
- `POST /api/devices/:id/control` - 设备控制

### 日志接口
- `GET /api/logs/device` - 获取设备日志
- `GET /api/logs/offline` - 获取离线记录
- `GET /api/logs/audit` - 获取审计日志
- `GET /api/logs/trace/:deviceId/:recordId` - 离线溯源分析

### 厂区接口
- `GET /api/factories` - 获取厂区列表
- `GET /api/factories/:id` - 获取厂区详情
- `GET /api/factories/:id/devices` - 获取厂区设备

## 数据库设计

### MySQL 数据表
- `users` - 用户表
- `roles` - 角色表
- `permissions` - 权限表
- `devices` - 设备表
- `factories` - 厂区表
- `device_logs` - 设备日志表
- `offline_records` - 离线记录表
- `audit_logs` - 审计日志表

### InfluxDB 存储
- `device_metrics` - 设备指标时序数据
  - Tags: deviceId, factory
  - Fields: temperature, pressure, vibration, rpm, power

## 配置说明

### 环境变量
后端服务通过 `.env` 文件配置，主要变量：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| HTTP_PORT | HTTP 服务端口 | 3000 |
| TCP_PORT | TCP 服务端口 | 8888 |
| WS_PORT | WebSocket 端口 | 3001 |
| MYSQL_HOST | MySQL 主机 | localhost |
| MYSQL_PORT | MySQL 端口 | 3306 |
| REDIS_HOST | Redis 主机 | localhost |
| REDIS_PORT | Redis 端口 | 6379 |
| INFLUXDB_HOST | InfluxDB 主机 | localhost |
| INFLUXDB_PORT | InfluxDB 端口 | 8086 |
| JWT_SECRET | JWT 密钥 | - |
| HEARTBEAT_INTERVAL | 心跳间隔(ms) | 15000 |
| OFFLINE_THRESHOLD | 离线阈值(ms) | 45000 |

## License

MIT
