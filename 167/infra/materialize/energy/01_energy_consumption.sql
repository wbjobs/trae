-- =====================================================================
-- 能耗统计：室内温度 × 室外温度 × HVAC 配置 → kWh
--
-- 能耗模型 (简化版，适合实时看板)
--   瞬时负荷 (kW) = |T_in - T_out| × thermal_coeff × area_sqm / 1000
--   15分钟能耗 (kWh) = 瞬时负荷 × 0.25
--   全天能耗 = SUM(15分钟能耗)
-- =====================================================================

-- (1) Source: HVAC 区域配置 (UPSERT，数据量小，更新少)
CREATE SOURCE IF NOT EXISTS kafka_hvac_zones
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.hvac_zones'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

-- (2) Source: 室内温度读数 (Append-only 流，每 5 分钟一条)
CREATE SOURCE IF NOT EXISTS kafka_indoor_temp
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.indoor_temp_readings'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

-- (3) Source: 室外温度模拟数据 (Append-only 流，每 15 分钟一条)
CREATE SOURCE IF NOT EXISTS kafka_outdoor_temp
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.outdoor_temp_measurements'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

-- (4) 索引：用于等值 join
CREATE INDEX IF NOT EXISTS idx_indoor_zone   ON kafka_indoor_temp (zone_id);
CREATE INDEX IF NOT EXISTS idx_indoor_ts     ON kafka_indoor_temp (reading_ts);
CREATE INDEX IF NOT EXISTS idx_outdoor_ts    ON kafka_outdoor_temp (reading_ts);
CREATE INDEX IF NOT EXISTS idx_hvac_zones_id ON kafka_hvac_zones (zone_id);

-- =====================================================================
-- 01. 室内读数对齐到 15 分钟窗口，取窗口内 AVG 温度
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_indoor_temp_15min AS
SELECT
    zone_id,
    date_trunc('minute', reading_ts) -
        MAKE_INTERVAL(mins => EXTRACT(MINUTE FROM reading_ts)::INTEGER % 15)
        AS window_15min,
    AVG(temp_c)       AS avg_indoor_temp_c,
    AVG(humidity_pct)  AS avg_humidity_pct,
    COUNT(*)           AS sample_count
FROM kafka_indoor_temp
GROUP BY 1, 2;

-- =====================================================================
-- 02. 室外温度按 15 分钟窗口 (源数据本身就是 15 分钟，直接用)
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_outdoor_temp_15min AS
SELECT
    date_trunc('minute', reading_ts) -
        MAKE_INTERVAL(mins => EXTRACT(MINUTE FROM reading_ts)::INTEGER % 15)
        AS window_15min,
    AVG(temp_c) AS avg_outdoor_temp_c
FROM kafka_outdoor_temp
GROUP BY 1;

-- =====================================================================
-- 03. 15 分钟粒度能耗估算 (核心视图)
--     瞬时负荷 (kW) = |T_in - T_out| × thermal_coeff × area / 1000
--     15min 能耗 (kWh) = 瞬时负荷 × 0.25
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_energy_consumption_15min AS
SELECT
    i.zone_id,
    z.zone_name,
    i.window_15min,
    ROUND(i.avg_indoor_temp_c::NUMERIC, 1)            AS indoor_temp_c,
    ROUND(o.avg_outdoor_temp_c::NUMERIC, 1)            AS outdoor_temp_c,
    ROUND((ABS(i.avg_indoor_temp_c - o.avg_outdoor_temp_c))::NUMERIC, 1) AS delta_temp_c,
    z.target_temp_c,
    z.area_sqm,
    z.thermal_coeff,
    z.hvac_mode,
    ROUND(
        (ABS(i.avg_indoor_temp_c - o.avg_outdoor_temp_c)
         * z.thermal_coeff * z.area_sqm / 1000.0
         * 0.25)::NUMERIC, 4
    )                                                  AS energy_kwh
FROM mv_indoor_temp_15min i
JOIN kafka_hvac_zones z
  ON i.zone_id = z.zone_id
JOIN mv_outdoor_temp_15min o
  ON i.window_15min = o.window_15min
WHERE z.is_active = TRUE;

-- =====================================================================
-- 04. 过去 24 小时能耗曲线 (按 15 分钟聚合，Preset 折线图用)
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_energy_curve_24h AS
SELECT
    window_15min,
    ROUND(SUM(energy_kwh)::NUMERIC, 4)          AS total_energy_kwh,
    ROUND(AVG(outdoor_temp_c)::NUMERIC, 1)       AS avg_outdoor_temp_c,
    ROUND(AVG(indoor_temp_c)::NUMERIC, 1)        AS avg_indoor_temp_c,
    COUNT(DISTINCT zone_id)                      AS active_zones
FROM mv_energy_consumption_15min
WHERE window_15min >= NOW() - INTERVAL '24 hours'
GROUP BY 1;

-- =====================================================================
-- 05. 按区域 24 小时能耗排行 (给 Preset 条形图用)
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_energy_by_zone_24h AS
SELECT
    zone_id,
    zone_name,
    hvac_mode,
    ROUND(SUM(energy_kwh)::NUMERIC, 4)  AS total_energy_kwh,
    ROUND(AVG(indoor_temp_c)::NUMERIC, 1) AS avg_indoor_temp_c,
    ROUND(AVG(delta_temp_c)::NUMERIC, 1)  AS avg_delta_temp_c
FROM mv_energy_consumption_15min
WHERE window_15min >= NOW() - INTERVAL '24 hours'
GROUP BY 1, 2, 3;

-- =====================================================================
-- 06. 24 小时关键指标 (给 Preset 数字看板用)
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_energy_kpi_24h AS
SELECT
    ROUND(SUM(energy_kwh)::NUMERIC, 2)                              AS total_energy_kwh,
    ROUND(AVG(energy_kwh) * 96::NUMERIC, 2)                         AS projected_daily_kwh,
    ROUND(AVG(outdoor_temp_c)::NUMERIC, 1)                           AS avg_outdoor_temp_c,
    ROUND(MAX(outdoor_temp_c)::NUMERIC, 1)                           AS max_outdoor_temp_c,
    ROUND(MIN(outdoor_temp_c)::NUMERIC, 1)                           AS min_outdoor_temp_c,
    ROUND(AVG(indoor_temp_c)::NUMERIC, 1)                            AS avg_indoor_temp_c,
    (SELECT COUNT(*) FROM kafka_hvac_zones WHERE is_active)          AS active_zone_count,
    (SELECT COUNT(DISTINCT zone_id) FROM mv_energy_consumption_15min
     WHERE window_15min >= NOW() - INTERVAL '24 hours')             AS reporting_zones
FROM mv_energy_consumption_15min
WHERE window_15min >= NOW() - INTERVAL '24 hours';

-- =====================================================================
-- 07. 实时告警视图: 某区域能耗突增 (> 同区域 24h 均值的 2 倍)
-- =====================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_energy_anomaly AS
SELECT
    e.zone_id,
    e.zone_name,
    e.window_15min,
    e.energy_kwh,
    a.avg_energy_kwh,
    ROUND((e.energy_kwh / NULLIF(a.avg_energy_kwh, 0))::NUMERIC, 2) AS ratio_to_avg
FROM mv_energy_consumption_15min e
JOIN (
    SELECT zone_id, AVG(energy_kwh) AS avg_energy_kwh
    FROM mv_energy_consumption_15min
    WHERE window_15min >= NOW() - INTERVAL '24 hours'
    GROUP BY zone_id
) a ON e.zone_id = a.zone_id
WHERE e.window_15min >= NOW() - INTERVAL '2 hours'
  AND e.energy_kwh > a.avg_energy_kwh * 2;
