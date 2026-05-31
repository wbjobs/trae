#!/usr/bin/env python3
"""
湖仓查询加速层 - 主入口
集成数据注册、查询优化、计划可视化、隐藏列去重和物化视图功能
"""

from data_registry import (
    IcebergTableRegistry,
    IcebergPartitionManager,
    ZOrderOptimizer,
    DeleteFileCleaner,
    TableRegistration,
    ColumnDef,
    PartitionSpec,
    ZOrderSpec,
    PartitionTransform,
    FileFormat,
    WriteMode,
)
from query_optimizer import (
    QueryOptimizer,
    QueryPlanAnalyzer,
    QueryOptimizationConfig,
    QueryExecutionResult,
)
from plan_visualizer import (
    QueryPlanVisualizer,
    VisualizationFormat,
)
from deduplication import (
    HiddenColumnDeduplicator,
    DeduplicationConfig,
    DeduplicationMode,
    DeduplicationStrategy,
)
from materialized_view import (
    MaterializedViewManager,
    MaterializedViewDefinition,
    RefreshMode,
    create_default_views,
)


class LakehouseAccelerationLayer:
    """湖仓查询加速层主类"""

    def __init__(self, trino_host: str = "localhost", trino_port: int = 8080,
                 catalog: str = "iceberg", username: str = "admin"):
        self.registry = IcebergTableRegistry(trino_host, trino_port, catalog, username)
        self.partition_manager = IcebergPartitionManager(self.registry)
        self.zorder_optimizer = ZOrderOptimizer(self.registry)
        self.delete_cleaner = DeleteFileCleaner(self.registry)
        self.query_optimizer = QueryOptimizer(self.registry)
        self.plan_analyzer = QueryPlanAnalyzer()
        self.plan_visualizer = QueryPlanVisualizer(self.plan_analyzer)
        self.deduplicator = HiddenColumnDeduplicator(self.registry)
        self.mv_manager = MaterializedViewManager(self.registry)

    def setup_demo_tables(self):
        """设置演示表"""
        print("📦 注册演示表...")

        tables = [
            TableRegistration(
                table_name="orders",
                schema_name="ecommerce",
                columns=[
                    ColumnDef("order_id", "BIGINT", nullable=False),
                    ColumnDef("customer_id", "BIGINT"),
                    ColumnDef("product_id", "BIGINT"),
                    ColumnDef("order_date", "DATE"),
                    ColumnDef("amount", "DECIMAL(18,2)"),
                    ColumnDef("status", "VARCHAR(50)"),
                    ColumnDef("_hoodie_record_key", "VARCHAR(255)"),
                    ColumnDef("_hoodie_commit_time", "VARCHAR(50)"),
                ],
                partition_spec=[
                    PartitionSpec("order_date", PartitionTransform.DAY),
                ],
                z_order=ZOrderSpec(columns=["customer_id", "product_id"]),
                file_format=FileFormat.PARQUET,
                write_mode=WriteMode.COPY_ON_WRITE,
            ),
            TableRegistration(
                table_name="customers",
                schema_name="ecommerce",
                columns=[
                    ColumnDef("customer_id", "BIGINT", nullable=False),
                    ColumnDef("name", "VARCHAR(255)"),
                    ColumnDef("email", "VARCHAR(255)"),
                    ColumnDef("region", "VARCHAR(100)"),
                    ColumnDef("signup_date", "DATE"),
                    ColumnDef("_hoodie_record_key", "VARCHAR(255)"),
                    ColumnDef("_hoodie_commit_time", "VARCHAR(50)"),
                ],
                partition_spec=[
                    PartitionSpec("region", PartitionTransform.IDENTITY),
                ],
                z_order=ZOrderSpec(columns=["customer_id", "region"]),
                file_format=FileFormat.PARQUET,
                write_mode=WriteMode.COPY_ON_WRITE,
            ),
            TableRegistration(
                table_name="products",
                schema_name="ecommerce",
                columns=[
                    ColumnDef("product_id", "BIGINT", nullable=False),
                    ColumnDef("name", "VARCHAR(255)"),
                    ColumnDef("category", "VARCHAR(100)"),
                    ColumnDef("price", "DECIMAL(18,2)"),
                    ColumnDef("_hoodie_record_key", "VARCHAR(255)"),
                    ColumnDef("_hoodie_commit_time", "VARCHAR(50)"),
                ],
                partition_spec=[
                    PartitionSpec("category", PartitionTransform.IDENTITY),
                ],
                z_order=ZOrderSpec(columns=["product_id", "category"]),
                file_format=FileFormat.PARQUET,
                write_mode=WriteMode.COPY_ON_WRITE,
            ),
        ]

        for table in tables:
            result = self.registry.register_table(table)
            print(f"  ✓ {result['table']} (写入模式: {result.get('write_mode', 'N/A')})")

        return tables

    def setup_materialized_views(self):
        """设置物化视图"""
        print("\n📊 创建物化视图...")
        views = create_default_views(self.mv_manager)
        return views

    def refresh_materialized_views(self, schema_name: str = "ecommerce"):
        """刷新物化视图"""
        print("\n🔄 刷新物化视图...")
        views = self.mv_manager.list_materialized_views(schema_name)

        for view_info in views:
            view_name = view_info["view_name"]
            print(f"  📋 {view_name}:")

            result = self.mv_manager.auto_refresh_if_needed(schema_name, view_name)
            if result:
                print(f"    状态: {result.status}")
                if result.partitions_refreshed:
                    print(f"    刷新分区: {result.partitions_refreshed}")
            else:
                print(f"    无需刷新")

            retention_result = self.mv_manager.apply_retention_policy(
                MaterializedViewDefinition(
                    view_name=view_name,
                    schema_name=schema_name,
                    base_table="orders",
                    base_schema=schema_name,
                    query="",
                    partition_column="order_date",
                    retention_days=7
                )
            )
            print(f"    保留策略: {retention_result['status']}")

    def clean_delete_files(self, schema_name: str = "ecommerce"):
        """清理 delete files"""
        print("\n🧹 清理 delete files...")
        tables = self.registry.list_tables(schema_name)
        
        for table_name in tables:
            result = self.delete_cleaner.clean_table(schema_name, table_name)
            print(f"  ✓ {table_name}: {result.get('status', 'N/A')}")

    def run_demo_queries(self):
        """运行演示查询"""
        print("\n🔍 执行演示查询...")

        config = QueryOptimizationConfig(
            enable_partition_pruning=True,
            enable_zorder_optimization=True,
            enable_dynamic_filtering=True,
            enable_delete_file_cleanup=True,
            auto_compact_delete_files=True,
        )

        target_tables = [
            ("ecommerce", "orders"),
            ("ecommerce", "customers"),
        ]

        queries = [
            (
                "分区裁剪查询",
                """
                SELECT order_id, customer_id, amount, order_date
                FROM iceberg.ecommerce.orders
                WHERE order_date >= DATE '2024-01-01'
                  AND order_date < DATE '2024-02-01'
                  AND status = 'completed'
                """
            ),
            (
                "Z-Order 优化查询",
                """
                SELECT o.order_id, c.name, o.amount, o.order_date
                FROM iceberg.ecommerce.orders o
                JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
                WHERE c.region = 'East'
                  AND o.order_date >= DATE '2024-01-01'
                """
            ),
            (
                "多表连接查询",
                """
                SELECT o.order_id, c.name, p.name as product_name, o.amount
                FROM iceberg.ecommerce.orders o
                JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
                JOIN iceberg.ecommerce.products p ON o.product_id = p.product_id
                WHERE o.order_date >= DATE '2024-01-01'
                  AND c.region = 'West'
                """
            ),
        ]

        results = []
        for description, query in queries:
            print(f"\n  📋 {description}")
            result = self.query_optimizer.optimize_query(query, config, target_tables)
            results.append((description, query, result))

            if result.delete_file_info:
                print(f"    Delete files: {result.delete_file_info.delete_file_count}, 已清理: {result.delete_file_info.cleaned}")
            if result.partition_pruning:
                print(f"    分区裁剪: {result.partition_pruning.pruning_ratio:.0%}")
            if result.zorder_optimization:
                print(f"    Z-Order 提升: {result.zorder_optimization.estimated_improvement:.0%}")

        return results

    def visualize_query_plan(self, query: str, output_file: str = None):
        """可视化查询计划"""
        print("\n📊 生成查询计划可视化...")

        plan = self.registry.execute_query_with_plan(query)

        text_result = self.plan_visualizer.visualize(
            plan, VisualizationFormat.TEXT, query
        )
        print(text_result.content)

        if output_file:
            html_result = self.plan_visualizer.visualize(
                plan, VisualizationFormat.HTML, query
            )
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(html_result.content)
            print(f"\n  📄 HTML 可视化已保存: {output_file}")

        return text_result

    def deduplicate_demo(self):
        """演示去重功能"""
        print("\n♻️  执行数据去重...")

        config = DeduplicationConfig(
            hidden_key_column="_hoodie_record_key",
            timestamp_column="_hoodie_commit_time",
            mode=DeduplicationMode.FULL,
            strategy=DeduplicationStrategy.KEEP_LATEST,
        )

        tables = [
            ("ecommerce", "orders"),
            ("ecommerce", "customers"),
            ("ecommerce", "products"),
        ]

        for schema_name, table_name in tables:
            stats = self.deduplicator.get_duplicate_statistics(
                schema_name, table_name, config
            )
            print(f"\n  📊 {schema_name}.{table_name}:")
            if "error" not in stats:
                print(f"    重复率: {stats.get('duplicate_percentage', 0):.2f}%")

        results = self.deduplicator.batch_deduplicate(tables, config)
        report = self.deduplicator.generate_deduplication_report(results)
        print(report)

        return results

    def run_full_demo(self):
        """运行完整演示"""
        print("=" * 70)
        print("🚀 湖仓查询加速层 - 完整演示")
        print("=" * 70)
        print("技术栈: Trino + Iceberg + MinIO")
        print("功能: 分区裁剪 | Z-Order 优化 | 计划可视化 | 隐藏列去重")
        print("      物化视图自动刷新 | 数据保留策略")
        print("=" * 70)

        self.setup_demo_tables()
        self.setup_materialized_views()
        self.clean_delete_files("ecommerce")
        self.refresh_materialized_views("ecommerce")
        self.run_demo_queries()

        sample_query = """
SELECT o.order_id, c.name, o.amount
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01'
"""
        self.visualize_query_plan(sample_query, "query_plan.html")
        self.deduplicate_demo()

        print("\n" + "=" * 70)
        print("✅ 演示完成!")
        print("=" * 70)


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(
        description="湖仓查询加速层 - Trino + Iceberg + MinIO"
    )
    parser.add_argument(
        "--action",
        choices=["demo", "setup", "query", "visualize", "deduplicate", 
                 "clean", "status", "mv_create", "mv_refresh", "mv_status"],
        default="demo",
        help="执行的操作"
    )
    parser.add_argument("--host", default="localhost", help="Trino 主机地址")
    parser.add_argument("--port", type=int, default=8080, help="Trino 端口")
    parser.add_argument("--catalog", default="iceberg", help="Catalog 名称")
    parser.add_argument("--query", help="要执行的查询")
    parser.add_argument("--output", help="输出文件")
    parser.add_argument("--schema", default="ecommerce", help="Schema 名称")
    parser.add_argument("--view", help="物化视图名称")
    parser.add_argument("--retention-days", type=int, default=7, help="数据保留天数")

    args = parser.parse_args()

    layer = LakehouseAccelerationLayer(
        trino_host=args.host,
        trino_port=args.port,
        catalog=args.catalog,
    )

    if args.action == "demo":
        layer.run_full_demo()
    elif args.action == "setup":
        layer.setup_demo_tables()
        layer.setup_materialized_views()
    elif args.action == "query" and args.query:
        config = QueryOptimizationConfig()
        target_tables = [("ecommerce", "orders"), ("ecommerce", "customers")]
        result = layer.query_optimizer.optimize_query(args.query, config, target_tables)
        print(f"查询执行完成，扫描行数: {result.rows_scanned}")
        if result.delete_file_info:
            print(f"Delete files 已清理: {result.delete_file_info.cleaned}")
    elif args.action == "visualize" and args.query:
        layer.visualize_query_plan(args.query, args.output)
    elif args.action == "deduplicate":
        layer.deduplicate_demo()
    elif args.action == "clean":
        layer.clean_delete_files(args.schema)
    elif args.action == "mv_create":
        layer.setup_materialized_views()
    elif args.action == "mv_refresh":
        if args.view:
            result = layer.mv_manager.refresh_materialized_view(args.schema, args.view)
            print(f"视图 {args.view}: {result.status}")
        else:
            layer.refresh_materialized_views(args.schema)
    elif args.action == "mv_status":
        views = layer.mv_manager.list_materialized_views(args.schema)
        print(f"物化视图列表 (Schema: {args.schema}):")
        for view_info in views:
            print(f"  - {view_info['view_name']}")
            status = layer.mv_manager.get_view_status(args.schema, view_info['view_name'])
            print(f"    行数: {status['row_count']:,}")
            print(f"    分区数: {status['partition_count']}")
    elif args.action == "status":
        tables = layer.registry.list_tables(args.schema)
        print(f"已注册的表 (Schema: {args.schema}):")
        for table in tables:
            delete_info = layer.registry.get_delete_file_info(args.schema, table)
            print(f"  - {table}")
            if "delete_file_count" in delete_info:
                print(f"    Delete files: {delete_info['delete_file_count']}")
            elif "delete_files" in delete_info:
                print(f"    Delete files: {delete_info['delete_files']}")


if __name__ == "__main__":
    main()
