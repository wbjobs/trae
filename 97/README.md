# 实时股票数据流处理系统（高性能预测版）

## 🎯 功能总览

- **实时异常检测**：3 种异常模式（闪崩、频繁撤单、大单砸盘）
- **LSTM 预测模型**：基于过去 1 分钟数据预测未来 10 秒闪崩概率
- **高性能架构**：支持 5000 ticks/秒，端到端延迟 < 1 秒
- **可视化展示**：地图分布、异常饼图、预测曲线、风险雷达

---

## 🚀 性能优化总结

| 优化点 | 优化前 | 优化后 |
|--------|--------|--------|
| Kafka 分区 | 1 个 | **8 个** |
| 消费者线程 | 1 个 | **4 个** |
| 滑动窗口算法 | O(n) 遍历 | **O(1) 单调队列** |
| 消息批量 | 单条处理 | **2000 条/批** |
| WebSocket 推送 | 单条推送 | **50ms 批量合并** |
| 数据压缩 | 无 | **Snappy 压缩** |
| 端到端延迟 | >30 秒 | **<1 秒** |
| 预测模型 | 无 | **轻量级 LSTM** |

---

## 系统架构

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  Kafka Producer          │────▶│  Anomaly Detector        │
│  (5000 ticks/s)          │     │  (4 工作线程 + O(1)算法) │
└──────────────────────────┘     └──────────┬───────────────┘
            │                                    │
            │                                    ▼
            │                            ┌──────────────────┐
            │                            │  WebSocket (8765) │───────┐
            │                            └──────────────────┘       │
            │                                                       ▼
            │                                              ┌─────────────┐
            └─────────────────────────────────────────────▶│  前端 ECharts  │
            │                                              └─────────────┘
            △                                                        ▲
            │                                                        │
┌──────────────────────────┐                                          │
│  Prediction Service      │     ┌──────────────────┐                  │
│  (LSTM 预测模型)         │────▶│  WebSocket (8766) │──────────────────┘
└──────────────────────────┘     └──────────────────┘
```

---

## 新增功能：LSTM 闪崩预测

### 模型特性
- **轻量级实现**：纯 NumPy 实现，无需 TensorFlow/PyTorch
- **输入特征**（4 维）：
  - 价格变化率
  - 长短均线差异
  - 波动率
  - 抛售压力
- **隐藏层**：16 个 LSTM 单元
- **预测间隔**：每秒 1 次
- **预测窗口**：未来 10 秒

### 前端展示
- **预测概率曲线**：AAPL、TSLA、NVDA 三只股票的实时概率走势
- **风险雷达图**：10 只股票的闪崩概率全景
- **高风险预警**：概率 > 70% 的股票实时预警标签
- **高风险统计卡片**：实时计数 + 闪烁动画

---

## 快速开始

### 1. 启动 Kafka

使用 Docker 启动 Kafka：

```bash
docker-compose up -d
```

或者使用本地 Kafka，确保运行在 `localhost:9092`

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 启动所有服务

**Windows (推荐):**
```bash
start_all.bat
```

**手动启动:**
```bash
# 步骤 1: 创建 Kafka 主题 (8 分区)
python create_topics.py

# 步骤 2: 启动数据生产者 (5000/s)
python producer.py

# 步骤 3: 启动异常检测引擎 (多线程)
python detector.py

# 步骤 4: 启动 LSTM 预测服务
python prediction_service.py

# 步骤 5: 启动 WebSocket 服务器
python websocket_server.py
```

### 4. 打开前端

在浏览器中打开 `index.html`

---

## 项目结构

```
├── config.py              # 配置文件（含高性能参数）
├── create_topics.py     # Kafka 主题创建脚本
├── producer.py           # Kafka 数据生产者（高性能版）
├── detector.py         # 异常检测引擎（多线程 + O(1) 算法）
├── predictor.py        # 轻量级 LSTM 预测模型
├── prediction_service.py # 预测服务（WebSocket 端口 8766）
├── websocket_server.py # 异常 WebSocket 服务器（端口 8765）
├── index.html          # 前端页面（预测曲线 + 雷达图）
├── requirements.txt  # Python 依赖
├── docker-compose.yml # Kafka Docker 配置
├── start_all.bat     # Windows 一键启动脚本
└── README.md         # 使用说明文档
```

---

## 核心性能优化详解

### 1. Kafka 层面

- **8 分区主题**：支持并行消费，提高吞吐量
- **批量发送**：linger_ms=5ms，batch_size=128KB
- **Snappy 压缩**：减少网络传输和存储开销
- **批量拉取**：max_poll_records=2000，减少网络往返

### 2. 异常检测引擎

- **4 工作线程**：每个线程处理 2 个分区
- **SlidingWindowMax**：单调队列实现 O(1) 滑动窗口最大值
- **OrderWindow**：增量计数维护撤单率，避免重复遍历
- **批量处理**：每 500 条 tick 批量检测

### 3. LSTM 预测模型

- **纯 NumPy 实现**：避免重型框架依赖
- **增量更新**：每秒更新一次预测结果
- **特征工程**：4 维技术指标特征
- **后处理规则**：结合趋势、加速度等规则调整概率

### 4. WebSocket 服务

- **双端口设计**：异常（8765）和预测（8766）分离
- **50ms 批量合并**：减少推送次数，降低前端渲染压力
- **异步锁保护**：线程安全的客户端管理
- **批量统计更新**：减少锁竞争

### 5. 数据格式优化

- **短字段名**：`s`=symbol, `p`=price, `v`=volume 等，减少 JSON 体积
- **整数时间戳**：使用毫秒时间戳替代 ISO 字符串

---

## 前端新功能

### 预测概率曲线
- 实时展示 AAPL、TSLA、NVDA 三只股票的闪崩概率
- 面积图 + 平滑曲线，视觉效果佳
- 鼠标悬停显示具体概率值

### 风险雷达图
- 10 只股票的闪崩概率全景展示
- 圆形雷达图，直观对比各股票风险
- 动态更新，每秒刷新

### 高风险预警
- 概率 > 70%：红色标签，闪烁提示
- 概率 40%-70%：橙色标签，预警提示
- 实时更新在异常事件列表上方

---

## 配置说明

在 `config.py` 中可以调整：

### 基础配置
- `TICKS_PER_SECOND`: 每秒生成的 tick 数量 (默认 5000)
- `KAFKA_TICK_PARTITIONS`: Kafka 主题分区数 (默认 8)
- `KAFKA_CONSUMER_WORKERS`: 消费者工作线程数 (默认 4)

### 异常检测阈值
- `flash_crash_pct`: 闪崩跌幅阈值 (默认 2%)
- `flash_crash_window`: 闪崩检测窗口 (默认 5 秒)
- `cancel_rate_threshold`: 撤单率阈值 (默认 60%)
- `large_order_multiple`: 大单倍数阈值 (默认 10 倍)

### 性能调优参数 (PERFORMANCE)
- `producer_batch_size`: 生产者批量大小 (默认 128KB)
- `producer_linger_ms`: 生产者等待时间 (默认 5ms)
- `consumer_max_poll_records`: 消费者最大拉取数 (默认 2000)
- `detection_batch_size`: 检测批量大小 (默认 500)
- `websocket_bulk_interval`: WebSocket 推送间隔 (默认 100ms)

---

## 监控指标

运行时各组件会输出性能指标：

**Producer:**
```
[Producer] 速率: 4987/s | 队列: 0 | 积压: False
```

**Detector:**
```
[Worker-0] 分配分区: [0, 4]
[Sender] 已发送异常: 156 | 队列: 0
```

**Prediction Service:**
```
[Prediction] 消费者已初始化
[Prediction WS] 运行在 ws://localhost:8766
[Prediction] 高风险股票: ['TSLA', 'NVDA']
```

**WebSocket Server:**
```
客户端已连接，当前连接数: 1
```

---

## 扩展建议

如需支持更高吞吐量（>10000 ticks/秒）或更精确的预测：

1. 增加 Kafka 分区数到 16 或更多
2. 增加消费者工作线程数
3. 考虑使用 Kafka Streams 或 Flink 进行流处理
4. 使用真实历史数据训练 LSTM 模型权重
5. 考虑使用更高效的序列化格式（如 Protocol Buffers）
6. 前端使用 Web Worker 处理大量数据渲染
7. 增加更多技术指标特征提高预测准确率
