-- 日志模式演化分析系统 - ClickHouse 初始化脚本
-- 适用于 ClickHouse 21.8+

CREATE DATABASE IF NOT EXISTS log_evolution;

USE log_evolution;

-- 日志条目表 - 存储原始日志和解析结果
CREATE TABLE IF NOT EXISTS log_entries (
    id UInt64 DEFAULT 0,
    timestamp DateTime64(3),
    format_type String,
    raw_log String,
    parsed_fields Map(String, String),
    field_signature Map(String, String),
    ingestion_time DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
ORDER BY (timestamp, format_type)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Schema 快照表 - 存储时间窗口的字段统计
CREATE TABLE IF NOT EXISTS schema_snapshots (
    id UInt64 DEFAULT 0,
    snapshot_time DateTime64(3) DEFAULT now64(3),
    format_type String,
    field_name String,
    field_type String,
    sample_count UInt64 DEFAULT 0,
    null_count UInt64 DEFAULT 0,
    enum_values Array(String) DEFAULT [],
    is_enum UInt8 DEFAULT 0,
    max_length UInt32 DEFAULT 0,
    min_length UInt32 DEFAULT 0,
    avg_length Float64 DEFAULT 0.0,
    numeric_min Float64 DEFAULT 0.0,
    numeric_max Float64 DEFAULT 0.0,
    numeric_avg Float64 DEFAULT 0.0,
    window_start DateTime64(3),
    window_end DateTime64(3)
)
ENGINE = MergeTree()
ORDER BY (window_start, window_end, format_type, field_name)
PARTITION BY toYYYYMM(window_start)
TTL window_start + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Schema 变化事件表 - 存储检测到的变化
CREATE TABLE IF NOT EXISTS schema_change_events (
    id UInt64 DEFAULT 0,
    event_time DateTime64(3) DEFAULT now64(3),
    change_type String,
    format_type String,
    field_name String,
    old_value String,
    new_value String,
    affected_logs UInt64 DEFAULT 0,
    detection_window_start DateTime64(3),
    detection_window_end DateTime64(3),
    details String DEFAULT ''
)
ENGINE = MergeTree()
ORDER BY (event_time, change_type, format_type, field_name)
PARTITION BY toYYYYMM(event_time)
TTL event_time + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- Schema 版本表 - 存储历史 Schema 版本
CREATE TABLE IF NOT EXISTS schema_versions (
    id UInt64 DEFAULT 0,
    version_time DateTime64(3) DEFAULT now64(3),
    format_type String,
    version_number UInt32,
    schema_hash String,
    fields Map(String, String),
    is_active UInt8 DEFAULT 1,
    sample_count UInt64 DEFAULT 0
)
ENGINE = MergeTree()
ORDER BY (version_time, format_type)
PARTITION BY toYYYYMM(version_time)
TTL version_time + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- 索引优化
ALTER TABLE log_entries ADD INDEX IF NOT EXISTS idx_timestamp timestamp TYPE minmax GRANULARITY 4;
ALTER TABLE log_entries ADD INDEX IF NOT EXISTS idx_format_type format_type TYPE set(100) GRANULARITY 4;

ALTER TABLE schema_change_events ADD INDEX IF NOT EXISTS idx_change_type change_type TYPE set(10) GRANULARITY 4;
ALTER TABLE schema_change_events ADD INDEX IF NOT EXISTS idx_field_name field_name TYPE set(100) GRANULARITY 4;

-- 物化视图 - 字段统计聚合
CREATE MATERIALIZED VIEW IF NOT EXISTS field_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (format_type, field_name, toStartOfDay(timestamp))
AS
SELECT
    format_type,
    arrayJoin(mapKeys(parsed_fields)) as field_name,
    toStartOfDay(timestamp) as day,
    count() as total_count,
    countIf(parsed_fields[field_name] != '') as non_empty_count
FROM log_entries
GROUP BY format_type, field_name, day;

-- 查询优化提示
-- 1. 按时间范围查询字段统计:
-- SELECT format_type, field_name, count() FROM log_entries
-- WHERE timestamp >= '2024-01-01' AND timestamp < '2024-01-02'
-- GROUP BY format_type, field_name ORDER BY count() DESC;

-- 2. 检测新增字段:
-- SELECT field_name, min(timestamp) as first_seen
-- FROM log_entries
-- ARRAY JOIN mapKeys(parsed_fields) as field_name
-- WHERE timestamp >= now() - INTERVAL 1 HOUR
-- GROUP BY field_name
-- HAVING first_seen >= now() - INTERVAL 1 HOUR;

-- 3. 检测字段类型变化:
-- SELECT field_name, anyHeavy(field_signature[field_name]) as current_type
-- FROM log_entries
-- WHERE timestamp >= now() - INTERVAL 10 MINUTE
-- ARRAY JOIN mapKeys(field_signature) as field_name
-- GROUP BY field_name;

SELECT '初始化完成! 数据库 log_evolution 已创建所有必需的表.' as status;
