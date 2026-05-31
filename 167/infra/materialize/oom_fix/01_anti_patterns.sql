-- =====================================================================
-- 01_anti_patterns.sql  —  会把 Materialize 内存吃爆的写法 (反模式清单)
-- ---------------------------------------------------------------------
-- Materialize 的执行模型是 **全量增量维护 (differential dataflow)**：
-- 任何一个物化视图一旦被激活，就会在集群里把它的完整结果集长期驻留内存，
-- 以便把下游查询做成 O(1)。一旦 JOIN 产生的中间结果或最终结果过大，
-- 就会导致 `mz_worker` 进程 OOM 被内核杀掉，整个 cluster 被重启。
--
-- 下面是 1 亿 × 1 亿 这种规模下最常见的 OOM 触发点，都 **必须避免**。
-- =====================================================================

-- ❌ 反模式 1：非等值 Join / 范围 Join —— 结果集是 O(N*M) 的笛卡尔积近似
--    WHERE a.ts BETWEEN b.start_ts AND b.end_ts
--    WHERE ABS(a.x - b.x) < 10
--    这类条件无法走 Hash Join，Materialize 会退化为 Nested Loop，中间结果爆掉。
CREATE MATERIALIZED VIEW bad_range_join AS
SELECT a.id, b.id
FROM orders a
JOIN orders b
  ON a.user_id = b.user_id                       -- 好
 AND ABS(a.total_amount - b.total_amount) < 10;  -- ❌ 非等值 = 灾难
-- 修正思路：先用等值 key 过滤，再用 MATERIALIZE LOOKUP 或上层窗口函数做范围。


-- ❌ 反模式 2：没有等值连接键的多表 Join —— 直接产生笛卡尔积
CREATE MATERIALIZED VIEW bad_cartesian AS
SELECT *
FROM orders, users;
-- 1e8 × 1e8 = 1e16 行，内存瞬间爆炸。必须有等值 ON 条件。


-- ❌ 反模式 3：无窗口的 ORDER BY + LIMIT (TopN 无排序键过滤)
CREATE MATERIALIZED VIEW bad_topn AS
SELECT * FROM orders ORDER BY total_amount DESC LIMIT 10;
-- 没有 PARTITION BY 的 TopN 会把全表所有行的 key 存进 priority queue，
-- 对 1 亿行表来说就是 1 亿个最小堆节点常驻内存。应改为带 PARTITION 的 TopN：
--   MATERIALIZE (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ...) ...)


-- ❌ 反模式 4：LEFT JOIN 大表做维表，并且维表未做 DISTINCT / UNIQUE 约束
CREATE MATERIALIZED VIEW bad_left_join AS
SELECT o.*, p.name
FROM orders o
LEFT JOIN products p ON o.product_id = p.id;
-- 当 products 没有 UNIQUE(id) 约束时，Materialize 必须保留所有历史版本，
-- 一旦上游出现重复 id，join 会把 orders 的每一行乘法放大。
-- 修正：在源侧或在 MATERIALIZE 里加 UNIQUE/ENVELOPE DEBEZIUM UPSERT。


-- ❌ 反模式 5：TUMBLE/HOP 窗口无 WATERMARK 或窗口过大
CREATE MATERIALIZED VIEW bad_window AS
SELECT window_start, SUM(total_amount)
FROM TUMBLE(orders, created_at, INTERVAL '1 day')
GROUP BY window_start;
-- 没有 WATERMARK 的窗口意味着 1 亿行全被缓存到 window state，永远不释放。
-- 必须显式声明 WATERMARK 让过期状态被丢弃。


-- ❌ 反模式 6：把 CDC 原始表 (ENVELOPE UPSERT) 直接做聚合
CREATE MATERIALIZED VIEW bad_sum AS
SELECT user_id, SUM(total_amount) FROM orders GROUP BY user_id;
-- 如果 orders 的 UPSERT 键是 (id)，但 user_id 会变 (事实上订单 user_id 不变，
-- 但如果表里有会变的列又被 GROUP BY)，会导致状态不可收缩。
-- 修正：对事实表用 ENVELOPE DEBEZIUM，或在中间层做 DISTINCT ON。


-- ❌ 反模式 7：跨 cluster 的链式 JOIN (dataflow 合并放大)
-- 大表 A (cluster_x) ⋈ 大表 B (cluster_y) ⋈ 大表 C (cluster_z)
-- 结果会被网络 copy 三次，每个 cluster 都缓存一份 join state。
-- 修正：把相关大表放进同一个 cluster，并用单一物化视图一次性完成。


-- ❌ 反模式 8：忘记设置 INDEX / 让下游查询被迫重新做 arrange
-- Materialize 默认会自动 arrange，但多个视图共用同一个 arrange 才会省内存。
-- 显式 CREATE INDEX idx ON orders(user_id) 可被多个 MV 复用。


-- ❌ 反模式 9：SUBSCRIBE 不加 AS OF 或 WITH (SNAPSHOT = FALSE)
-- 客户端订阅大表如果没有 SNAPSHOT=false，会先把全量快照拉到客户端，
-- 服务端侧也需要持有一致性快照，短暂内双份内存峰值。
-- 修正：SUBSCRIBE some_view WITH (SNAPSHOT = FALSE);
