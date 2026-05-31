# IoT Anomaly Detection System

物联网时序异常检测系统，基于 QuestDB + Python + Prophet + Grafana 构建。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    IoT System Architecture                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Sensor      │───▶│  Anomaly     │───▶│  QuestDB  │  │
│  │  Simulator   │    │  Detector    │    │           │  │
│  └──────────────┘    └──────────────┘    └─────┬─────┘  │
│                                                │        │
│  ┌──────────────┐                            │        │
│  │  Prophet     │─────────────────────────────┘        │
│  │  Predictor   │                                      │
│  └──────────────┘                                      │
│        │                                               │
│        ▼                                               │
│  ┌──────────────┐                                      │
│  │  Grafana     │◀────────────────────────────────────  │
│  │  Dashboard   │                                      │
│  └──────────────┘                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 功能特性

- **传感器模拟**: 模拟 1000 个温度传感器，每秒产生 1 条数据
- **三种异常检测**:
  - 突变检测: 温度变化 > 5°C/秒
  - 卡死检测: 连续 100 条相同值
  - 震荡检测: 快速波动 > 10 次/分钟
- **Prophet 预测**: 使用 Prophet 模型预测正常温度范围
- **实时监控**: Grafana 仪表盘展示异常标记

## 快速开始

### 1. 环境要求

- Python 3.11+
- Docker & Docker Compose (可选)
- QuestDB 7.0+

### 2. 使用 Docker Compose 部署

```bash
docker-compose up -d
```

### 3. 本地运行

```bash
pip install -r requirements.txt
python main.py --config config/config.yaml
```

### 4. 访问服务

- QuestDB Web Console: http://localhost:9000
- Grafana Dashboard: http://localhost:3000 (默认账号: admin/admin)

## 配置说明

编辑 `config/config.yaml` 修改系统配置:

```yaml
sensors:
  count: 1000              # 传感器数量
  base_temperature: 25.0   # 基础温度
  temperature_variance: 3.0 # 温度方差

anomaly_detection:
  sudden_change:
    threshold: 5.0         # 突变阈值 (°C)
    window: 2              # 检测窗口 (秒)
  stuck:
    window: 100            # 卡死检测窗口
  oscillation:
    window: 60             # 震荡检测窗口 (秒)
    threshold: 10          # 震荡阈值 (次/分钟)

prophet:
  training_window: 86400   # 训练窗口 (秒)
  prediction_horizon: 3600 # 预测范围 (秒)
  confidence_interval: 0.95 # 置信区间
```

## 数据库表结构

### sensor_data (传感器数据)
| 字段 | 类型 | 说明 |
|------|------|------|
| timestamp | TIMESTAMP | 时间戳 |
| sensor_id | SYMBOL | 传感器ID |
| temperature | DOUBLE | 温度值 |
| anomaly_type | SYMBOL | 异常类型 |
| anomaly_score | DOUBLE | 异常分数 |

### anomalies (异常记录)
| 字段 | 类型 | 说明 |
|------|------|------|
| timestamp | TIMESTAMP | 时间戳 |
| sensor_id | SYMBOL | 传感器ID |
| anomaly_type | SYMBOL | 异常类型 |
| temperature | DOUBLE | 温度值 |
| description | STRING | 描述 |
| severity | DOUBLE | 严重程度 |

### predictions (预测数据)
| 字段 | 类型 | 说明 |
|------|------|------|
| timestamp | TIMESTAMP | 时间戳 |
| sensor_id | SYMBOL | 传感器ID |
| predicted_value | DOUBLE | 预测值 |
| lower_bound | DOUBLE | 预测下限 |
| upper_bound | DOUBLE | 预测上限 |

## 项目结构

```
.
├── config/
│   └── config.yaml           # 系统配置文件
├── src/
│   ├── __init__.py
│   ├── config_loader.py      # 配置加载器
│   ├── questdb_client.py     # QuestDB 客户端
│   ├── sensor_simulator.py   # 传感器模拟器
│   ├── anomaly_detector.py   # 异常检测器
│   ├── prophet_predictor.py  # Prophet 预测器
│   └── data_pipeline.py      # 数据管道
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── questdb.yaml  # 数据源配置
│   │   └── dashboards/
│   │       └── dashboard.yaml # 仪表盘配置
│   └── dashboards/
│       └── iot-anomaly-detection.json  # 仪表盘定义
├── docker-compose.yml         # Docker Compose 配置
├── Dockerfile                # Docker 镜像构建
├── requirements.txt          # Python 依赖
└── main.py                   # 主程序入口
```
