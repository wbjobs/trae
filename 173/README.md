# 实时工单系统

基于 Nuxt 3 + TRPC + PostgreSQL + Pusher 构建的实时工单管理系统。

## 功能特性

- 工单状态管理：待接单 → 处理中 → 待验收 → 已完成
- 客服接单与转派
- 内部备注系统
- 实时状态推送（Pusher + SSE）
- SLA 倒计时监控（30 分钟响应，2 小时解决）

## 技术栈

- **前端框架**: Nuxt 3 (Vue 3)
- **API 层**: TRPC
- **数据库**: PostgreSQL
- **实时通信**: Pusher (私有部署) + Server-Sent Events
- **类型验证**: Zod
- **语言**: TypeScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

执行 SQL 脚本创建数据库表结构：

```bash
psql -U postgres -c "CREATE DATABASE ticket_system"
psql -U postgres -d ticket_system -f server/database/schema.sql
```

### 4. 启动 Pusher 服务

需要部署 Pusher 的开源替代方案（如 [pusher/pusher-http-go](https://github.com/pusher/pusher-http-go) 或使用 [Centrifugo](https://centrifugal.dev/)）。

### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
├── server/
│   ├── api/                    # API 路由
│   │   ├── trpc/[trpc].ts     # TRPC 入口
│   │   ├── sse.get.ts         # SSE 推送
│   │   └── pusher/auth.post.ts # Pusher 鉴权
│   ├── database/              # 数据库相关
│   │   ├── client.ts          # 数据库连接
│   │   └── schema.sql         # 表结构
│   ├── trpc/                  # TRPC 相关
│   │   ├── context.ts         # TRPC 上下文
│   │   ├── trpc.ts            # TRPC 实例
│   │   └── routers/           # 路由定义
│   │       ├── index.ts       # 主路由
│   │       └── ticket.ts      # 工单路由
│   └── utils/                 # 工具函数
│       ├── pusher.ts          # Pusher 客户端
│       └── sla.ts             # SLA 计算
├── components/                # Vue 组件
│   ├── SlaBadge.vue          # SLA 倒计时徽章
│   ├── CreateTicketModal.vue # 创建工单弹窗
│   └── TransferModal.vue     # 转派工单弹窗
├── composables/               # 组合式函数
│   ├── types.ts              # 类型定义
│   ├── useSlaCountdown.ts    # SLA 倒计时
│   └── useTicketStore.ts     # 工单状态管理
├── layouts/                   # 布局
│   └── default.vue           # 默认布局
├── pages/                     # 页面
│   ├── index.vue             # 工单列表
│   ├── create.vue            # 创建工单
│   └── ticket/[id].vue       # 工单详情
├── plugins/                   # 插件
│   ├── trpc.ts               # TRPC 客户端
│   └── pusher.client.ts      # Pusher 客户端
└── nuxt.config.ts            # Nuxt 配置
```

## 工单状态流转

```
待接单 (pending)
    ↓
处理中 (processing)  ← 客服接单
    ↓
待验收 (reviewing)   ← 客服提交解决方案
    ↓
已完成 (completed)   ← 客户验收通过
```

## SLA 策略

- **响应 SLA**: 30 分钟内必须有客服接单
- **解决 SLA**: 2 小时内必须完成工单
- SLA 状态实时更新并通过 WebSocket 推送到前端

## API 说明

### TRPC 路由

- `ticket.list` - 获取工单列表
- `ticket.getById` - 获取工单详情
- `ticket.create` - 创建工单
- `ticket.assign` - 指派工单
- `ticket.transfer` - 转派工单
- `ticket.updateStatus` - 更新工单状态
- `ticket.addNote` - 添加内部备注
- `ticket.getAgents` - 获取客服列表
- `ticket.getStats` - 获取统计数据

### SSE 端点

- `GET /api/sse` - 订阅工单列表更新
- `GET /api/sse?ticketId={id}` - 订阅特定工单更新

## License

MIT
