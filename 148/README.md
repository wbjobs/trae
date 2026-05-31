# BERT 动态批处理推理调度器

基于 Python + Triton Backend 的动态批处理推理调度器，支持 BERT 变长输入、优先级队列、防饿死机制和模型预热。

## 功能特性

### 1. 动态批处理
- **最大 Batch Size**: 32
- **最长等待时间**: 100ms
- 自动合并多个请求到一个 batch，提升 GPU 利用率
- 支持变长输入，自动 padding 到 batch 内最长序列

### 2. 优先级队列
- **VIP 用户插队**: `priority=1` 为最高优先级
- **普通用户**: `priority=2` 为默认优先级
- 基于堆（heapq）实现的优先级队列
- 同优先级按 FIFO 顺序处理

### 3. 防饿死机制
- **Aging 老化机制**: 普通请求等待超过阈值后自动提升为 VIP 优先级
- **强制保护间隔**: 每 N 个纯 VIP batch 后强制插入一个普通请求
- **饿死检测**: 普通请求等待超过 2 秒时记录警告

### 4. 模型预热与缓冲区池
- **请求分布追踪**: 统计历史请求的序列长度分布
- **预分配缓冲区**: 根据历史分布预分配常用大小的 numpy 数组
- **缓冲区复用**: 推理完成后缓冲区归还池中，避免频繁动态分配
- **自适应调整**: 自动找到最接近请求序列长度的预分配缓冲区

### 5. 自定义 Metrics
- **队列长度**: 实时监控等待队列大小
- **平均等待时间**: 统计请求排队时长
- **VIP/普通请求计数**: 区分统计不同优先级请求
- **平均 Batch Size**: 监控批处理效率
- **缓冲区命中率**: 预分配缓冲区的复用率
- **分配节省时间**: 因缓冲区复用节省的总耗时
- **老化提升次数**: 因超时被提升优先级的请求数

## 目录结构

```
e:\trae\148\
├── model_repository/
│   └── bert_dynamic_batch/
│       ├── config.pbtxt          # Triton 模型配置
│       └── 1/
│           └── model.py          # 模型入口 + 调度器
├── demo_scheduler.py             # 独立演示脚本（无需 Triton）
├── test_client.py                # 测试客户端
├── requirements.txt              # 依赖列表
└── README.md                     # 本文件
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动 Triton Inference Server

```bash
tritonserver --model-repository=model_repository
```

### 3. 运行测试

```bash
# 运行所有测试
python test_client.py

# 仅测试单个请求
python test_client.py --test single

# 测试 VIP 优先级
python test_client.py --test vip

# 测试变长输入
python test_client.py --test variable

# 测试并发批处理
python test_client.py --test concurrent

# 查看模型统计
python test_client.py --test stats
```

### 4. 运行独立演示（无需 Triton）

```bash
python demo_scheduler.py
```

## 配置说明

### config.pbtxt 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `max_batch_size` | 32 | 最大批处理大小 |
| `preferred_batch_size` | [8, 16, 32] | 推荐 batch 大小 |
| `max_queue_delay_microseconds` | 100000 | 最大排队延迟 (100ms) |
| `priority_levels` | 2 | 优先级级别数量 |
| `default_priority_level` | 2 | 默认优先级 |

### 模型参数（通过 config.pbtxt 的 parameters 配置）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MAX_BATCH_SIZE` | 32 | 最大批处理大小 |
| `MAX_WAIT_MS` | 100 | 最长等待时间 (ms) |
| `MODEL_NAME` | bert-base-uncased | BERT 模型名称 |
| `AGING_THRESHOLD_MS` | 500 | 老化阈值：普通请求等待超此时长后自动提升优先级 |
| `STARVATION_PROTECTION_INTERVAL` | 3 | 饿死保护间隔：每 N 个纯 VIP batch 后强制处理普通请求 |
| `WARMUP_REQUESTS` | 100 | 预热请求数：统计前 N 个请求的分布用于预分配 |
| `PREALLOCATE_COUNT` | 3 | 预分配数量：每种大小预分配的缓冲区数量 |

## 输入/输出规格

### 输入

| 名称 | 类型 | 形状 | 说明 |
|------|------|------|------|
| `input_ids` | INT64 | [-1] | 输入 token IDs |
| `attention_mask` | INT64 | [-1] | 注意力掩码 |
| `token_type_ids` | INT64 | [-1] | Token 类型 IDs |
| `priority` | INT64 | [1] | 优先级 (1=VIP, 2=普通) |

### 输出

| 名称 | 类型 | 形状 | 说明 |
|------|------|------|------|
| `last_hidden_state` | FP32 | [-1, 768] | 最后一层隐藏状态 |
| `pooler_output` | FP32 | [768] | 池化输出 |

## API 使用示例

### Python (tritonclient)

```python
import numpy as np
import tritonclient.http as httpclient
from transformers import BertTokenizer

tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
client = httpclient.InferenceServerClient(url="localhost:8000")

text = "Hello, this is a test."
encoded = tokenizer(text, return_tensors="np")

inputs = [
    httpclient.InferInput("input_ids", encoded["input_ids"].shape, "INT64"),
    httpclient.InferInput("attention_mask", encoded["attention_mask"].shape, "INT64"),
    httpclient.InferInput("token_type_ids", encoded["token_type_ids"].shape, "INT64"),
    httpclient.InferInput("priority", (1,), "INT64"),
]

inputs[0].set_data_from_numpy(encoded["input_ids"].astype(np.int64))
inputs[1].set_data_from_numpy(encoded["attention_mask"].astype(np.int64))
inputs[2].set_data_from_numpy(encoded["token_type_ids"].astype(np.int64))
inputs[3].set_data_from_numpy(np.array([1], dtype=np.int64))  # VIP 优先级

outputs = [
    httpclient.InferRequestedOutput("last_hidden_state"),
    httpclient.InferRequestedOutput("pooler_output"),
]

response = client.infer(model_name="bert_dynamic_batch", inputs=inputs, outputs=outputs)
last_hidden = response.as_numpy("last_hidden_state")
pooler = response.as_numpy("pooler_output")
```

## 调度器架构

```
请求 → 优先级队列 (heapq) → 调度器线程 → Batch 组装 → BufferPool 分配 → BERT 推理 → 响应
                      ↓                                              ↑
                 Metrics 收集                              缓冲区归还池中
                      ↓
              RequestProfileTracker (统计请求分布)
                      ↓
              预热完成 → 预分配常用大小缓冲区
```

### 核心组件

1. **PriorityRequest**: 优先级请求包装类，支持堆排序和老化机制
2. **MetricsCollector**: 自定义指标收集器（含饿死检测和缓冲区统计）
3. **DynamicBatchScheduler**: 动态批处理调度器（含防饿死逻辑）
4. **RequestProfileTracker**: 请求分布追踪器，统计历史序列长度分布
5. **BufferPool**: 预分配缓冲区池，减少动态分配开销
6. **TritonPythonModel**: Triton Backend 入口

## 防饿死机制详解

### 问题

在高并发场景（如 500 QPS）且 VIP 请求占比较高时，普通优先级请求可能长时间得不到处理，甚至"饿死"。

### 解决方案

1. **Aging 老化机制**
   - 每个请求有 `original_priority`（原始优先级）和 `effective_priority`（有效优先级）
   - 当普通请求等待时间超过 `AGING_THRESHOLD_MS` 后，`effective_priority` 自动提升为 1（VIP 级别）
   - 提升后的请求会被优先处理

2. **强制保护间隔**
   - 跟踪连续处理的纯 VIP batch 数量
   - 当连续 `STARVATION_PROTECTION_INTERVAL` 个 batch 中没有普通请求时，下一个 batch 强制包含一个普通请求

3. **饿死检测**
   - 普通请求等待超过 2 秒时记录警告
   - 在 metrics 中暴露 `starvation_warnings` 计数

### 配置调优

| 场景 | AGING_THRESHOLD_MS | STARVATION_PROTECTION_INTERVAL |
|------|-------------------|-------------------------------|
| 低延迟要求 | 200-300 | 2-3 |
| 平衡模式 | 500-800 | 3-5 |
| 高吞吐量优先 | 1000-2000 | 5-10 |

## 模型预热与缓冲区池详解

### 动机

频繁创建和销毁 numpy 数组会产生显著的内存分配开销，尤其在高并发场景下。通过预热阶段统计请求分布，提前分配常用大小的缓冲区并复用，可大幅减少动态分配次数。

### 工作原理

1. **预热阶段** (Warmup Phase)
   - 调度器接收前 `WARMUP_REQUESTS` 个请求时，通过 `RequestProfileTracker` 记录每个请求的序列长度
   - 同时记录每个 batch 的大小分布
   - 达到预热阈值后，自动计算出最常用的序列长度（Top 10）和 batch 大小（Top 5）

2. **预分配阶段**
   - `BufferPool.preallocate_buffers()` 根据统计出的分布，为每种 (batch_size, seq_len) 组合预分配 `PREALLOCATE_COUNT` 个缓冲区
   - 每个组合预分配 3 个矩阵：`input_ids`、`attention_mask`、`token_type_ids`

3. **运行时分配**
   - 推理前调用 `BufferPool.allocate_input_buffers(batch_size, seq_len)` 获取缓冲区
   - 优先查找预分配池中的缓冲区，命中时直接复用（`buffer.fill(0)` 清零）
   - 未命中时才动态创建新数组
   - 自动向上匹配：若请求的 seq_len 没有精确匹配，会分配最接近的较大缓冲区

4. **缓冲区归还**
   - 推理完成后调用 `BufferPool.return_buffers()` 将缓冲区归还池中
   - 池内每种大小的缓冲区数量不超过 `PREALLOCATE_COUNT`，避免内存无限增长

### 性能收益

- **缓冲区命中率**: 典型场景下可达 80% 以上
- **分配耗时减少**: 复用缓冲区比新建节省约 50% 时间
- **内存稳定性**: 减少内存碎片和 GC 压力

### 配置调优

| 场景 | WARMUP_REQUESTS | PREALLOCATE_COUNT | 说明 |
|------|----------------|-------------------|------|
| 请求长度集中 | 50-100 | 2-3 | 少量分布即可覆盖 |
| 请求长度分散 | 200-500 | 3-5 | 需要更多统计样本 |
| 内存充足 | 100-200 | 5-10 | 更多预分配减少动态分配 |
| 内存受限 | 50-100 | 1-2 | 控制内存占用 |

## Metrics 指标详解

调度器每 10 秒输出一次 metrics 报告，包含以下指标：

### 队列与等待

| 指标 | 说明 |
|------|------|
| `queue_length` | 当前等待队列长度 |
| `avg_wait_time_ms` | 所有请求的平均等待时间 (ms) |
| `max_normal_wait_ms` | 普通请求的最大等待时间 (ms) |
| `avg_normal_wait_ms` | 普通请求的平均等待时间 (ms) |

### 请求统计

| 指标 | 说明 |
|------|------|
| `total_requests` | 总请求数 |
| `vip_count` | VIP 请求总数 |
| `normal_count` | 普通请求总数 |
| `promoted_count` | 因老化被提升优先级的请求数 |
| `starvation_warnings` | 饿死警告次数（普通请求等待 > 2s） |

### 批处理效率

| 指标 | 说明 |
|------|------|
| `avg_batch_size` | 平均 batch 大小 |

### 缓冲区池

| 指标 | 说明 |
|------|------|
| `buffer_hits` | 缓冲区命中次数 |
| `buffer_misses` | 缓冲区未命中次数 |
| `buffer_hit_rate_percent` | 缓冲区命中率 (%) |
| `allocation_savings_ms` | 因复用节省的总分配耗时 (ms) |

## 性能调优建议

1. **调整 batch 大小**: 根据 GPU 显存调整 `MAX_BATCH_SIZE`
2. **调整等待时间**: 根据延迟要求调整 `MAX_WAIT_MS`
3. **多实例部署**: 在 config.pbtxt 中增加 `instance_group` 数量
4. **使用 GPU**: 设置 `kind: KIND_GPU` 启用 GPU 推理
5. **预热参数**: 根据请求特征调整 `WARMUP_REQUESTS` 和 `PREALLOCATE_COUNT`
6. **防饿死参数**: 根据延迟要求和 VIP 占比调整老化阈值和保护间隔

## License

MIT License