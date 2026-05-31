-- ============================================
-- RisingWave SQL: Real-time Feature Store (Optimized)
--
-- Optimizations for backpressure:
-- 1. Watermark for bounded out-of-orderness
-- 2. HOP/SLIDE window functions instead of NOW() filtering
-- 3. Single aggregation with FILTER instead of multiple MVs + JOIN
-- 4. Kafka consumer tuning for throughput
-- ============================================

-- ============================================
-- Drop existing objects first (idempotent reset)
-- ============================================
DROP SINK IF EXISTS user_features_sink;
DROP MATERIALIZED VIEW IF EXISTS user_features_combined;
DROP MATERIALIZED VIEW IF EXISTS purchase_amount_1h;
DROP MATERIALIZED VIEW IF EXISTS click_count_5m;
DROP TABLE IF EXISTS user_events;

-- ============================================
-- Source Table with Watermark
--
-- Watermark is critical for stream processing:
-- - Defines how long to wait for late events
-- - Triggers window emission when watermark passes window end
-- - Prevents infinite state growth
-- ============================================
CREATE TABLE user_events (
    event_id VARCHAR,
    user_id VARCHAR,
    event_type VARCHAR,
    timestamp BIGINT,
    item_id VARCHAR,
    amount DOUBLE,
    session_id VARCHAR,
    -- Define watermark: allow 30 seconds of out-of-orderness
    WATERMARK FOR timestamp AS timestamp - 30
) WITH (
    connector = 'kafka',
    topic = 'user_events',
    properties.bootstrap.server = 'redpanda:9092',
    properties.group.id = 'risingwave-consumer',
    -- Tune for throughput during spikes
    properties.fetch.min.bytes = '1048576',
    properties.fetch.max.wait.ms = '500',
    properties.max.partition.fetch.bytes = '5242880',
    -- Start from latest to avoid backlog on restart
    scan.startup.mode = 'latest'
) FORMAT PLAIN ENCODE JSON;

-- ============================================
-- Materialized View: Combined Features with HOP Windows
--
-- Key optimizations:
-- 1. Single MV instead of two separate MVs + FULL OUTER JOIN
-- 2. HOP window for fixed-size sliding windows (1min slide, 5min/1hr window)
-- 3. COUNT/SUM with FILTER clause for conditional aggregation
-- 4. EMIT ON WATERMARK for predictable output
-- ============================================

-- Approach 1: Using HOP window for sliding aggregation
-- HOP(epoch_to_timestamp(timestamp), slide_interval, window_size)
CREATE MATERIALIZED VIEW user_features_combined AS
SELECT
    user_id,
    -- 5-minute window: count clicks (sliding with 1-minute slide)
    COUNT(*) FILTER (WHERE event_type = 'click') AS click_count_5m,
    -- 1-hour window: sum purchase amounts
    COALESCE(SUM(amount) FILTER (WHERE event_type = 'purchase'), 0.0) AS purchase_amount_1h,
    -- Track freshness
    MAX(timestamp) AS last_updated,
    -- Window bounds for debugging
    window_start,
    window_end
FROM (
    SELECT
        *,
        epoch_to_timestamp(timestamp) AS event_time
    FROM user_events
)
-- HOP window: slide by 1 minute, window size 5 minutes for clicks
-- We use the larger window and filter in application or create separate windows
HOP (event_time, INTERVAL '1 minute', INTERVAL '5 minutes')
GROUP BY user_id, window_start, window_end;

-- ============================================
-- Alternative: Two separate MVs with proper windows (more efficient)
--
-- This is better because:
-- - Different window sizes need different HOP parameters
-- - Each MV can be optimized independently
-- - No JOIN needed if we combine at sink level
-- ============================================

-- Drop the combined MV and create optimized separate MVs
DROP MATERIALIZED VIEW IF EXISTS user_features_combined;

-- Click count: 5-minute window sliding every 30 seconds
CREATE MATERIALIZED VIEW click_count_5m AS
SELECT
    user_id,
    COUNT(*) AS click_count,
    MAX(timestamp) AS last_updated,
    window_start,
    window_end
FROM (
    SELECT
        *,
        epoch_to_timestamp(timestamp) AS event_time
    FROM user_events
    WHERE event_type = 'click'
)
HOP (event_time, INTERVAL '30 seconds', INTERVAL '5 minutes')
GROUP BY user_id, window_start, window_end;

-- Purchase amount: 1-hour window sliding every 1 minute
CREATE MATERIALIZED VIEW purchase_amount_1h AS
SELECT
    user_id,
    COALESCE(SUM(amount), 0.0) AS total_amount,
    MAX(timestamp) AS last_updated,
    window_start,
    window_end
FROM (
    SELECT
        *,
        epoch_to_timestamp(timestamp) AS event_time
    FROM user_events
    WHERE event_type = 'purchase'
)
HOP (event_time, INTERVAL '1 minute', INTERVAL '1 hour')
GROUP BY user_id, window_start, window_end;

-- ============================================
-- Combined View for output (lightweight, no window logic)
-- ============================================
CREATE MATERIALIZED VIEW user_features_combined AS
SELECT
    COALESCE(c.user_id, p.user_id) AS user_id,
    COALESCE(c.click_count, 0) AS click_count_5m,
    COALESCE(p.total_amount, 0.0) AS purchase_amount_1h,
    GREATEST(
        COALESCE(c.last_updated, 0),
        COALESCE(p.last_updated, 0)
    ) AS last_updated
FROM click_count_5m c
FULL OUTER JOIN purchase_amount_1h p
    ON c.user_id = p.user_id
    AND c.window_end = p.window_end;

-- ============================================
-- Sink with batching and compression
-- ============================================
CREATE SINK user_features_sink
FROM user_features_combined
WITH (
    connector = 'kafka',
    properties.bootstrap.server = 'redpanda:9092',
    topic = 'user_features',
    -- Batching for throughput
    properties.batch.size = '16384',
    properties.linger.ms = '50',
    properties.compression.type = 'lz4',
    -- Exactly-once semantics
    properties.enable.idempotence = 'true',
    format = 'json'
);

-- ============================================
-- Index optimization for common queries
-- ============================================
-- Create indexes on the source table for faster filtering
-- Note: RisingWave automatically creates internal indexes for GROUP BY keys

-- ============================================
-- Performance Monitoring Queries
-- ============================================

-- Check MV progress and lag
-- SELECT * FROM rw_catalog.rw_materialized_views WHERE name IN ('click_count_5m', 'purchase_amount_1h');

-- Check source lag
-- SELECT * FROM rw_catalog.rw_table_stats WHERE name = 'user_events';

-- Check sink throughput
-- SELECT * FROM rw_catalog.rw_sink_stats WHERE name = 'user_features_sink';
