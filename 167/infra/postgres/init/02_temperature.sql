-- =============================================================
-- 能耗统计数据源
--   - hvac_zones: 区域 HVAC 配置 (目标温度、传热系数、面积)
--   - indoor_temp_readings: 室内温度实时采样 (每 5 分钟一条)
--   - outdoor_temp_measurements: 室外温度历史数据 (模拟，每 15 分钟一条)
-- =============================================================

-- ---------- HVAC 区域配置 ----------
CREATE TABLE IF NOT EXISTS shop.hvac_zones (
    zone_id        SERIAL PRIMARY KEY,
    zone_name      VARCHAR(64)  NOT NULL,
    target_temp_c  NUMERIC(4,1) NOT NULL,
    area_sqm       NUMERIC(8,2) NOT NULL,
    thermal_coeff  NUMERIC(6,3) NOT NULL DEFAULT 1.5,
    hvac_mode      VARCHAR(8)   NOT NULL DEFAULT 'AUTO',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO shop.hvac_zones (zone_id, zone_name, target_temp_c, area_sqm, thermal_coeff, hvac_mode) VALUES
    (1, 'Zone-A-Office',  22.0, 200.0, 1.2, 'COOL'),
    (2, 'Zone-B-Meeting', 21.5,  80.0, 1.0, 'AUTO'),
    (3, 'Zone-C-Lab',     24.0, 120.0, 1.8, 'AUTO'),
    (4, 'Zone-D-Lobby',   23.0, 150.0, 1.4, 'AUTO'),
    (5, 'Zone-E-Server',  22.5,  60.0, 2.5, 'COOL')
ON CONFLICT (zone_id) DO NOTHING;

-- ---------- 室内温度读数 (CDC 主表，每 5 分钟一条) ----------
CREATE TABLE IF NOT EXISTS shop.indoor_temp_readings (
    id             BIGSERIAL PRIMARY KEY,
    zone_id        INT        NOT NULL REFERENCES shop.hvac_zones(zone_id),
    temp_c         NUMERIC(4,1) NOT NULL,
    humidity_pct   NUMERIC(4,1),
    reading_ts     TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- 注入过去 24 小时的模拟室内温度 (每 5 分钟一条，5 个区域)
INSERT INTO shop.indoor_temp_readings (zone_id, temp_c, humidity_pct, reading_ts)
SELECT
    z.zone_id,
    ROUND((21.0 + (RANDOM() * 4 - 2))::NUMERIC, 1),
    ROUND((45.0 + (RANDOM() * 20))::NUMERIC, 1),
    series.ts
FROM shop.hvac_zones z
CROSS JOIN (
    SELECT generate_series(
        NOW() - INTERVAL '24 hours',
        NOW() - INTERVAL '5 minutes',
        INTERVAL '5 minutes'
    ) AS ts
) AS series
ON CONFLICT DO NOTHING;

-- ---------- 室外温度历史 (模拟，每 15 分钟一条，过去 24 小时) ----------
CREATE TABLE IF NOT EXISTS shop.outdoor_temp_measurements (
    id             BIGSERIAL PRIMARY KEY,
    temp_c         NUMERIC(4,1) NOT NULL,
    reading_ts     TIMESTAMP  NOT NULL,
    source         VARCHAR(32) NOT NULL DEFAULT 'simulated'
);

INSERT INTO shop.outdoor_temp_measurements (temp_c, reading_ts, source)
SELECT
    ROUND((
        18.0 + 8.0 * SIN(EXTRACT(HOUR FROM series.ts) / 24.0 * 2 * PI())
             + (RANDOM() * 2 - 1)
    )::NUMERIC, 1),
    series.ts,
    'simulated'
FROM (
    SELECT generate_series(
        NOW() - INTERVAL '24 hours',
        NOW() - INTERVAL '15 minutes',
        INTERVAL '15 minutes'
    ) AS ts
) AS series
ON CONFLICT DO NOTHING;

-- ---------- 补充 publication ----------
ALTER PUBLICATION dbz_shop_pub
    ADD TABLE shop.hvac_zones,
    ADD TABLE shop.indoor_temp_readings,
    ADD TABLE shop.outdoor_temp_measurements;

GRANT USAGE ON SCHEMA shop TO debezium;
GRANT SELECT  ON shop.hvac_zones, shop.indoor_temp_readings, shop.outdoor_temp_measurements TO debezium;
