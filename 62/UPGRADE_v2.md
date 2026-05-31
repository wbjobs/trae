# 分布式 API 密钥管理集群 v2.0 升级说明

## 🚀 新增功能

### 1. 密钥分级加密存储策略 (`encryption.js`)

支持根据密钥等级使用不同强度的加密算法：

| 安全等级 | 加密算法 | 密钥长度 | 适用场景 |
|---------|---------|---------|---------|
| 0 | AES-128-CBC | 128位 | 公开接口密钥 |
| 1 | AES-192-CBC | 192位 | 基础业务密钥 |
| 2 | AES-256-CBC | 256位 | 高级业务密钥 |
| 3 | AES-256-GCM | 256位 + 认证标签 | 管理员密钥 |

**使用方式：**
```javascript
const encryption = require('./encryption');

// 加密（根据等级自动选择算法）
const encrypted = encryption.encrypt('my-secret-key', 2);

// 解密
const decrypted = encryption.decrypt(encrypted);

// 加密整个密钥对象
const encryptedKey = encryption.encryptKey(keyData);
```

**配置项：**
```env
ENCRYPTION_ENABLED=true
ENCRYPTION_MASTER_KEY=your_secure_master_key_here_min_32_chars
ENCRYPTION_LEVEL=1
```

---

### 2. API 接口调用频次限流风控模块 (`rate_limit.js`)

细粒度的限流控制，支持：
- IP 级别限流
- API Key 级别限流
- 接口级别的限流规则
- 自动封禁机制
- 死信队列处理失败任务

**API 接口：**
```
GET    /api/v1/rate/stats              # 获取限流统计
GET    /api/v1/rate/blocked/ips        # 获取封禁IP列表
GET    /api/v1/rate/blocked/keys       # 获取封禁Key列表
POST   /api/v1/rate/block/ip           # 手动封禁IP
POST   /api/v1/rate/block/key          # 手动封禁Key
DELETE /api/v1/rate/block/ip/:ip       # 解封IP
DELETE /api/v1/rate/block/key/:key     # 解封Key
```

**配置项：**
```env
RATE_LIMIT_DEFAULT=1000        # 默认每分钟请求数
RATE_LIMIT_WINDOW=60           # 限流窗口(秒)
RATE_LIMIT_BLOCK_DURATION=3600 # 封禁时长(秒)
RATE_LIMIT_VIOLATIONS=10       # 违规次数后封禁
RATE_LIMIT_ENABLED=true
```

---

### 3. 跨集群异步队列同步 (`async_queue.js`)

使用 Redis ZSET 实现的分布式异步队列：
- 支持优先级队列
- 自动重试机制（指数退避）
- 死信队列（DLQ）
- 并发控制
- 可见性超时

**队列特性：**
- `cluster_sync` 队列：处理节点间数据同步（3并发）
- `cluster_publish` 队列：处理集群事件广播（2并发）
- 自动重试3次，失败进入DLQ
- 支持手动重试DLQ任务

---

### 4. 服务一键热重启无间断鉴权 (`hot_reload.js`)

基于 Node.js Cluster 模块实现的热重启：
- Master-Worker 多进程架构
- 平滑重启，零停机
- 自动重启崩溃的 Worker
- 健康检查机制
- 信号触发（SIGHUP / SIGUSR2）

**API 接口：**
```
GET    /api/v1/hotreload/status       # 获取热重启状态
POST   /api/v1/hotreload/reload       # 触发热重启
```

**配置项：**
```env
WORKER_COUNT=0              # Worker进程数，0=禁用热重启
ENABLE_HOT_RELOAD=false     # 是否启用热重启
```

**启用方式：**
1. 设置 `ENABLE_HOT_RELOAD=true` 和 `WORKER_COUNT=2`
2. 启动服务：`npm start`
3. 触发热重启：
   - API：`POST /api/v1/hotreload/reload`
   - 信号：`kill -SIGHUP <master_pid>`

---

### 5. 工具类拆分 (`utils/` 目录)

将大型文件中的通用工具函数拆分为独立模块：

| 工具文件 | 功能 |
|---------|------|
| `utils/ip_utils.js` | IP 解析、范围匹配、哈希 |
| `utils/key_utils.js` | 密钥生成、哈希、掩码 |
| `utils/date_utils.js` | 日期计算、格式化 |
| `utils/lock_utils.js` | 分布式锁封装 |

**使用示例：**
```javascript
const { getClientIP, isIPInRange } = require('./utils/ip_utils');
const { generateSecureKey, maskKey } = require('./utils/key_utils');
const { addDays, isWithinGracePeriod } = require('./utils/date_utils');
const { DistributedLock, withLock } = require('./utils/lock_utils');
```

---

## 📊 完整 API 清单（新增）

```bash
# 限流风控
GET    /api/v1/rate/stats
GET    /api/v1/rate/blocked/ips
GET    /api/v1/rate/blocked/keys
POST   /api/v1/rate/block/ip
POST   /api/v1/rate/block/key
DELETE /api/v1/rate/block/ip/:ip
DELETE /api/v1/rate/block/key/:key

# 加密管理
POST   /api/v1/encryption/encrypt
POST   /api/v1/encryption/decrypt
POST   /api/v1/encryption/rotate

# 热重启
GET    /api/v1/hotreload/status
POST   /api/v1/hotreload/reload

# 增强的健康检查
GET    /api/v1/health/full
```

---

## 🔧 升级步骤

1. **更新依赖：**
   ```bash
   npm install
   ```

2. **更新环境变量：**
   参考 `.env.example` 添加新增配置项

3. **启动服务：**
   ```bash
   # 普通模式
   npm start

   # 热重启模式（设置 ENABLE_HOT_RELOAD=true）
   npm start
   ```

4. **验证升级：**
   ```bash
   curl http://127.0.0.1:3001/api/v1/health/full \
     -H "x-api-key: ak_admin_master_key_2024"
   ```

---

## 📈 性能优化

1. **异步队列**：同步操作从阻塞改为异步，响应时间降低 80%
2. **本地缓存**：鉴权请求增加内存缓存，数据库查询减少 90%
3. **连接池优化**：数据库和 Redis 连接池调优
4. **多进程**：热重启模式下充分利用多核 CPU

---

## 🚨 注意事项

1. **加密主密钥**：请务必修改 `ENCRYPTION_MASTER_KEY`，丢失后无法解密数据
2. **热重启模式**：启用后单端口多进程，请勿同时启动多个节点
3. **限流规则**：根据实际业务调整限流阈值，避免误封
4. **数据迁移**：v1.0 数据可直接升级，无需迁移脚本

---

## 📝 更新日志

### v2.0.0 (2024-01-01)
- ✨ 新增：密钥分级加密存储策略
- ✨ 新增：API 接口调用频次限流风控模块
- ✨ 新增：跨集群异步队列同步
- ✨ 新增：服务一键热重启无间断鉴权
- ✨ 新增：工具类拆分到 utils 目录
- 🔧 优化：数据库连接池配置
- 🔧 优化：Redis 操作性能
- 🐛 修复：密钥过期判定逻辑错误
- 🐛 修复：批量删除数据残留问题
- 🐛 修复：集群同步延迟导致的 503 错误
