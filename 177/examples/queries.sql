-- ============================================================
-- 湖仓查询加速层 - 示例 SQL 查询
-- 技术栈: Trino + Iceberg + MinIO
-- 功能: 分区裁剪 | Z-Order 优化 | 计划可视化 | 隐藏列去重
--       物化视图自动刷新 | 数据保留策略
-- ============================================================

-- ============================================================
-- 0. 物化视图管理
-- ============================================================

-- 创建物化视图（每日订单汇总）
CREATE TABLE IF NOT EXISTS iceberg.ecommerce.mv_daily_orders
WITH (
    format = 'PARQUET',
    partitioning = ARRAY['order_date']
)
AS
SELECT 
    order_date,
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
FROM iceberg.ecommerce.orders
WHERE status = 'completed'
GROUP BY order_date, customer_id;

-- 创建物化视图（客户汇总）
CREATE TABLE IF NOT EXISTS iceberg.ecommerce.mv_customer_summary
WITH (
    format = 'PARQUET',
    partitioning = ARRAY['last_order_date']
)
AS
SELECT 
    c.customer_id,
    c.name,
    c.region,
    COUNT(o.order_id) as total_orders,
    SUM(o.amount) as total_amount,
    MAX(o.order_date) as last_order_date
FROM iceberg.ecommerce.customers c
LEFT JOIN iceberg.ecommerce.orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
GROUP BY c.customer_id, c.name, c.region;

-- 创建物化视图（产品销售汇总）
CREATE TABLE IF NOT EXISTS iceberg.ecommerce.mv_product_sales
WITH (
    format = 'PARQUET',
    partitioning = ARRAY['order_date']
)
AS
SELECT 
    o.order_date,
    p.product_id,
    p.name as product_name,
    p.category,
    COUNT(o.order_id) as sales_count,
    SUM(o.amount) as total_sales
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.products p ON o.product_id = p.product_id
WHERE o.status = 'completed'
GROUP BY o.order_date, p.product_id, p.name, p.category;

-- 全量刷新物化视图
DELETE FROM iceberg.ecommerce.mv_daily_orders;

INSERT INTO iceberg.ecommerce.mv_daily_orders
SELECT 
    order_date,
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
FROM iceberg.ecommerce.orders
WHERE status = 'completed'
GROUP BY order_date, customer_id;

-- 增量刷新物化视图（只刷新某个分区）
DELETE FROM iceberg.ecommerce.mv_daily_orders
WHERE order_date = DATE '2024-01-15';

INSERT INTO iceberg.ecommerce.mv_daily_orders
SELECT 
    order_date,
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
FROM iceberg.ecommerce.orders
WHERE status = 'completed'
  AND order_date = DATE '2024-01-15'
GROUP BY order_date, customer_id;

-- 应用数据保留策略（删除超过 7 天的数据）
DELETE FROM iceberg.ecommerce.mv_daily_orders
WHERE order_date < CURRENT_DATE - INTERVAL '7' DAY;

-- 查看物化视图状态
SELECT 'mv_daily_orders' as view_name, COUNT(*) as row_count
FROM iceberg.ecommerce.mv_daily_orders
UNION ALL
SELECT 'mv_customer_summary' as view_name, COUNT(*) as row_count
FROM iceberg.ecommerce.mv_customer_summary
UNION ALL
SELECT 'mv_product_sales' as view_name, COUNT(*) as row_count
FROM iceberg.ecommerce.mv_product_sales;

-- 查询物化视图（比直接查询基础表更快）
SELECT *
FROM iceberg.ecommerce.mv_daily_orders
WHERE order_date >= DATE '2024-01-01'
ORDER BY total_amount DESC
LIMIT 100;

-- ============================================================
-- 1. Delete File 管理（修复数据重复问题）
-- ============================================================

-- 检查 delete files 状态
SELECT 
    COUNT(*) as total_files,
    SUM(CASE WHEN content = 0 THEN 1 ELSE 0 END) as data_files,
    SUM(CASE WHEN content = 2 THEN 1 ELSE 0 END) as delete_files,
    SUM(CASE WHEN content = 0 THEN record_count ELSE 0 END) as data_records,
    SUM(CASE WHEN content = 2 THEN record_count ELSE 0 END) as deleted_records
FROM "iceberg.ecommerce.orders$files";

-- 清理 delete files - 合并数据文件
ALTER TABLE iceberg.ecommerce.orders EXECUTE rewrite_data_files;

-- 清理孤立文件
ALTER TABLE iceberg.ecommerce.orders EXECUTE remove_orphan_files;

-- 清理过期快照
ALTER TABLE iceberg.ecommerce.orders EXECUTE expire_snapshots(RETAIN_LAST => 10);

-- ============================================================
-- 2. 分区裁剪查询示例
-- ============================================================

-- 利用 order_date 分区列进行裁剪
SELECT order_id, customer_id, amount, order_date
FROM iceberg.ecommerce.orders
WHERE order_date >= DATE '2024-01-01'
  AND order_date < DATE '2024-02-01'
  AND status = 'completed';

-- 多分区列裁剪
SELECT o.order_id, c.name, o.amount
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01'
  AND o.order_date < DATE '2024-06-01'
  AND c.region = 'East';

-- ============================================================
-- 3. Z-Order 优化查询示例
-- ============================================================

-- 利用 Z-Order 列 (customer_id, product_id) 进行优化
SELECT o.order_id, o.customer_id, o.product_id, o.amount
FROM iceberg.ecommerce.orders o
WHERE o.customer_id IN (1001, 1002, 1003)
  AND o.product_id IN (2001, 2002, 2003);

-- Z-Order 与分区裁剪结合
SELECT o.order_id, c.name, p.name as product_name
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
JOIN iceberg.ecommerce.products p ON o.product_id = p.product_id
WHERE o.order_date >= DATE '2024-01-01'
  AND c.region = 'West'
  AND p.category = 'Electronics';

-- ============================================================
-- 4. 隐藏列去重查询示例
-- ============================================================

-- 利用 _hoodie_record_key 查询去重后的记录
SELECT order_id, customer_id, amount, _hoodie_record_key
FROM (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY _hoodie_record_key ORDER BY _hoodie_commit_time DESC) as rn
    FROM iceberg.ecommerce.orders
    WHERE _hoodie_record_key IS NOT NULL
)
WHERE rn = 1
LIMIT 100;

-- 快速去重 - 使用 QUALIFY 语法
SELECT order_id, customer_id, amount, _hoodie_record_key
FROM iceberg.ecommerce.orders
WHERE _hoodie_record_key IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY _hoodie_record_key ORDER BY _hoodie_commit_time DESC) = 1;

-- ============================================================
-- 5. 查询计划分析
-- ============================================================

-- 查看执行计划
EXPLAIN (FORMAT JSON)
SELECT o.order_id, c.name, o.amount
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01';

-- 查看分布式执行计划
EXPLAIN (TYPE DISTRIBUTED, FORMAT JSON)
SELECT order_id, customer_id, amount
FROM iceberg.ecommerce.orders
WHERE order_date >= DATE '2024-01-01';

-- ============================================================
-- 6. 数据统计查询
-- ============================================================

-- 查看分区信息
SELECT *
FROM "iceberg.ecommerce.orders$partitions"
ORDER BY partition_key;

-- 查看文件信息
SELECT file_path, record_count, file_size_in_bytes, content
FROM "iceberg.ecommerce.orders$files"
ORDER BY record_count DESC
LIMIT 50;

-- 查看表属性
SHOW PROPERTIES FROM iceberg.ecommerce.orders;

-- ============================================================
-- 7. 性能优化会话配置
-- ============================================================

-- 启用动态过滤
SET SESSION iceberg.dynamic-filtering.enabled = true;
SET SESSION iceberg.dynamic-filtering.wait-timeout = '30s';

-- 启用分区裁剪
SET SESSION iceberg.partition-pruning.enabled = true;

-- 启用 delete file 处理
SET SESSION iceberg.delete_file.enabled = true;
SET SESSION iceberg.position-delete.enabled = true;
SET SESSION iceberg.equality-delete.enabled = true;
SET SESSION iceberg.merge-on-read.enabled = true;

-- 设置查询内存
SET SESSION query_max_memory = '4GB';
SET SESSION query_max_memory_per_node = '2GB';

-- ============================================================
-- 8. 数据加载示例
-- ============================================================

-- 从 CSV 加载数据
COPY iceberg.ecommerce.orders (order_id, customer_id, product_id, order_date, amount, status)
FROM '/data/orders.csv'
WITH (
    format = 'csv',
    csv_delimiter = ',',
    csv_header = true
);

-- 从 Parquet 加载数据
COPY iceberg.ecommerce.customers
FROM '/data/customers/'
WITH (
    format = 'parquet'
);

-- ============================================================
-- 9. 表管理操作
-- ============================================================

-- 优化表
ALTER TABLE iceberg.ecommerce.orders EXECUTE optimize;

-- 清理过期快照
ALTER TABLE iceberg.ecommerce.orders EXECUTE expire_snapshots('2024-01-01');

-- 移除孤立文件
ALTER TABLE iceberg.ecommerce.orders EXECUTE remove_orphan_files;

-- 添加列
ALTER TABLE iceberg.ecommerce.orders ADD COLUMN discount DECIMAL(18,2);

-- 修改表属性
ALTER TABLE iceberg.ecommerce.orders SET PROPERTIES write_format = 'PARQUET';

-- 设置写入模式为 COW（避免产生 delete files）
ALTER TABLE iceberg.ecommerce.orders SET PROPERTIES 
    write_delete_mode = 'copy-on-write',
    write_update_mode = 'copy-on-write',
    write_merge_mode = 'copy-on-write';
