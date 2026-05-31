# APISIX 灰度路由系统

一个完整的 APISIX 网关灰度路由解决方案，支持 `x-version` 请求头动态路由、用户 ID 哈希一致性灰度，并提供可视化管理界面。

## ✨ 特性

### 核心功能
- **动态路由**: 根据 `x-version` 请求头路由到 v1/v2/canary 不同后端
- **用户 ID 灰度**: 支持按用户 ID 哈希一致性的流量百分比灰度
- **白名单机制**: 支持指定用户 ID 列表始终匹配特定规则
- **优先级匹配**: 规则按优先级从高到低匹配，第一个匹配的规则生效
- **Wasm 支持**: 可选的 Wasm 插件实现高性能路由（Go/Rust）

### 热更新优化 (v2.0 新增)
- **双缓冲配置**: 配置更新不中断正在处理的请求，解决 502 问题
- **分布式锁**: 避免多 worker 竞态更新
- **前置验证**: 无效配置不会导致服务中断
- **多级降级**: etcd 故障时使用内存缓存，不影响服务
- **防抖机制**: 1秒内多次更新只处理最后一次

### 管理界面
- **React + Ant Design**: 现代化的管理界面
- **可视化编辑**: 表单化配置灰度规则
- **规则测试**: 输入用户 ID 即可测试匹配结果
- **仪表盘**: 查看规则统计和系统状态
- **导入导出**: 支持规则的批量导入导出

### 架构特性
- **etcd 存储**: 规则存储在 etcd，支持热更新
- **响应头诊断**: `x-gray-route`、`x-gray-config-version` 等响应头便于调试
- **健康检查**: 完整的健康检查 API
- **Docker 部署**: 一键部署整个栈

## 📁 项目结构

```
.
├── apisix/                          # APISIX 网关插件
│   ├── plugins/
│   │   └── gray-routing.lua         # Lua 插件（v2.0，含双缓冲热更新）
│   ├── wasm/
│   │   ├── go/                      # Go 版本 Wasm 插件
│   │   └── rust/                    # Rust 版本 Wasm 插件
│   └── config.yaml                  # APISIX 配置
├── backend/                         # 后端 API 服务
│   ├── src/
│   │   ├── routes/                  # API 路由
│   │   ├── services/                # 业务逻辑（含 etcd 服务）
│   │   ├── middleware/              # 中间件
│   │   └── utils/                   # 工具函数
│   └── Dockerfile
├── frontend/                        # React 前端
│   ├── src/
│   │   ├── pages/                   # 页面组件
│   │   ├── components/              # 公共组件
│   │   ├── services/                # API 服务
│   │   └── types/                   # TypeScript 类型
│   └── Dockerfile
├── docker/                          # 测试后端服务
│   ├── backend-v1/                  # v1 版本后端
│   ├── backend-v2/                  # v2 版本后端
│   └── backend-canary/              # canary 版本后端
├── tests/
│   └── hot-update-test.sh           # 热更新 502 问题测试脚本
├── docker-compose.yml               # 一键部署
├── HOTFIX-502.md                    # 502 问题修复详情
└── README.md
```

## 🚀 快速开始

### 环境要求
- Docker 20.10+
- Docker Compose v2+
- 4GB+ 内存

### 一键启动

```bash
# 克隆项目
git clone <repository-url>
cd gray-routing-system

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps
```

### 访问地址
- **管理界面**: http://localhost:3000
- **API 服务**: http://localhost:3001/api
- **APISIX 网关**: http://localhost:9080
- **APISIX Admin**: http://localhost:9180
- **etcd**: http://localhost:2379

### 测试后端
- **v1 后端**: http://localhost:8081
- **v2 后端**: http://localhost:8082
- **canary 后端**: http://localhost:8083

## 📖 使用指南

### 1. 配置 APISIX 路由

首先需要在 APISIX 中创建一个路由，并启用灰度插件：

```bash
curl -X PUT http://localhost:9180/apisix/admin/routes/1 \
-H "X-API-KEY: edd1c9f034335f136f87ad84b625c8f1" \
-H "Content-Type: application/json" \
-d '{
    "uri": "/*",
    "plugins": {
        "gray-routing": {
            "default_upstream": {
                "type": "v1",
                "nodes": [
                    {"host": "backend-v1", "port": 80, "weight": 1}
                ]
            },
            "enable_hot_update": true,
            "cache_ttl": 60
        }
    },
    "upstream": {
        "type": "roundrobin",
        "nodes": {
            "backend-v1:80": 1
        }
    }
}'
```

### 2. 通过管理界面创建规则

1. 访问 http://localhost:3000
2. 点击「灰度规则」→「新建规则」
3. 填写规则信息：
   - 规则名称：例如 "v2 版本灰度 10%"
   - 匹配条件：设置请求头 `x-version: v2`，流量百分比 10%
   - 上游配置：选择 v2 版本，配置后端节点
4. 点击保存，规则会自动同步到 etcd 并热更新生效

### 3. 测试灰度效果

```bash
# 测试 v1 版本（默认）
curl http://localhost:9080/api -I
# 应该看到 x-gray-route: v1

# 测试 v2 版本灰度
curl http://localhost:9080/api \
  -H "x-version: v2" \
  -H "x-user-id: user123" -I
# 根据用户 ID 哈希，10% 的用户会看到 x-gray-route: v2
```

### 4. 验证热更新修复效果

```bash
# 运行热更新测试脚本
bash tests/hot-update-test.sh
```

测试脚本会在 30 秒内：
- 后台频繁更新规则（每 0.5 秒一次）
- 前台持续发送请求（每 0.1 秒一次）
- 统计 502 错误数量
- 验证响应头是否正确

预期结果：**0 次 502 错误**

## 🔧 配置说明

### 插件配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rules` | array | `[]` | 静态规则列表（可选） |
| `default_upstream` | object | - | 默认上游（必填） |
| `etcd_watch_key` | string | `/apisix/plugins/gray-routing/rules` | etcd 规则存储路径 |
| `cache_ttl` | integer | 60 | 缓存过期时间（秒） |
| `enable_hot_update` | boolean | `true` | 是否启用热更新（v2.0+） |
| `debounce_delay` | integer | 1 | 防抖延迟（秒） |
| `enable_wasm` | boolean | `false` | 是否启用 Wasm 插件 |
| `wasm_plugin_name` | string | `gray_routing_wasm` | Wasm 插件名称 |

### 规则配置示例

```json
{
  "id": "rule-001",
  "name": "v2 版本灰度 10%",
  "description": "将 10% 的用户流量引导到 v2 版本",
  "enabled": true,
  "priority": 100,
  "match": {
    "header": "x-version",
    "value": "v2",
    "user_id_header": "x-user-id",
    "percentage": 10,
    "hash_key": "my-secret-key",
    "user_ids": ["user1", "user2", "user3"]
  },
  "upstream": {
    "type": "v2",
    "nodes": [
      {"host": "backend-v2", "port": 80, "weight": 1}
    ],
    "timeout": {
      "connect": 3000,
      "send": 3000,
      "read": 3000
    }
  }
}
```

### 匹配条件说明

1. **请求头匹配**: 当 `x-version: v2` 时，满足匹配基础条件
2. **白名单匹配**: 如果用户 ID 在 `user_ids` 列表中，直接匹配
3. **百分比匹配**: 根据用户 ID 哈希值决定是否匹配 `percentage` 百分比
4. **哈希一致性**: 相同用户 ID 始终落在同一侧，保证用户体验一致

## 🔍 诊断与监控

### 响应头说明

| 响应头 | 说明 |
|--------|------|
| `x-gray-route` | 匹配的上游版本 (v1/v2/canary) |
| `x-gray-rule-matched` | 是否匹配到规则 (true/false) |
| `x-gray-config-version` | 当前配置版本号 |
| `x-gray-routing-version` | 插件版本 (2.0) |

### 健康检查

```bash
# 检查后端 API 健康状态
curl http://localhost:3001/api/health

# 检查 etcd 连接状态
curl http://localhost:3001/api/health | jq '.services.etcd'
```

### 查看当前配置

```bash
# 查看所有规则
curl http://localhost:3001/api/rules

# 查看 etcd 中存储的原始配置
etcdctl get /apisix/plugins/gray-routing/rules
```

## 🐛 热更新 502 问题修复

### 问题现象

更新灰度规则时，正在处理的请求会短暂出现 502 Bad Gateway 错误。

### 修复方案 (v2.0)

详细修复说明请参考 [HOTFIX-502.md](./HOTFIX-502.md)

核心机制：
1. **双缓冲配置切换**: `active` / `standby` 双缓冲，原子切换指针
2. **分布式锁保护**: 使用 `lua-resty-lock` 避免多 worker 竞态
3. **配置前置验证**: 无效配置不生效，保留旧配置
4. **多级降级策略**: etcd → lrucache → 静态配置 → default_upstream
5. **防抖机制**: 1秒内多次更新只处理一次

### 性能影响

- 内存开销：约增加 10-20%（双缓冲存储两份配置）
- CPU 开销：每次更新增加约 1-2ms（配置验证和锁操作）
- 请求延迟：无明显增加（配置读取是本地内存操作）
- 并发能力：无影响（读写分离，读不加锁）

## 📚 API 文档

### 规则管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rules` | 获取所有规则 |
| `GET` | `/api/rules/:id` | 获取单个规则 |
| `POST` | `/api/rules` | 创建规则 |
| `PUT` | `/api/rules/:id` | 更新规则 |
| `DELETE` | `/api/rules/:id` | 删除规则 |
| `PATCH` | `/api/rules/:id/toggle` | 启用/禁用规则 |
| `GET` | `/api/rules/:id/test?userId=xxx` | 测试规则匹配 |
| `POST` | `/api/rules/reorder` | 重新排序规则 |
| `POST` | `/api/rules/import` | 导入规则 |
| `GET` | `/api/rules/export` | 导出规则 |

### 系统管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/config` | 获取当前配置 |
| `POST` | `/api/config/publish` | 发布配置 |

## 🧪 测试

### 单元测试

```bash
# 运行后端测试
cd backend
npm test
```

### 集成测试

```bash
# 启动服务
docker-compose up -d

# 运行热更新测试
bash tests/hot-update-test.sh
```

### 压测

```bash
# 使用 wrk 压测
wrk -t4 -c100 -d30s --latency \
  -H "x-version: v2" \
  -H "x-user-id: user123" \
  http://localhost:9080/api
```

## 🔒 安全建议

1. **修改默认密钥**: 修改 APISIX admin key 和 etcd 密码
2. **启用认证**: 为管理界面和 API 添加身份认证
3. **限制访问**: 限制 etcd 和 APISIX admin 的访问来源
4. **HTTPS**: 生产环境启用 HTTPS
5. **审计日志**: 记录所有规则变更操作

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## ❓ 常见问题

### Q: 为什么更新规则时还是有短暂延迟？

A: 热更新机制保证了零中断，但 etcd 同步和 lrucache 过期可能有 1-2 秒延迟。这是正常的，不会导致 502 错误。

### Q: 如何禁用热更新？

A: 在插件配置中设置 `"enable_hot_update": false`，插件将只使用静态配置。

### Q: 支持多少条规则？

A: 理论上没有限制。建议规则数量控制在 100 条以内，过多的规则可能影响匹配性能。

### Q: Wasm 插件和 Lua 插件有什么区别？

A: Wasm 插件性能更高（约 2-3 倍），但开发和调试较复杂。建议先用 Lua 插件，性能不够时再考虑 Wasm。

### Q: 如何回滚到 v1.0 版本？

A: 参考 [HOTFIX-502.md](./HOTFIX-502.md) 中的回滚方案。

## 📞 技术支持

如有问题，请：
1. 查看 [HOTFIX-502.md](./HOTFIX-502.md) 了解热更新修复细节
2. 查看 GitHub Issues 中是否已有类似问题
3. 提交 Issue 时请附上：
   - 复现步骤
   - APISIX 错误日志
   - 响应头信息
   - 规则配置 JSON

---

**注意**: 本项目 v2.0 版本已修复热更新 502 问题，建议在生产环境使用前先运行 `tests/hot-update-test.sh` 验证。
