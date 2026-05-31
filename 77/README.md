# 实时交易异常检测仪表板

一个高性能的实时交易数据异常检测系统，支持每秒1000条交易数据的处理、异常检测和可视化展示。

## 功能特性

### 核心功能
- ✅ **Kafka 消费者** - 使用 KafkaJS 实现高性能批量消费
- ✅ **10秒滚动窗口** - 实时流处理，支持滑动窗口统计
- ✅ **3σ 异常检测** - 基于移动平均和标准差的统计异常检测
- ✅ **WebSocket 实时推送** - 毫秒级数据推送到前端
- ✅ **InfluxDB 存储** - 时序数据持久化存储
- ✅ **ECharts 可视化** - 实时图表更新，异常点高亮

### 前端展示
- 📊 交易速率实时显示 (TPS)
- 📈 交易金额趋势图
- ⚠️  异常点高亮标记
- 🔔 告警列表实时更新
- 📱 响应式设计，支持移动端

## 系统架构

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Kafka      │────▶│  KafkaConsumer  │────▶│  StreamProcessor │
│  Producer   │     │   (批量消费)    │     │  (10秒窗口+3σ)   │
└─────────────┘     └─────────────────┘     └────────┬─────────┘
                                                      │
                          ┌───────────────────────────┤
                          │                           │
                          ▼                           ▼
              ┌─────────────────────┐     ┌──────────────────┐
              │ RootCauseAnalyzer   │     │  InfluxDBWriter  │
              │  (FP-Growth挖掘)    │     │  (时序存储)      │
              └───────────┬─────────┘     └──────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  WebSocket Server   │
              └───────────┬─────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │     Dashboard       │
              │  (根因分析可视化)   │
              └─────────────────────┘
```

## 技术栈

### 后端
- **Node.js** - 服务端运行时
- **KafkaJS** - Kafka 客户端
- **ws** - WebSocket 服务器
- **Express** - HTTP 服务器
- **@influxdata/influxdb-client** - InfluxDB 客户端
- **stats-lite** - 统计计算库

### 前端
- **ECharts** - 数据可视化图表库
- **原生 JavaScript** - 无框架依赖，轻量级

## 快速开始

### 前置要求
- Node.js >= 16.x
- Kafka 集群 (本地或远程)
- InfluxDB 2.x (可选，用于数据持久化)

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=trading-transactions
KAFKA_GROUP_ID=trading-dashboard-group

# InfluxDB Configuration (可选)
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=your-org
INFLUXDB_BUCKET=trading-data

# 流处理配置
WINDOW_SIZE_SECONDS=10
SIGMA_THRESHOLD=3
```

### 3. 启动服务

#### 方式一：使用真实 Kafka 数据

```bash
# 启动仪表板服务
npm start
```

#### 方式二：使用测试数据生成器

如果没有真实的 Kafka 数据源，可以使用内置的数据生成器：

```bash
# 终端1: 启动仪表板服务
npm start

# 终端2: 启动数据生成器 (每秒1000条)
npm run producer
```

### 4. 访问仪表板

打开浏览器访问：`http://localhost:3000`

## 项目结构

```
.
├── server.js              # 主服务入口
├── producer.js            # Kafka 数据生成器 (测试用)
├── package.json           # 项目依赖
├── .env                   # 环境变量配置
├── public/
│   ├── index.html         # 仪表板 HTML
│   └── app.js             # 前端 JavaScript
└── src/
    ├── kafkaConsumer.js   # Kafka 消费者模块
    ├── streamProcessor.js # 流处理和异常检测模块
    ├── influxDBWriter.js  # InfluxDB 写入模块
    └── websocketServer.js # WebSocket 服务器模块
```

## 异常检测算法说明

### 水印机制 (Watermark) 机制

系统实现了基于事件时间的水印机制，用于处理乱序数据和消息积压场景：

1. **事件时间驱动**：窗口分配基于消息的 `timestamp` 字段，而非处理时间
2. **水印推进**：水印 = 观察到的最大事件时间 - 允许延迟时间
3. **乱序处理**：允许最多5秒的乱序延迟（可配置）
4. **超时丢弃**：事件时间小于水印的数据被丢弃
5. **窗口触发**：当水印超过窗口结束时间时，窗口被触发计算

### 窗口计算流程

```
Kafka消息 → 事件时间提取 → 水印更新 → 窗口分配 → 水印检查 → 窗口触发 → 异常检测
```

### 异常检测算法

系统使用**移动平均 ± 3σ** 方法进行异常检测：

1. **滚动窗口**：每10秒为一个窗口，计算该窗口内交易金额的均值和标准差
2. **历史统计**：维护最近10个窗口的统计数据
3. **3σ 原则**：当窗口均值超出 `全局均值 ± 3 × 全局标准差` 范围时，判定为异常
4. **异常定位**：在异常窗口内，单笔交易金额超出同样范围的被标记为异常交易

### 检测流程

```
交易数据 → 10秒窗口 → 计算均值/标准差 → 历史统计 → 3σ检测 → 异常告警
```

### 告警级别

- **HIGH (红色)**：窗口均值高于上界，可能存在大额异常交易
- **MEDIUM (橙色)**：窗口均值低于下界，交易活跃度异常降低

## 异常根因分析

系统集成了基于FP-Growth算法的关联规则挖掘，自动分析异常发生前10秒内的维度组合模式。

### FP-Growth 关联规则挖掘

#### 核心概念

| 指标 | 说明 |
|------|------|
| **支持度 (Support)** | 包含该模式的交易占总交易的比例 |
| **置信度 (Confidence)** | 已知前件发生时，后件发生的概率 |
| **风险倍数 (Risk Ratio)** | 该模式在异常交易中的出现频率与正常交易中的比值 |

#### 分析维度

- **地区 (region)**：交易发生的地区
- **设备类型 (deviceType)**：用户使用的设备（iOS/Android/Web等）
- **商户 (merchant)**：交易商户

#### 工作流程

```
异常检测触发 → 收集异常前10秒数据 → FP-Growth挖掘 →
  生成关联规则 → 计算风险倍数 → 返回Top根因模式
```

#### 输出示例

```
最可能的根因: 地区:Beijing ∧ 设备:iOS → 异常 (置信度: 85.2%, 支持度: 12.5%, 风险倍数: 6.8x)
```

#### 配置参数

```env
# 根因分析配置
MIN_SUPPORT=0.15          # 最小支持度阈值
MIN_CONFIDENCE=0.6        # 最小置信度阈值
MAX_RULES=10              # 最多返回规则数
ROOT_CAUSE_WINDOW_SECONDS=10  # 分析窗口（秒）
```

## API 接口

### 健康检查

```
GET /health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "kafkaConnected": true,
  "websocketClients": 3
}
```

### WebSocket 消息协议

#### 服务端 → 客户端

| 消息类型 | 说明 | 数据结构 |
|---------|------|---------|
| `INIT` | 连接初始化 | `{ stats, alerts, currentRate }` |
| `STATS_UPDATE` | 窗口统计更新 | `{ timestamp, mean, stddev, count, min, max }` |
| `ALERT` | 异常告警 | `{ id, timestamp, severity, anomalies, ... }` |
| `RATE_UPDATE` | 交易速率更新 | `{ rate, timestamp }` |

#### 客户端 → 服务端

| 消息类型 | 说明 |
|---------|------|
| `PING` | 心跳检测 |

## 性能优化

### 后端优化
1. **批量消费**：使用 KafkaJS 的 `eachBatch` 模式，减少网络开销
2. **批量写入**：InfluxDB 写入采用批量模式，每100条或5秒刷新一次
3. **内存管理**：限制历史数据和告警的最大保留数量
4. **非阻塞IO**：所有操作均采用异步模式，避免阻塞事件循环

### 前端优化
1. **增量更新**：图表数据采用追加模式，避免全量重绘
2. **数据窗口**：前端最多保留100个数据点，防止内存泄漏
3. **防抖处理**：高频数据更新时自动合并渲染

## 常见问题

### Q: Kafka 连接失败怎么办？

A: 检查以下几点：
- Kafka broker 地址是否正确
- 网络是否可达 (telnet 测试)
- Kafka 是否启用了安全认证

### Q: InfluxDB 配置错误会影响系统运行吗？

A: 不会。InfluxDB 是可选组件，配置错误时系统会自动降级为内存模式，仅不做数据持久化。

### Q: 如何调整异常检测的灵敏度？

A: 修改 `.env` 文件中的 `SIGMA_THRESHOLD` 参数：
- 值越小，检测越灵敏 (更容易产生告警)
- 值越大，检测越宽松 (告警越少)
- 推荐范围：2 ~ 4

### Q: 前端连接不上 WebSocket？

A: 检查：
- 防火墙是否开放了 8080 端口
- 浏览器控制台是否有 CORS 错误
- 服务端日志中 WebSocket 服务是否正常启动

## 监控与运维

### 日志说明

系统输出以下关键日志：

```
[Kafka] Consumer connected successfully    # Kafka 连接成功
[WebSocket] New client connected. Total: 1  # 新客户端连接
[Stream] Window ... - Count: 10000, Mean: 500.00, StdDev: 150.00  # 窗口统计
⚠️  [ALERT] HIGH - 检测到 25 笔异常交易     # 异常告警
```

### 健康检查

通过 `/health` 接口监控系统状态：

```bash
curl http://localhost:3000/health
```

## 许可证

MIT License
