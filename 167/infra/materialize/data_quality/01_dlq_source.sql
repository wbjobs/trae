-- =====================================================================
-- 01_dlq_source.sql  —  消费死信队列并做结构化监控
--
-- DLQ 主题: dlq.shop.connector.errors
-- 每条消息的 headers 里包含错误上下文 (由 Kafka Connect 自动写入):
--   __connect.errors.exception.class.name
--   __connect.errors.exception.message
--   __connect.errors.exception.stacktrace
--   __connect.errors.original.topic
--   __connect.errors.original.partition
--   __connect.errors.original.offset
--   __connect.errors.stage
--   __connect.errors.timestamp
-- value 是原始消息 (Avro，可能解析失败 —— 用 BYTES 兜底)
-- =====================================================================

-- (1) 原始 DLQ 流：用 BYTES 保证不会解析失败
CREATE SOURCE IF NOT EXISTS dlq_raw
FROM KAFKA BROKER 'kafka:9092'
TOPIC 'dlq.shop.connector.errors'
FORMAT BYTES
INCLUDE HEADER 'exception.class'   AS header_exception_class,
INCLUDE HEADER 'exception.message' AS header_exception_message,
INCLUDE HEADER 'exception.stack'   AS header_exception_stack,
INCLUDE HEADER 'original.topic'    AS header_original_topic,
INCLUDE HEADER 'original.partition' AS header_original_partition,
INCLUDE HEADER 'original.offset'   AS header_original_offset,
INCLUDE HEADER 'stage'             AS header_stage,
INCLUDE HEADER 'timestamp'         AS header_timestamp,
INCLUDE KEY AS raw_key BYTES,
INCLUDE PARTITION,
INCLUDE OFFSET,
INCLUDE TIMESTAMP AS kafka_ts
ENVELOPE NONE;

-- (2) 结构化视图：把 headers 解析成可读字段 + 给错误分类打标签
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dlq_errors AS
SELECT
    CAST(kafka_ts AS TIMESTAMP)                              AS ingest_ts,
    "partition"                                              AS dlq_partition,
    "offset"                                                 AS dlq_offset,
    CONVERT_FROM(header_exception_class,   'utf8')           AS exception_class,
    CONVERT_FROM(header_exception_message, 'utf8')           AS exception_message,
    LEFT(CONVERT_FROM(header_exception_stack, 'utf8'), 500)  AS exception_stack_preview,
    CONVERT_FROM(header_original_topic,    'utf8')           AS original_topic,
    CONVERT_FROM(header_original_partition, 'utf8')          AS original_partition,
    CONVERT_FROM(header_original_offset,   'utf8')           AS original_offset,
    CONVERT_FROM(header_stage,             'utf8')           AS error_stage,
    CONVERT_FROM(header_timestamp,         'utf8')           AS error_timestamp,
    CASE
        WHEN CONVERT_FROM(header_exception_message, 'utf8') LIKE '%Schema%'       THEN 'SCHEMA_MISMATCH'
        WHEN CONVERT_FROM(header_exception_message, 'utf8') LIKE '%Avro%'         THEN 'AVRO_DESERIALIZATION'
        WHEN CONVERT_FROM(header_exception_message, 'utf8') LIKE '%Filter%'       THEN 'SMT_FILTER_REJECT'
        WHEN CONVERT_FROM(header_exception_class,   'utf8') LIKE '%NullPointer%'  THEN 'NPE'
        ELSE 'UNKNOWN'
    END                                                     AS error_category,
    CASE
        WHEN CONVERT_FROM(header_original_topic, 'utf8') LIKE '%orders%'       THEN 'orders'
        WHEN CONVERT_FROM(header_original_topic, 'utf8') LIKE '%order_items%'  THEN 'order_items'
        WHEN CONVERT_FROM(header_original_topic, 'utf8') LIKE '%products%'     THEN 'products'
        WHEN CONVERT_FROM(header_original_topic, 'utf8') LIKE '%users%'        THEN 'users'
        ELSE 'unknown'
    END                                                     AS source_table,
    LENGTH(raw_value)                                       AS raw_value_bytes
FROM dlq_raw;

-- (3) 按错误类型 + 表的聚合指标（给 Preset 看板用）
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dlq_error_stats AS
SELECT
    date_trunc('minute', ingest_ts) AS window_min,
    error_category,
    source_table,
    exception_class,
    COUNT(*)                        AS error_count
FROM mv_dlq_errors
GROUP BY 1, 2, 3, 4;

-- (4) 最近 10 分钟错误趋势（告警用）
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dlq_recent_errors AS
SELECT
    error_category,
    source_table,
    COUNT(*)  AS cnt_last_10min
FROM mv_dlq_errors
WHERE ingest_ts > mz_now() - INTERVAL '10 minutes'
GROUP BY 1, 2;

-- (5) TopN 错误类型（帮助定位最常见的问题）
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dlq_top_errors AS
SELECT error_category, source_table, exception_class, exception_message, cnt
FROM (
    SELECT error_category, source_table, exception_class, exception_message,
           COUNT(*) AS cnt,
           ROW_NUMBER() OVER (PARTITION BY error_category, source_table ORDER BY COUNT(*) DESC) AS rn
    FROM mv_dlq_errors
    GROUP BY 1, 2, 3, 4
)
WHERE rn <= 5;
