# 多文件模块化异构终端协议中台

## 项目架构

```
├── common/                    # 公共模块
│   ├── types.ts               # 类型定义
│   ├── auth.ts                # 认证模块
│   └── utils.ts               # 工具函数
│
├── config-layer/              # 配置层
│   ├── frontend/              # 前端低代码配置平台
│   │   └── src/
│   │       ├── views/         # 页面组件
│   │       │   ├── MessageEditor.vue    # 报文配置编辑器
│   │       │   ├── RouteRules.vue       # 协议规则分组路由
│   │       │   └── DeviceManager.vue    # 设备管理
│   │       ├── router/        # 路由配置
│   │       ├── store/         # Pinia状态管理
│   │       └── api/           # API接口
│   │
│   └── backend/               # 后端配置服务
│       └── src/
│           ├── router/        # 路由
│           ├── controller/    # 控制器
│           ├── middleware/    # 中间件
│           └── model/         # 数据模型
│
├── parse-layer/               # 解析层
│   ├── protocol-adapter/      # 多协议适配服务
│   ├── message-parser/        # 报文解析子模块
│   └── tsdb-storage/          # 时序数据库存储
│
└── forward-layer/             # 转发层
    ├── message-router/        # 跨终端消息转发模块
    ├── long-polling/          # 长轮询通信服务
    └── device-manager/        # 设备管理模块
```

## 核心功能

### 1. 低代码报文配置编辑器
- 可视化拖拽配置报文字段结构
- 支持多种字段类型：字符串、数字、布尔、二进制、对象、数组
- 实时预览解析结果
- 报文测试解析功能

### 2. 协议规则分组路由
- 可视化条件配置（协议、主题、内容、设备、时间）
- 支持多条件逻辑组合
- 多目标转发配置（设备、设备组、主题、Webhook）
- 规则启用/禁用管理

### 3. 多协议适配服务
- 支持 MQTT、HTTP、TCP、Modbus 等多种协议
- 插件式协议扩展架构
- 统一的消息处理接口

### 4. 报文解析子模块
- 基于 Schema 的结构化解析
- 自动识别解析格式（JSON/二进制/十六进制）
- 解析日志记录与错误处理

### 5. 跨终端消息转发
- 规则引擎路由决策
- 消息转换与映射
- 多目标并发转发
- 转发日志审计

### 6. 时序数据库存储
- 原始报文持久化存储
- 解析结果结构化存储
- 转发日志记录
- 多维度查询支持

### 7. 长轮询通信
- 设备在线状态管理
- 指令下行推送
- 心跳检测与超时处理
- 离线消息队列

### 8. 权限与安全
- JWT Token 认证
- 基于角色的权限控制
- API 路由权限拦截
- 操作审计日志

## 快速启动

### 1. 安装依赖

```bash
# 根目录安装
npm install

# 安装前端依赖
cd config-layer/frontend
npm install

# 安装后端依赖
cd ../backend
npm install
```

### 2. 启动后端服务

```bash
cd config-layer/backend
npm run dev
```

服务将在 http://localhost:8080 启动

### 3. 启动前端服务

```bash
cd config-layer/frontend
npm run dev
```

前端将在 http://localhost:5173 启动

### 4. 默认登录账号

- 用户名: `admin`
- 密码: `admin123`

## API 接口文档

### 认证接口
- `POST /auth/login` - 用户登录
- `POST /auth/logout` - 用户登出
- `GET /auth/me` - 获取当前用户信息

### 协议管理
- `GET /protocols` - 获取协议列表
- `POST /protocols` - 创建协议配置
- `PUT /protocols/:id` - 更新协议配置
- `DELETE /protocols/:id` - 删除协议配置

### 报文Schema管理
- `GET /schemas` - 获取Schema列表
- `POST /schemas` - 创建Schema
- `PUT /schemas/:id` - 更新Schema
- `DELETE /schemas/:id` - 删除Schema
- `POST /parser/test` - 测试报文解析

### 路由规则管理
- `GET /routes` - 获取路由规则列表
- `POST /routes` - 创建路由规则
- `PUT /routes/:id` - 更新路由规则
- `DELETE /routes/:id` - 删除路由规则

### 设备管理
- `GET /devices` - 获取设备列表
- `POST /devices` - 创建设备
- `PUT /devices/:id` - 更新设备
- `DELETE /devices/:id` - 删除设备
- `POST /devices/:id/command` - 发送设备指令

### 长轮询接口
- `GET /polling/:deviceId` - 设备长轮询连接
- `POST /polling/:deviceId/send` - 发送指令到设备
- `POST /polling/broadcast` - 广播指令
- `GET /polling/devices/connected` - 获取在线设备列表
- `GET /polling/:deviceId/status` - 获取设备状态

### 日志查询
- `GET /logs/raw` - 查询原始报文日志
- `GET /logs/parsed` - 查询解析日志
- `GET /logs/forward` - 查询转发日志

### 统计信息
- `GET /statistics/overview` - 获取系统概览统计
- `GET /statistics/device` - 获取设备统计
- `GET /statistics/protocol` - 获取协议统计

## 技术栈

### 前端
- Vue 3 + TypeScript
- Element Plus UI 组件库
- Pinia 状态管理
- Vue Router 路由
- Axios HTTP 客户端
- vuedraggable 拖拽组件

### 后端
- Node.js + Express
- TypeScript
- JWT 认证
- EventEmitter 事件驱动

### 协议支持
- MQTT (mqtt)
- HTTP (express)
- TCP (net)
- Modbus (modbus-serial)

## 扩展开发

### 添加新协议适配器

1. 在 `parse-layer/protocol-adapter/src/` 创建新的适配器类
2. 继承 `ProtocolAdapter` 基类
3. 实现 `connect()`, `disconnect()`, `send()` 方法
4. 在 `ProtocolAdapterManager.createAdapter()` 中注册

### 添加新字段类型

1. 在 `common/types.ts` 中扩展 `FieldType` 类型
2. 在前端 `MessageEditor.vue` 中添加对应的编辑器组件
3. 在 `message-parser` 中添加对应的解析逻辑

## 许可证

MIT License
