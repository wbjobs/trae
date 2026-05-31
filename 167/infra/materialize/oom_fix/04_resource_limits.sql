-- =====================================================================
-- 04_resource_limits.sql — 资源隔离：把大表 Join 和小查询分到不同 cluster
-- 任何一个 dataflow 占用超过单个 clusterd 实例的内存，就会把整个 cluster 拖垮。
-- 用多 cluster + 多 replica 是 Materialize 里解决 "一个 MV OOM 把整个实例带崩"
-- 的唯一手段。
-- =====================================================================

-- (1) 为 "超大表 join" 单独建一个专用 cluster，给它更大的内存 / 更多副本。
--     SIZE 参数控制每个副本的 CPU/RAM，REPLICAS 控制副本数。
--     1e8 x 1e8 的 join 通常需要 2xlarge 或 4xlarge 起步。
CREATE CLUSTER big_join_cluster SIZE = '2xlarge', REPLICAS = 1;

-- (2) 为 "小查询 / 交互式 BI" 建一个小 cluster。
CREATE CLUSTER bi_cluster SIZE = 'small', REPLICAS = 1;

-- (3) 把大 MV 绑定到 big_join_cluster，资源互不影响。
--     即使 big_join_cluster 爆了，bi_cluster 还能查询，不会全站挂。
SET CLUSTER = big_join_cluster;

CREATE MATERIALIZED VIEW mv_big_enriched_orders
IN CLUSTER big_join_cluster AS
SELECT o.*, i.*, p.name AS product_name
FROM kafka_orders o
JOIN kafka_order_items i ON o.id = i.order_id
JOIN kafka_products    p ON i.product_id = p.id;

-- (4) 下游聚合尽量在同一个 cluster 完成 (避免跨 cluster dataflow 拷贝)。
CREATE MATERIALIZED VIEW mv_daily_revenue
IN CLUSTER big_join_cluster AS
SELECT date_trunc('day', created_at) AS day,
       SUM(total_amount) AS revenue
FROM mv_big_enriched_orders
GROUP BY day;

-- (5) 给 BI / Preset 用的是小 cluster。客户端连接时指定 cluster 参数：
--     postgres://...?options=--cluster%3Dbi_cluster
-- 或者 session 内切：
SET CLUSTER = bi_cluster;
-- 之后 SELECT 就走 bi_cluster，只读最终 MV，不会触发大 join 重算。


-- (6) 监控：Materialize 自带的系统表可以实时看每个对象占多少内存。
--     mz_cluster_replicas + mz_sizing_advice 是 OOM 前的早期预警。
SELECT
    c.name       AS cluster,
    r.name       AS replica,
    r.status,
    c.size,
    r.credits_per_hour
FROM mz_clusters c
JOIN mz_cluster_replicas r ON r.cluster_id = c.id
WHERE c.name = 'big_join_cluster';

-- 每个 dataflow 占用的内存 (字节)
SELECT name, logical_size, physical_size
FROM mz_materialized_views
ORDER BY physical_size DESC NULLS LAST
LIMIT 20;

-- 内存增长最快的 operator，找出哪个算子导致 OOM
SELECT name, sum(memory_bytes) AS mem
FROM mz_dataflow_operators
GROUP BY name
ORDER BY mem DESC NULLS LAST
LIMIT 20;


-- (7) 自动伸缩 (Materialize 0.117+ 支持 managed replicas)
--     当内存压力持续 5 分钟超 80% 时自动升一档。
CREATE CLUSTER autoscale_cluster
    SIZE = 'large',
    REPLICAS = 1,
    INTROSPECTION DEBUGGING = ON
    WITH (MANAGED, MIN SIZE 'large', MAX SIZE '4xlarge');
