-- =====================================================================
-- 03_incremental_aggregations.sql
-- 用窗口 + WATERMARK + SUBSCRIBE 代替 "全量聚合常驻内存"
-- =====================================================================

-- (1) 给源流加 WATERMARK，告诉 Materialize 可以丢弃多旧的状态。
--     Materialize 要求在 SOURCE/table 层定义 watermark 列，而不是事后 ALTER MV。
--     用 mz_now() 的相对时间作为水位：比 10 分钟前更早的状态将被回收。
CREATE MATERIALIZED VIEW mv_orders_watermarked AS
SELECT *,
       created_at AS event_time
FROM kafka_orders
WHERE created_at > mz_now() - INTERVAL '10 minutes';

-- (2) 带 WATERMARK 的窗口聚合 —— 内存可控
CREATE MATERIALIZED VIEW mv_daily_revenue AS
SELECT
    window_start,
    window_end,
    status,
    SUM(total_amount) AS revenue,
    COUNT(*)          AS order_cnt
FROM TUMBLE(
    TABLE mv_orders_watermarked,
    DESCRIPTOR(event_time),
    INTERVAL '1 day'
)
GROUP BY window_start, window_end, status;

-- (3) HOP 窗口做滑动指标
CREATE MATERIALIZED VIEW mv_1h_revenue_sliding_5m AS
SELECT
    window_start,
    SUM(total_amount) AS revenue_1h
FROM HOP(
    TABLE mv_orders_watermarked,
    DESCRIPTOR(event_time),
    INTERVAL '5 minutes',
    INTERVAL '1 hour'
)
GROUP BY window_start;

-- (4) SUBSCRIBE 只推增量，不拉全量快照，避免客户端/服务端峰值内存
--     客户端执行：
SUBSCRIBE mv_daily_revenue WITH (SNAPSHOT = FALSE);

-- (5) 对于 "历史全量 + 实时增量" 混合场景，把历史预计算进一张静态表：
--     历史部分用 COPY / 批处理写入 Materialize 表，实时部分才用 MV 维护。
CREATE TABLE orders_historic (
    id BIGINT, user_id BIGINT, status TEXT,
    total_amount NUMERIC, created_at TIMESTAMP
);

CREATE MATERIALIZED VIEW mv_revenue_all AS
SELECT status, SUM(total_amount) AS revenue FROM orders_historic GROUP BY status
UNION ALL
SELECT status, SUM(total_amount) FROM kafka_orders WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY status;
