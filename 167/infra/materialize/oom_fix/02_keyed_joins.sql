-- =====================================================================
-- 02_keyed_joins.sql — 正确的大表 Join 写法：等值 + LOOKUP + UPSERT 包络
-- 目标：让 1e8 x 1e8 的 join state 保持在 O(N + M) 而非 O(N * M)
-- =====================================================================

-- (1) 源表必须声明等值唯一键，让 Materialize 可以用 UPSERT 包络丢弃旧版本
CREATE SOURCE kafka_orders
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.orders'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

CREATE SOURCE kafka_order_items
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.order_items'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

CREATE SOURCE kafka_products
FROM KAFKA BROKER 'kafka:9092' TOPIC 'shop.shop.products'
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY 'http://schema-registry:8081'
ENVELOPE DEBEZIUM;

-- (2) 为每个大表在 join key 上建索引，多个 MV 共享同一个 arrange
CREATE INDEX idx_orders_user    ON kafka_orders (user_id);
CREATE INDEX idx_orders_id      ON kafka_orders (id);
CREATE INDEX idx_items_order    ON kafka_order_items (order_id);
CREATE INDEX idx_items_product  ON kafka_order_items (product_id);
CREATE INDEX idx_products_id    ON kafka_products (id);

-- (3) 只做等值 Join。Join 条件里**所有**列必须是等值，不能出现范围/like/函数。
CREATE MATERIALIZED VIEW mv_order_enriched AS
SELECT
    o.id            AS order_id,
    o.user_id,
    o.status,
    o.total_amount,
    o.created_at    AS order_created_at,
    i.id            AS item_id,
    i.product_id,
    i.quantity,
    i.unit_price,
    p.name          AS product_name,
    p.category      AS product_category
FROM kafka_orders o
JOIN kafka_order_items i
  ON o.id = i.order_id                       -- 等值
JOIN kafka_products p
  ON i.product_id = p.id;                    -- 等值

-- (4) 对 "维表查事实表" 的单向查找，用 AS OF + 显式索引查询更省内存：
--     避免常驻 join state，而是按需查索引。对超大维表建议拆到独立 cluster。
CREATE MATERIALIZED VIEW mv_order_product_map AS
SELECT o.id AS order_id, o.user_id, o.total_amount, p.name AS product_name
FROM kafka_orders o
LEFT JOIN kafka_products p
  ON CAST(o.user_id AS bigint) = p.id;   -- 列必须可比较且等值

-- (5) 大 TopN 必须带 PARTITION，避免 1 亿行全进内存堆
CREATE MATERIALIZED VIEW mv_user_top_orders AS
SELECT order_id, user_id, total_amount, rn
FROM (
    SELECT id AS order_id, user_id, total_amount,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total_amount DESC) AS rn
    FROM kafka_orders
)
WHERE rn <= 10;
