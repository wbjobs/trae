-- =====================================================================
-- 02_quality_checks.sql  —  实时数据质量指标 (用 Materialize MV 实现)
--
-- 这些视图不是用来处理 DLQ 的，而是在正常流上做业务层的质量监控，
-- 比如：空值率、值域越界、参照孤儿、重复 key、延迟等。
-- 全部是增量维护，O(1) 查询，可直接给 Preset 做告警看板。
-- =====================================================================

-- ============================================================
-- 1. 空值率检查 (每列的 null 比例，按分钟窗口)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_null_check_orders AS
SELECT
    date_trunc('minute', created_at) AS window_min,
    COUNT(*)                                                           AS total_rows,
    COUNT(*) FILTER (WHERE status IS NULL)                             AS null_status,
    COUNT(*) FILTER (WHERE total_amount IS NULL)                       AS null_total,
    COUNT(*) FILTER (WHERE user_id IS NULL)                            AS null_user,
    ROUND(COUNT(*) FILTER (WHERE status IS NULL)     * 100.0 / COUNT(*), 2) AS pct_null_status,
    ROUND(COUNT(*) FILTER (WHERE total_amount IS NULL) * 100.0 / COUNT(*), 2) AS pct_null_total
FROM kafka_orders
GROUP BY 1;

-- ============================================================
-- 2. 值域越界 (total_amount <= 0, quantity <= 0, price <= 0)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_range_violations AS
SELECT 'orders.total_amount<=0'   AS check_name, COUNT(*) AS cnt FROM kafka_orders      WHERE total_amount <= 0
UNION ALL
SELECT 'orders.status_invalid',         COUNT(*) FROM kafka_orders      WHERE status NOT IN ('pending','paid','shipped','cancelled')
UNION ALL
SELECT 'order_items.quantity<=0',       COUNT(*) FROM kafka_order_items WHERE quantity <= 0
UNION ALL
SELECT 'order_items.unit_price<=0',     COUNT(*) FROM kafka_order_items WHERE unit_price <= 0
UNION ALL
SELECT 'products.price<=0',             COUNT(*) FROM kafka_products    WHERE price <= 0;

-- ============================================================
-- 3. 参照完整性 (订单条目引用了不存在的 product_id)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_orphan_order_items AS
SELECT
    i.id          AS orphan_item_id,
    i.order_id,
    i.product_id,
    i.quantity,
    i.unit_price,
    i.created_at
FROM kafka_order_items i
LEFT JOIN kafka_products p ON i.product_id = p.id
WHERE p.id IS NULL;

-- ============================================================
-- 4. 重复 key 检测 (按源表主键)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_duplicate_keys AS
SELECT 'orders'        AS src_table, id, COUNT(*) AS cnt FROM kafka_orders      GROUP BY id HAVING COUNT(*) > 1
UNION ALL
SELECT 'order_items',       id, COUNT(*) FROM kafka_order_items GROUP BY id HAVING COUNT(*) > 1
UNION ALL
SELECT 'products',          id, COUNT(*) FROM kafka_products    GROUP BY id HAVING COUNT(*) > 1
UNION ALL
SELECT 'users',             id, COUNT(*) FROM kafka_users       GROUP BY id HAVING COUNT(*) > 1;

-- ============================================================
-- 5. 端到端延迟 (Kafka 事件时间 vs Materialize 处理时间)
--    用于监控 CDC 延迟，> 5s 就该告警
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_end_to_end_lag AS
SELECT
    date_trunc('minute', created_at) AS event_minute,
    COUNT(*)                         AS event_count,
    MAX(EXTRACT(EPOCH FROM (mz_now() - created_at)))  AS max_lag_sec,
    AVG(EXTRACT(EPOCH FROM (mz_now() - created_at)))  AS avg_lag_sec,
    MIN(EXTRACT(EPOCH FROM (mz_now() - created_at)))  AS min_lag_sec
FROM kafka_orders
GROUP BY 1;

-- ============================================================
-- 6. 综合质量打分 (0-100)
--    给 BI 看板用，一个数字就能看整体健康度
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_quality_score AS
SELECT
    100.0
    - COALESCE((SELECT SUM(cnt) * 2 FROM mv_range_violations), 0)
    - COALESCE((SELECT COUNT(*) * 5 FROM mv_orphan_order_items), 0)
    - COALESCE((SELECT SUM(cnt - 1) * 3 FROM mv_duplicate_keys), 0)
    - COALESCE((SELECT error_count * 1 FROM mv_dlq_error_stats WHERE window_min = date_trunc('minute', mz_now())), 0)
    AS quality_score
WHERE 1 = 1;

-- ============================================================
-- 7. SUBSCRIBE 告警钩子 (下游接 PagerDuty/飞书/钉钉)
--    客户端运行下面这行即可实时收到异常事件：
--    SUBSCRIBE (SELECT * FROM mv_dlq_recent_errors WHERE cnt_last_10min > 0)
--    WITH (SNAPSHOT = FALSE);
-- ============================================================
