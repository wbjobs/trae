# Thanos Downsampler

跨集群指标下采样工具，基于 Go + Prometheus + Thanos 构建。从多个 Thanos 接收器拉取指标，对长时间范围（>30 天）自动使用 LTTB 算法进行下采样，提供 Grafana 数据源插件兼容的 API。

## 功能特性

- ✅ **多集群支持**: 从多个 Thanos Receiver 端点并行拉取指标
- ✅ **自动下采样**: 时间范围超过 30 天时自动启用 LTTB 下采样
- ✅ **LTTB 算法**: 使用 Largest Triangle Three Buckets 算法保留数据视觉特征
- ✅ **多粒度支持**: 5m / 1h / 1d 三种下采样粒度可选
- ✅ **Grafana 兼容**: 兼容 Simple JSON 数据源规范
- ✅ **缓存机制**: 内置查询结果缓存，提升响应速度
- ✅ **Prometheus API**: 提供兼容 Prometheus 的查询 API

## 架构设计

```
┌─────────────┐
│   Grafana   │
└──────┬──────┘
       │  Simple JSON API
       ▼
┌──────────────────────────┐
│    Thanos Downsampler    │
│  ┌─────────────────────┐ │
│  │  Grafana API Layer  │ │
│  └──────────┬──────────┘ │
│             ▼            │
│  ┌─────────────────────┐ │
│  │   Metrics Service   │ │
│  │  (Downsampling +    │ │
│  │    Cache)           │ │
│  └──────────┬──────────┘ │
└─────────────┼────────────┘
              │
       ┌──────┴──────┐
       ▼             ▼
┌───────────┐ ┌───────────┐
│  Thanos   │ │  Thanos   │
│ Receiver 1│ │ Receiver 2│
└───────────┘ └───────────┘
```

## 快速开始

### 1. 编译

```bash
# 下载依赖
make deps

# 编译
make build

# 运行
make run
```

### 2. Docker 部署

```bash
# 构建镜像
make docker-build

# 运行容器
make docker-run
```

### 3. 配置

编辑 `config.yaml`:

```yaml
server:
  port: 8080
  host: "0.0.0.0"

thanos:
  endpoints:
    - "http://thanos-receiver-1:10902"
    - "http://thanos-receiver-2:10902"
  query_timeout: 300
  max_retries: 3

downsampling:
  auto_threshold_days: 30
  granularities:
    - "5m"
    - "1h"
    - "1d"
  default_granularity: "1h"
  lttb_threshold: 10000

cache:
  enabled: true
  default_ttl_seconds: 3600
  max_items: 10000
```

## API 接口

### Grafana 数据源 API

兼容 Grafana Simple JSON 数据源插件：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/grafana/search` | 搜索指标 |
| POST | `/grafana/query` | 查询时序数据 |
| POST | `/grafana/annotations` | 查询注释 |
| GET | `/grafana/tag-keys` | 获取标签键 |
| POST | `/grafana/tag-values` | 获取标签值 |

### Prometheus 兼容 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/query` | 瞬时查询 |
| GET | `/api/v1/query_range` | 范围查询 |
| GET | `/api/v1/labels` | 获取标签列表 |
| GET | `/api/v1/label/:name/values` | 获取标签值 |

#### 范围查询示例

```bash
curl "http://localhost:8080/api/v1/query_range?query=up&start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z&step=1m&granularity=1h"
```

响应:
```json
{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [...]
  },
  "downsampled": true,
  "granularity": "1h",
  "from_cache": false
}
```

### 其他接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/status` | 状态和配置 |

## Grafana 配置

1. 安装 [Simple JSON 数据源插件](https://grafana.com/grafana/plugins/grafana-simple-json-datasource/)

2. 添加新数据源:
   - Type: SimpleJson
   - URL: `http://thanos-downsampler:8080/grafana`

3. 保存并测试

## 自适应下采样算法（Adaptive LTTB）

本项目使用 **自适应下采样算法**，结合了 LTTB 视觉特征保留、极值保护和**变化率感知**能力：

### 核心特性

1. **自适应分桶**：根据数据变化率动态调整采样密度
2. **极值强制保留**：全局/局部极值点 100% 保留
3. **视觉特征保留**：LTTB 最大三角形面积算法
4. **智能分配点数**：变化剧烈区域保留更多点，平稳区域降低采样

### 自适应策略

| 区域变化率 | 采样策略 | 自适应因子 |
|-----------|---------|-----------|
| < 0.1（极平稳）| 大幅降低采样 | 2.5x |
| 0.1 - 0.3（平稳）| 适度降低采样 | 1.8x |
| 0.3 - 0.5（正常）| 轻微降低采样 | 1.3x |
| 0.5 - 0.7（活跃）| 标准采样 | 1.0x |
| \> 0.7（剧烈）| 提升采样密度 | 0.6x |

### 效果对比

| 场景 | 固定采样 | 自适应采样 |
|------|---------|-----------|
| 平稳区域 | 浪费点数 | ✅ 智能压缩 |
| 剧烈变化区 | 可能平滑 | ✅ 保留细节 |
| 峰值/谷值 | 可能丢失 | ✅ 强制保留 |
| 整体点数 | 固定不变 | 动态平衡 |
| 存储效率 | 一般 | 优秀 |

### 算法流程

```
输入数据 → 计算变化率 → 检测极值点 → 自适应分桶
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              桶内有极值?                      桶内无极值
                    ↓                               ↓
              优先保留极值点                LTTB 选择关键点
                    └───────────────┬───────────────┘
                                    ↓
                              输出下采样结果
```

## 下采样策略

- **< 30 天**: 直接返回原始数据
- **>= 30 天**: 自动启用下采样，默认使用 1h 粒度
- **可配置**: 通过 `granularity` 参数强制指定 5m/1h/1d

## 项目结构

```
thanos-downsampler/
├── cmd/
│   └── main.go           # 主程序入口
├── pkg/
│   ├── api/              # HTTP API 层
│   │   ├── handlers.go   # 请求处理
│   │   └── server.go     # 服务器
│   ├── cache/            # 缓存服务
│   ├── config/           # 配置管理
│   ├── downsampler/      # LTTB 下采样算法
│   ├── metrics/          # 指标服务
│   └── thanos/           # Thanos 客户端
├── config.yaml           # 配置文件
├── Dockerfile
├── Makefile
└── go.mod
```

## 性能优化

1. **并行查询**: 多 Thanos 端点并行查询
2. **结果缓存**: 内置内存缓存，避免重复计算
3. **流式处理**: 数据点流式处理，降低内存占用
4. **连接复用**: HTTP 连接池复用

## 许可证

MIT
