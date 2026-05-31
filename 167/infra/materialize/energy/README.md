# 能耗统计看板配置指南

## 一、能耗估算模型

使用简化的热力学模型，实时计算每个 HVAC 区域的能耗：

```
瞬时负荷 (kW) = |室内温度 - 室外温度| × 热传导系数 × 区域面积 / 1000
15分钟能耗 (kWh) = 瞬时负荷 × 0.25
24h总能耗 = Σ(15分钟能耗)
```

| 参数 | 来源 | 说明 |
|---|---|---|
| `室内温度` | `indoor_temp_readings` 每 5 分钟采样 | 15 分钟窗口取 AVG |
| `室外温度` | `outdoor_temp_measurements` 每 15 分钟采样 | 直接使用 |
| `热传导系数` | `hvac_zones.thermal_coeff` | 单位 W/(m²·K)，范围 1.0-2.5 |
| `区域面积` | `hvac_zones.area_sqm` | 单位 m² |
| `HVAC 模式` | `hvac_zones.hvac_mode` | COOL/HEAT/AUTO |

## 二、Materialize 物化视图清单

| 视图 | 用途 |
|---|---|
| `mv_indoor_temp_15min` | 室内温度对齐到 15 分钟窗口 |
| `mv_outdoor_temp_15min` | 室外温度对齐到 15 分钟窗口 |
| `mv_energy_consumption_15min` | 核心视图：每区域每 15 分钟能耗估算 |
| `mv_energy_curve_24h` | 过去 24 小时总能耗曲线（给折线图用） |
| `mv_energy_by_zone_24h` | 各区域 24 小时能耗排行（给条形图用） |
| `mv_energy_kpi_24h` | 24 小时关键指标（给数字卡片用） |
| `mv_energy_anomaly` | 能耗突增告警（> 同区域 24h 均值 2 倍） |

## 三、Preset 看板布局

```
┌─────────────────────────────────────────────────────────┐
│  24h 总能耗 (kWh) │  预计日能耗 (kWh)  │  室外均温 (℃) │
├─────────────────────────────────────────────────────────┤
│                                                         │
│    能耗 × 温度双轴折线图 (过去 24h, 每 15 分钟)         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  各区域能耗排行 (水平条形图)  │  温度波动热力图        │
├─────────────────────────────────────────────────────────┤
│  能耗突增告警表格  │  实时能耗明细表格                  │
└─────────────────────────────────────────────────────────┘
```

## 四、图表配置详解

### 4.1 能耗 × 温度双轴折线图

- **数据集**: `SELECT * FROM mv_energy_curve_24h ORDER BY window_15min`
- **图表类型**: 折线图 (Line Chart)
- **X 轴**: `window_15min` (日期格式 `MM-DD HH:MI`)
- **Y 轴 1 (左)**: `total_energy_kwh` — 蓝色折线，标签 "能耗 kWh"
- **Y 轴 2 (右)**: `avg_outdoor_temp_c` — 红色虚线，标签 "室外温度 ℃"
- **刷新**: 15 秒自动刷新

### 4.2 各区域能耗排行

- **数据集**: `SELECT * FROM mv_energy_by_zone_24h ORDER BY total_energy_kwh DESC`
- **图表类型**: 水平条形图 (Horizontal Bar Chart)
- **X 轴**: `total_energy_kwh`
- **Y 轴**: `zone_name`
- **颜色**: 按 `hvac_mode` 分组 (COOL=蓝, HEAT=橙, AUTO=绿)
- **刷新**: 60 秒自动刷新

### 4.3 关键指标卡片 (x 4)

| 卡片 | 数据集字段 | 格式 |
|---|---|---|
| 24h 总能耗 | `total_energy_kwh` | `#,##0.00 kWh` |
| 预计日能耗 | `projected_daily_kwh` | `#,##0.00 kWh` |
| 室外均温 | `avg_outdoor_temp_c` | `#,##0.0 ℃` |
| 活跃区域数 | `active_zone_count` | `#,##0` |

- **图表类型**: 数字卡片 (Big Number)
- **刷新**: 30 秒自动刷新

### 4.4 温度波动热力图 (可选)

- **数据集**: `02_preset_queries.sql` 中的 "数据集 6"
- **图表类型**: 热力图 (Heatmap)
- **X 轴**: `hour_bucket`
- **Y 轴**: `zone_name`
- **热度值**: `avg_delta_temp_c`
- **颜色渐变**: 蓝 → 黄 → 红

### 4.5 能耗突增告警

- **数据集**: `SELECT * FROM mv_energy_anomaly WHERE ratio_to_avg > 2`
- **图表类型**: 表格
- **条件格式**: `ratio_to_avg > 3` 行标红，`ratio_to_avg > 2` 行标黄
- **刷新**: 60 秒自动刷新

## 五、连接 Materialize

在 Preset 中添加数据库连接：

```
类型: PostgreSQL
主机: materialize
端口: 6875
数据库: materialize
用户: materialize
密码: (空)
额外参数: options=--cluster%3Ddefault
```

> 如果用 Preset 容器访问，主机名填 `materialize`（Docker 内部网络）。
> 从宿主机访问填 `localhost:6875`。

## 六、模拟数据注入

PostgreSQL 初始化后，可用以下 SQL 持续注入新数据：

```sql
-- 每隔 5 分钟新的室内温度读数
INSERT INTO shop.indoor_temp_readings (zone_id, temp_c, humidity_pct, reading_ts)
SELECT
    z.zone_id,
    ROUND((21.0 + (RANDOM() * 4 - 2))::NUMERIC, 1),
    ROUND((45.0 + (RANDOM() * 20))::NUMERIC, 1),
    NOW()
FROM shop.hvac_zones z
WHERE z.is_active = TRUE;

-- 每隔 15 分钟新的室外温度
INSERT INTO shop.outdoor_temp_measurements (temp_c, reading_ts)
SELECT
    ROUND((
        18.0 + 8.0 * SIN(EXTRACT(HOUR FROM NOW()) / 24.0 * 2 * PI())
             + (RANDOM() * 2 - 1)
    )::NUMERIC, 1),
    NOW();
```

## 七、一键启动与验证

```bash
# 1. 启动所有组件
docker compose up -d

# 2. 注册 Debezium 连接器 (包含温度表)
curl -X POST -H "Content-Type: application/json" \
  http://localhost:8083/connectors \
  -d @infra/debezium/shop-connector.json

# 3. 等待 Kafka 主题创建完成 (约 10 秒)，然后跑能耗 SQL
psql -h localhost -p 6875 -U materialize \
  -f infra/materialize/energy/01_energy_consumption.sql

# 4. 验证数据是否流入
psql -h localhost -p 6875 -U materialize \
  -c "SELECT * FROM mv_energy_kpi_24h;"

# 5. 注入新数据测试实时性
psql -h localhost -p 5432 -U debezium -d shop \
  -c "INSERT INTO shop.indoor_temp_readings (zone_id, temp_c, humidity_pct)
       SELECT zone_id, 25.0, 50.0 FROM shop.hvac_zones WHERE is_active;"

# 6. 15 秒后再查，应该看到新数据
sleep 15
psql -h localhost -p 6875 -U materialize \
  -c "SELECT window_15min, total_energy_kwh FROM mv_energy_curve_24h ORDER BY window_15min DESC LIMIT 5;"
```

## 八、常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| `mv_energy_consumption_15min` 为空 | indoor/outdoor 时间窗口不对齐 | 检查两张表的 `reading_ts` 是否有重叠时段 |
| 能耗值为 0 或非常小 | 温差太小或热传导系数设置过低 | 调整 `hvac_zones.thermal_coeff`，正常范围 1.0-3.0 |
| Preset 连接 Materialize 失败 | 网络不通或 cluster 参数错误 | 确认 Preset 容器能访问 `materialize:6875`，检查连接串的 `options` 参数 |
| 折线图数据点太少 | 只有过去 24 小时内的数据 | 用 PostgreSQL 注入更多历史数据 |
