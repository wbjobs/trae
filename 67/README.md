# 多文件能耗数据分析系统

## 项目概述

本项目是一个完整的工业能耗数据分析系统，包含四大核心模块：数据清洗、分层统计、异常检测、可视化渲染。系统实现了厂区-车间-设备三级能耗溯源、异常耗电数据自动聚类标记、实时能耗趋势大屏渲染、历史能耗报表离线生成等功能。

## 项目结构

```
energy_analysis/
├── config/                     # 配置模块
│   ├── __init__.py
│   └── config.py              # 全局配置文件
├── data/                       # 数据目录
│   ├── raw/                   # 原始数据
│   ├── processed/             # 处理后数据
│   └── mock/                  # 模拟数据
├── src/                        # 源码目录
│   ├── data_preprocessing/    # 数据预处理模块
│   │   ├── __init__.py
│   │   ├── data_cleaner.py    # 数据清洗
│   │   └── db_connector.py    # 数据库对接
│   ├── statistics/            # 统计分析模块
│   │   ├── __init__.py
│   │   ├── hierarchical_stats.py    # 分层统计
│   │   └── energy_traceability.py   # 能耗溯源
│   ├── anomaly_detection/     # 异常检测模块
│   │   ├── __init__.py
│   │   ├── clustering.py      # 聚类算法
│   │   └── anomaly_cluster.py # 异常聚类
│   ├── visualization/         # 可视化模块
│   │   ├── __init__.py
│   │   ├── charts.py          # 图表渲染
│   │   └── dashboard.py       # 大屏渲染
│   ├── reporting/             # 报表导出模块
│   │   ├── __init__.py
│   │   ├── export_utils.py    # 导出工具
│   │   └── report_generator.py # 报表生成
│   └── __init__.py
├── main.py                    # 主入口
├── quick_start.py             # 快速验证脚本
└── requirements.txt           # 依赖清单
```

## 功能特性

### 1. 数据预处理模块
- **数据清洗**: 缺失值处理、去重、异常值处理、数据标准化
- **数据库对接**: 支持InfluxDB、MongoDB、Kafka实时数据流
- **模拟数据生成**: 无真实数据库时自动生成模拟数据

### 2. 分层统计模块
- **三级能耗溯源**: 厂区 → 车间 → 设备层级能耗分析
- **多维度统计**: 按小时、日、周、月时间粒度聚合
- **周期对比**: 同比(yoy)、环比(mom)、周环比(wod)分析
- **Top N分析**: 高能耗设备排名
- **基准对比**: 各车间能耗效率对标

### 3. 异常检测模块
- **多种聚类算法**: K-Means、DBSCAN、Isolation Forest
- **综合异常判断**: 基于聚类、统计、时序多维度检测
- **告警生成**: 自动识别高风险设备并生成告警
- **异常模式分析**: 按时间、区域、设备维度分析异常规律

### 4. 可视化模块
- **大屏渲染**: 实时能耗监测大屏HTML生成
- **多种图表**: 折线图、柱状图、饼图、仪表盘、热力图、散点图、面积图、树形图
- **KPI卡片**: 关键指标展示
- **异常可视化**: 异常数据高亮显示

### 5. 报表导出模块
- **多格式导出**: Excel、CSV、JSON
- **定时报表**: 日报、周报、月报
- **自定义报表**: 按指定时间段生成
- **专项报表**: 异常报告、溯源报告

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 快速验证

```bash
python quick_start.py
```

### 3. 运行完整流程

```bash
python main.py
```

选择菜单选项执行相应功能。

## 使用示例

### 示例1: 运行完整数据分析流程

```python
from src.data_preprocessing import DataCleaner, DatabaseConnector
from src.statistics import HierarchicalStatistics
from src.visualization import EnergyDashboard

# 获取数据
db = DatabaseConnector(db_type='influxdb')
raw_data = db.query_energy_data('2024-01-01', '2024-01-31')

# 数据清洗
cleaner = DataCleaner()
cleaned_data = cleaner.clean_pipeline(raw_data)

# 统计分析
stats = HierarchicalStatistics()
factory_stats = stats.get_factory_summary(cleaned_data)

# 生成大屏
dashboard = EnergyDashboard()
dashboard.generate_html_dashboard(cleaned_data, output_path='dashboard.html')
```

### 示例2: 异常检测

```python
from src.anomaly_detection import AnomalyCluster

anomaly_detector = AnomalyCluster(method='isolation_forest')
data_with_anomalies = anomaly_detector.mark_anomalies(cleaned_data)

# 查看异常统计
summary = anomaly_detector.get_anomaly_summary(data_with_anomalies)
print(f"异常率: {summary['anomaly_rate']:.2f}%")

# 生成异常报告
from src.reporting import ReportGenerator
reporter = ReportGenerator()
reporter.generate_anomaly_report(cleaned_data)
```

### 示例3: 能耗溯源

```python
from src.statistics import EnergyTraceability

traceability = EnergyTraceability()

# 获取层级树结构
hierarchy_tree = traceability.get_energy_hierarchy_tree(cleaned_data)

# 追踪特定设备
trace_path = traceability.get_contribution_path(cleaned_data, '设备ID')

# 下钻分析
drill_down = traceability.drill_down_analysis(cleaned_data, equipment='设备ID')
```

## 配置说明

编辑 `config/config.py` 进行配置：

- **DATABASE_CONFIG**: 数据库连接配置
- **HIERARCHY_CONFIG**: 层级结构配置
- **ANOMALY_CONFIG**: 异常检测参数
- **VISUALIZATION_CONFIG**: 可视化样式配置
- **EXPORT_CONFIG**: 报表导出配置

## 数据库支持

### InfluxDB (时序数据库)
```python
db = DatabaseConnector(db_type='influxdb')
```

### MongoDB (文档数据库)
```python
db = DatabaseConnector(db_type='mongodb')
```

### Kafka (实时数据流)
```python
db = DatabaseConnector(db_type='kafka')
for data in db.consume_realtime_data():
    process(data)
```

## 技术栈

- **数据处理**: Pandas, NumPy
- **机器学习**: Scikit-learn
- **可视化**: Plotly, Matplotlib, Seaborn
- **数据库**: InfluxDB, MongoDB, Kafka
- **报表导出**: OpenPyXL

## 注意事项

1. 首次运行会自动生成模拟数据，无需配置真实数据库
2. 如需对接真实数据库，请在 `config/config.py` 中配置连接信息
3. 报表会自动生成在 `data/reports/` 目录下
4. 大屏HTML文件可以直接在浏览器中打开查看

## License

MIT License
