-- =====================================================================
-- Preset 看板查询 SQL
-- 在 Preset (Superset) 的 SQL Lab 中执行以下查询作为数据集基础。
-- 连接: postgres://materialize@materialize:6875/materialize?options=--cluster%3Ddefault
-- =====================================================================

-- ============================================================
-- 数据集 1: 过去 24 小时能耗曲线 (折线图)
--   X 轴: window_15min
--   主 Y 轴: total_energy_kwh (折线)
--   次 Y 轴: avg_outdoor_temp_c (折线)
-- ============================================================
SELECT
    window_15min,
    total_energy_kwh,
    avg_outdoor_temp_c,
    avg_indoor_temp_c,
    active_zones
FROM mv_energy_curve_24h
ORDER BY window_15min;

-- ============================================================
-- 数据集 2: 各区域 24 小时能耗排行 (水平条形图)
--   X 轴: total_energy_kwh
--   Y 轴: zone_name
--   颜色: hvac_mode
-- ============================================================
SELECT
    zone_id,
    zone_name,
    hvac_mode,
    total_energy_kwh,
    avg_indoor_temp_c,
    avg_delta_temp_c
FROM mv_energy_by_zone_24h
ORDER BY total_energy_kwh DESC;

-- ============================================================
-- 数据集 3: 24 小时关键指标 (数字卡片 x 4)
--   卡片 1: total_energy_kwh     (标题: 24h 总能耗 kWh)
--   卡片 2: projected_daily_kwh  (标题: 预计日能耗 kWh)
--   卡片 3: avg_outdoor_temp_c   (标题: 室外均温 ℃)
--   卡片 4: active_zone_count    (标题: 活跃区域数)
-- ============================================================
SELECT
    total_energy_kwh,
    projected_daily_kwh,
    avg_outdoor_temp_c,
    max_outdoor_temp_c,
    min_outdoor_temp_c,
    avg_indoor_temp_c,
    active_zone_count,
    reporting_zones
FROM mv_energy_kpi_24h;

-- ============================================================
-- 数据集 4: 能耗突增告警 (表格)
--   列: zone_name, window_15min, energy_kwh, avg_energy_kwh, ratio_to_avg
--   过滤: ratio_to_avg > 2
-- ============================================================
SELECT
    zone_id,
    zone_name,
    window_15min,
    energy_kwh,
    avg_energy_kwh,
    ratio_to_avg
FROM mv_energy_anomaly
WHERE ratio_to_avg > 2
ORDER BY ratio_to_avg DESC;

-- ============================================================
-- 数据集 5: 实时能耗明细 (表格，每 15 分钟刷新)
--   列: window_15min, zone_name, indoor_temp_c, outdoor_temp_c,
--       delta_temp_c, energy_kwh, hvac_mode
-- ============================================================
SELECT
    window_15min,
    zone_name,
    indoor_temp_c,
    outdoor_temp_c,
    delta_temp_c,
    target_temp_c,
    area_sqm,
    thermal_coeff,
    hvac_mode,
    energy_kwh
FROM mv_energy_consumption_15min
WHERE window_15min >= NOW() - INTERVAL '4 hours'
ORDER BY window_15min DESC, energy_kwh DESC;

-- ============================================================
-- 数据集 6: 温度波动热力图 (可选)
--   X 轴: date_trunc('hour', window_15min)
--   Y 轴: zone_name
--   热度: AVG(delta_temp_c)
-- ============================================================
SELECT
    date_trunc('hour', window_15min) AS hour_bucket,
    zone_name,
    ROUND(AVG(delta_temp_c)::NUMERIC, 1) AS avg_delta_temp_c,
    ROUND(SUM(energy_kwh)::NUMERIC, 2)    AS total_energy_kwh
FROM mv_energy_consumption_15min
WHERE window_15min >= NOW() - INTERVAL '24 hours'
GROUP BY 1, 2
ORDER BY 1, 2;
