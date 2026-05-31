# 物流异常检测分析平台 (Logistics Analytics Platform)

一个全栈物流分析平台，结合了时空流可视化、时序异常检测和图挖掘技术。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Deck.gl Map  │  │  ECharts PC  │  │ Top-K Subgraph Panel │ │
│  │ ArcLayer +   │  │  Parallel    │  │   (Graph Mining)     │ │
│  │ Scatterplot  │  │ Coordinates  │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    API Routers                          │  │
│  │  /api/warehouses, /api/anomalies, /api/*                │  │
│  └───────────────────────┬─────────────────────────────────┘  │
│                          │                                     │
│  ┌───────────────────────▼─────────────────────────────────┐  │
│  │              Anomaly Detection Service                  │  │
│  │  ┌─────────────┐  ┌────────────────┐  ┌──────────────┐ │  │
│  │ │ STL Detector│  │ LSTM Autoencoder│ │  Subgraph    │ │  │
│  │ │ (Volume)    │  │  (Duration)    │ │   Miner      │ │  │
│  │ └─────────────┘  └────────────────┘  └──────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│      PostgreSQL         │      │         Redis           │
│  Warehouse / Vehicle    │      │  Cache / Session Store  │
│  Order / OrderAnomaly   │      │                         │
└─────────────────────────┘      └─────────────────────────┘
```

## 核心功能

### 1. 异常检测算法

**STL 分解 (Volume Anomaly)**
- 使用 `statsmodels.tsa.seasonal.STL` 进行时间序列分解
- 分离趋势项、季节项、残差项
- 基于 Z-score 阈值检测订单量异常

**LSTM Autoencoder (Duration Anomaly)**
- 基于 PyTorch 实现深度自编码器
- 输入维度: 1 (运输时长)，序列长度: 30
- 重构误差超过阈值判定为异常
- 支持 MSE 损失 + Adam 优化器

**复合异常评分**
```python
composite_score = volume_z * 0.3 + duration_variation * 0.5 + weight_score * 0.2
```

### 2. Top-K 异常子图挖掘

- 基于 NetworkX 构建物流有向图
- 节点: 仓库，边: 订单流
- 边权重 = 平均异常分 × log(订单数+1)
- 贪心扩展算法识别高密度子图
- Jaccard 相似度去重

### 3. 时空流可视化 (Deck.gl)

**ArcLayer**
- 弧线表示订单运输路径
- 颜色编码异常等级: 红(严重) → 橙 → 黄 → 青(低)
- 线宽随重量和异常分动态变化

**ScatterplotLayer**
- 节点大小 = 该节点异常订单数
- 双层光晕效果突出高风险节点
- 交互式 Tooltip 显示详情

**Lasso 选择工具**
- 双击开始绘制多边形
- 单击结束选择
- 右键取消
- 自动过滤选中区域数据

### 4. 平行坐标图 (ECharts)

8 维特征分析:
1. 重量 (吨)
2. 实际运输时长 (小时)
3. 预期运输时长 (小时)
4. 异常评分
5. 运输距离 (公里)
6. 起点区域 (类别)
7. 终点区域 (类别)
8. 异常等级 (类别)

## 快速开始

### 前置要求

- Python 3.9+
- Node.js 16+
- PostgreSQL 12+
- Redis 6+

### 后端设置

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置数据库
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=logistics

# 初始化数据库
python scripts/init_db.py

# 生成百万级模拟数据
python scripts/generate_data.py \
  --warehouses 30 \
  --vehicles 500 \
  --orders 1000000 \
  --days 90 \
  --anomaly-prob 0.05

# 启动后端服务
python main.py
```

### 前端设置

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 访问

- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

## API 端点

### 仓库管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/warehouses` | 获取所有仓库 |
| GET | `/api/warehouses/{id}` | 获取单个仓库 |
| GET | `/api/warehouses/region/{region}` | 按区域查询 |

### 异常检测

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/anomalies` | 获取异常列表 |
| GET | `/api/anomalies/count` | 获取异常统计 |
| POST | `/api/anomalies/detect` | 运行完整检测 |
| POST | `/api/anomalies/detect/volume` | STL 订单量检测 |
| POST | `/api/anomalies/detect/duration` | LSTM 时长检测 |

### 可视化数据

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/anomalies/spatio-temporal-flows` | 获取时空流数据 |
| GET | `/api/anomalies/parallel-coords` | 获取平行坐标数据 |
| POST | `/api/anomalies/parallel-coords/by-bbox` | 按地理区域过滤 |
| GET | `/api/anomalies/top-k-subgraphs` | 获取 Top-K 异常子图 |

## 数据模型

```
Warehouse
├── id, name, latitude, longitude
├── capacity (容量)
└── region (区域: North/East/South/West/Central)

Vehicle
├── id, plate_number (车牌号)
├── vehicle_type (车型)
├── max_load (最大载重)
└── home_warehouse_id

Order
├── id, order_number
├── origin_warehouse_id, destination_warehouse_id
├── vehicle_id, weight
├── scheduled_pickup, actual_pickup
├── scheduled_delivery, actual_delivery
└── status, created_at

OrderAnomaly
├── id, order_id
├── anomaly_type (delay/early/weight/route)
├── anomaly_score, anomaly_level (low/medium/high/critical)
├── detected_at, details
└── is_reviewed
```

## 百万级数据模拟

数据生成器特性:

- 30 个中国主要城市的仓库网络
- 基于 Haversine 公式计算实际地理距离
- 预期运输时长 = 距离 / 60 km/h
- 异常注入类型:
  - **Delay**: 超时 50%-200%
  - **Early**: 提前 30%-60%
  - **Extreme Weight**: 30-50 吨超重
  - **Route Anomaly**: 路径异常
- 默认异常概率: 5% (可配置)

## 技术栈

**后端**
- FastAPI 0.109
- SQLAlchemy 2.0
- PostgreSQL + psycopg2
- Redis
- PyTorch (LSTM)
- statsmodels (STL)
- NetworkX (图挖掘)
- pandas, numpy

**前端**
- React 18
- Vite
- Deck.gl 8.9 (可视化)
- MapLibre GL (底图)
- ECharts 5 (平行坐标)
- Material-UI 5 (组件)
- Axios

## 性能优化

- **Redis 缓存**: 时间序列检测结果缓存 1 小时
- **批量写入**: 数据生成使用 bulk_save_objects
- **渐进式加载**: 时空流限制在 5000 条
- **距离预计算**: 仓库间距离使用公式实时计算
- **子图去重**: Jaccard > 0.7 视为重复

## 使用说明

### 模拟数据模式

前端默认启动在模拟数据模式，无需任何外部依赖即可体验所有功能。

### 实时数据模式

1. 确保 PostgreSQL 和 Redis 正在运行
2. 修改 `App.jsx` 中 `useMockData = false`
3. 重启前端

### Lasso 选择操作

1. **双击**地图任意位置开始选择
2. 移动鼠标绘制多边形（路径会自动记录）
3. **单击**任意位置结束选择
4. 平行坐标图自动刷新为选中区域数据
5. **右键**取消选择，恢复全局视图

## 目录结构

```
backend/
├── app/
│   ├── algorithms/          # 核心算法
│   │   ├── stl_detector.py   # STL 分解
│   │   ├── lstm_autoencoder.py  # LSTM Autoencoder
│   │   └── subgraph_mining.py  # Top-K 子图挖掘
│   ├── routers/             # API 路由
│   │   ├── warehouses.py
│   │   └── anomalies.py
│   ├── models.py            # SQLAlchemy 模型
│   ├── database.py          # 数据库连接
│   ├── config.py            # 配置管理
│   ├── schemas.py           # Pydantic 模式
│   ├── anomaly_service.py   # 检测服务
│   └── data_generator.py    # 数据模拟器
├── scripts/
│   ├── init_db.py
│   └── generate_data.py
├── main.py
└── requirements.txt

frontend/
├── src/
│   ├── components/
│   │   ├── SpatioTemporalMap.jsx   # Deck.gl 地图
│   │   ├── ParallelCoordinatesChart.jsx  # ECharts
│   │   └── TopKSubgraphPanel.jsx   # 子图面板
│   ├── App.jsx
│   ├── main.jsx
│   └── api.js
├── index.html
├── package.json
└── vite.config.js
```

## 许可证

MIT License
