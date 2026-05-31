# GameServer 原地升级 Operator

基于 Go + OpenKruise 的游戏服原地升级 Operator，支持不重建 Pod 的容器镜像替换，并通过 Agent Sidecar 实现玩家数据热迁移。

## 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    GameServer Operator                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │  Controller   │  │  UpgradeMgr  │  │  AgentClient │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    GameServer Pods                        │   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │  Pod-1                                               ││   │
│  │  │  ┌──────────────────┐  ┌──────────────────┐        ││   │
│  │  │  │  GameServer      │  │  Agent Sidecar   │        ││   │
│  │  │  │  (Main Container)│  │  (Migration)     │        ││   │
│  │  │  └──────────────────┘  └──────────────────┘        ││   │
│  │  └─────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Kruise CloneSet                        │   │
│  │  (原地升级 Pod，不重建)                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Vue3 Dashboard (Frontend)                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GameServer List | Detail View | Upgrade Progress        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
e:\trae\151
├── operator/                          # Go Operator
│   ├── api/v1alpha1/                  # CRD 类型定义
│   │   ├── types.go                   # GameServer 类型
│   │   └── register.go                # 注册和 DeepCopy
│   ├── controllers/                   # Controller 逻辑
│   │   └── gameserver_controller.go   # 主控制器
│   ├── pkg/
│   │   ├── agent/                     # Agent 客户端
│   │   ├── upgrade/                   # 升级管理器
│   │   └── metrics/                   # Prometheus 指标
│   ├── config/
│   │   ├── crd/                       # CRD 定义
│   │   ├── samples/                   # 示例 YAML
│   │   ├── rbac/                      # RBAC 配置
│   │   └── manager/                   # Operator 部署
│   ├── main.go                        # 入口文件
│   ├── go.mod
│   └── Dockerfile
├── agent/                             # Agent Sidecar
│   ├── cmd/main.go                    # Agent 入口
│   ├── pkg/
│   │   ├── migration/                 # 迁移管理器
│   │   └── server/                    # HTTP 服务
│   ├── go.mod
│   └── Dockerfile
└── frontend/                          # Vue3 前端
    ├── src/
    │   ├── views/                     # 页面视图
    │   ├── components/                # 组件
    │   ├── api/                       # API 接口
    │   ├── types/                     # 类型定义
    │   ├── router/                    # 路由配置
    │   └── styles/                    # 样式
    ├── package.json
    └── vite.config.js
```

## 核心功能

### 1. 原地升级 (InPlace Upgrade)
- 使用 OpenKruise CloneSet 的 `InPlaceOnly` 升级策略
- 只替换容器镜像，不重建 Pod
- 保持网络标识和存储卷不变

### 2. 玩家数据热迁移
- Agent Sidecar 容器运行在每个 Pod
- 提供 HTTP API 进行玩家数据导入导出
- 支持冻结/解冻玩家状态
- 迁移过程记录详细日志

### 3. 升级状态管理
- 完整的状态机：Running → Upgrading → Migrating → Succeeded/Failed
- 实时更新升级进度百分比
- 记录每个 Pod 的升级状态
- 事件记录和条件追踪

### 4. 前端展示
- 游戏服列表视图
- 详细信息页面
- 升级进度实时展示
- 玩家迁移影响统计
- ECharts 图表可视化

## 快速开始

### 部署 CRD

```bash
kubectl apply -f operator/config/crd/gameserver-crd.yaml
```

### 部署 Operator

```bash
# 创建命名空间
kubectl create namespace gameserver-system

# 部署 RBAC
kubectl apply -f operator/config/rbac/role.yaml

# 部署 Operator
kubectl apply -f operator/config/manager/operator.yaml
```

### 创建 GameServer

```bash
kubectl apply -f operator/config/samples/gameserver-sample.yaml
```

### 触发升级

```bash
kubectl patch gameserver world-of-warcraft-server -n games --type='merge' \
  -p='{"spec":{"template":{"containers":[{"name":"gameserver","image":"gameserver/wow:v2.0.0"}]}}}'
```

### 查看状态

```bash
kubectl get gameservers -n games
kubectl describe gameserver world-of-warcraft-server -n games
```

## API 参考

### GameServer Spec

| 字段 | 类型 | 描述 |
|------|------|------|
| gameName | string | 游戏名称 |
| serverId | string | 服务器 ID |
| replicas | int | 副本数量 |
| template.containers | array | 容器定义 |
| upgradePolicy.strategy | string | 升级策略 (InPlace) |
| upgradePolicy.maxUnavailable | int/string | 最大不可用副本数 |
| upgradePolicy.migrationTimeoutSeconds | int | 迁移超时时间（秒） |
| upgradePolicy.agentPort | int | Agent 端口 |

### GameServer Status

| 字段 | 类型 | 描述 |
|------|------|------|
| phase | string | 当前阶段 |
| currentVersion | string | 当前版本 |
| targetVersion | string | 目标版本 |
| readyReplicas | int | 就绪副本数 |
| updatedReplicas | int | 已升级副本数 |
| onlinePlayers | int | 在线玩家数 |
| upgradeProgress | object | 升级进度 |
| migrationStatus | object | 迁移状态 |
| conditions | array | 条件列表 |

### Agent API

| 端点 | 方法 | 描述 |
|------|------|------|
| /health | GET | 健康检查 |
| /players | GET | 获取玩家列表 |
| /players/{id} | GET | 获取单个玩家 |
| /players/{id}/export | GET | 导出玩家数据 |
| /players/import | POST | 导入玩家数据 |
| /migrate | POST | 批量迁移 |
| /freeze | POST | 冻结玩家 |
| /unfreeze | POST | 解冻玩家 |
| /status | GET | Agent 状态 |

## Prometheus 指标

| 指标 | 描述 |
|------|------|
| gameserver_upgrade_total | 升级总数 |
| gameserver_upgrade_progress_percentage | 升级进度百分比 |
| gameserver_online_players | 在线玩家数 |
| gameserver_migration_players | 迁移玩家数 |
| gameserver_replicas | 副本数 |
| gameserver_upgrade_duration_seconds | 升级耗时 |

## 前端开发

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000 查看 Dashboard。

## 升级流程

1. **用户触发升级**：更新 GameServer 的镜像版本
2. **Operator 检测变更**：Controller 检测到版本变化
3. **进入升级阶段**：状态变为 Upgrading
4. **逐个升级 Pod**：
   - 冻结当前 Pod 玩家
   - 通过 Agent 导出玩家数据
   - 迁移玩家到临时存储
   - 原地升级 Pod 镜像
   - 等待 Pod 就绪
   - 导入玩家数据到新 Pod
   - 解冻玩家
5. **更新进度**：实时更新升级进度
6. **完成升级**：所有 Pod 升级完成，状态变为 Succeeded

## 注意事项

1. 需要先安装 OpenKruise
2. Agent 需要与游戏服容器共享卷（用于临时存储玩家数据）
3. 升级过程中会自动处理玩家迁移
4. 建议在低峰期进行升级
5. 可配置最大不可用副本数控制升级速度
