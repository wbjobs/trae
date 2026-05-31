# 日志模式演化分析系统

自动检测日志格式变化，追踪模式演化时间线，提供可视化 Sankey 图展示。

## 系统架构

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  日志输入    │ ──→  │  解析引擎    │ ──→  │  存储层      │
│ (Nginx日志) │      │ (格式识别)   │      │ (ClickHouse)│
└─────────────┘      └─────────────┘      └─────────────┘
                                                 │
                                                 ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  前端展示    │ ←──  │  API服务     │ ←──  │  演化检测    │
│ (Sankey图)  │      │ (FastAPI)    │      │ (模式比对)   │
└─────────────┘      └─────────────┘      └─────────────┘
```

## 核心功能

1. **多格式日志解析** - 支持 Combined、Main、JSON 等 Nginx 日志格式
2. **模式演化检测** - 自动检测字段新增/删除、类型变更、枚举值变化
3. **时间线分析** - 追踪模式变化的时间点和影响范围
4. **Sankey 图可视化** - 直观展示模式演化过程
5. **高性能存储** - 基于 ClickHouse 支持 10 亿条/天的日志处理

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 初始化 ClickHouse

```bash
clickhouse-client < init_clickhouse.sql
```

### 3. 运行演示

```bash
python main.py demo
```

### 4. 启动 Web 服务器

```bash
python app.py
```

访问 http://localhost:8000 查看可视化界面。

## API 接口

### 日志导入

```bash
# 单条导入
curl -X POST http://localhost:8000/api/v1/logs/ingest \
  -H "Content-Type: application/json" \
  -d '{"logs": ["192.168.1.1 - - [15/Jan/2024:10:00:00 +0000] \"GET / HTTP/1.1\" 200 1024 \"-\" \"Mozilla/5.0\""]}'

# 文件导入
curl -X POST http://localhost:8000/api/v1/logs/ingest-file \
  -F "file=@access.log"
```

### 模式检测

```bash
curl -X POST http://localhost:8000/api/v1/detection/detect?format_type=combined
```

### 查询接口

```bash
# 获取演化时间线
curl "http://localhost:8000/api/v1/evolution/timeline?start_time=2024-01-01T00:00:00"

# 获取 Sankey 图数据
curl "http://localhost:8000/api/v1/evolution/sankey"

# 获取影响分析
curl "http://localhost:8000/api/v1/evolution/impact?field_name=status"

# 获取统计摘要
curl "http://localhost:8000/api/v1/stats/summary"
```

## 配置说明

环境变量配置（前缀 `LOG_EV_`）:

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CLICKHOUSE_HOST | localhost | ClickHouse 主机 |
| CLICKHOUSE_PORT | 9000 | ClickHouse 端口 |
| CLICKHOUSE_USER | default | 用户名 |
| CLICKHOUSE_PASSWORD | | 密码 |
| CLICKHOUSE_DATABASE | log_evolution | 数据库名 |
| BATCH_SIZE | 10000 | 批处理大小 |
| DETECTION_INTERVAL_HOURS | 1 | 检测间隔（小时）|
| RETENTION_DAYS | 90 | 数据保留天数 |

## 项目结构

```
.
├── app.py                 # FastAPI 应用入口
├── main.py                # 命令行工具
├── config.py              # 配置管理
├── log_parser.py          # Nginx 日志解析器
├── storage.py             # ClickHouse 存储层
├── evolution_detector.py  # 模式演化检测引擎
├── analyzer.py            # 时间线和影响分析器
├── init_clickhouse.sql    # 数据库初始化脚本
├── requirements.txt       # Python 依赖
├── templates/
│   └── index.html         # 前端页面
└── README.md              # 项目说明
```

## 检测算法

### 字段新增检测
- 新字段出现在 >= 1% 的样本中时触发

### 字段删除检测
- 原有字段在 < 99% 的样本中消失时触发

### 类型变更检测
- 字段类型分布变化超过 5% 时触发

### 枚举值检测
- 关键字段（status、method 等）出现新值或值消失时触发

## 性能优化

- ClickHouse 分区按月份，支持 10 亿条/天
- 物化视图预聚合字段统计
- 索引优化：时间范围、格式类型、变化类型
- 批量导入，减少网络开销
