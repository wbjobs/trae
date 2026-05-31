#!/usr/bin/env python3
"""
数据注册模块：将 CSV/Parquet 数据注册为 Iceberg 表
支持分区裁剪和 Z-order 排序优化
修复：正确处理 delete files，避免数据重复
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum
import os
import json


class FileFormat(Enum):
    CSV = "csv"
    PARQUET = "parquet"


class WriteMode(Enum):
    COPY_ON_WRITE = "copy-on-write"
    MERGE_ON_READ = "merge-on-read"


class PartitionTransform(Enum):
    IDENTITY = "identity"
    YEAR = "year"
    MONTH = "month"
    DAY = "day"
    HOUR = "hour"
    BUCKET = "bucket"
    TRUNCATE = "truncate"


@dataclass
class PartitionSpec:
    column: str
    transform: PartitionTransform = PartitionTransform.IDENTITY
    num_buckets: Optional[int] = None

    def to_iceberg_expression(self) -> str:
        if self.transform == PartitionTransform.BUCKET:
            return f"bucket({self.column}, {self.num_buckets})"
        elif self.transform == PartitionTransform.TRUNCATE:
            return f"truncate({self.column}, {self.num_buckets})"
        elif self.transform == PartitionTransform.IDENTITY:
            return self.column
        else:
            return f"{self.transform.value}({self.column})"


@dataclass
class ZOrderSpec:
    columns: List[str] = field(default_factory=list)

    def to_expression(self) -> str:
        return ", ".join(self.columns)


@dataclass
class ColumnDef:
    name: str
    data_type: str
    nullable: bool = True


@dataclass
class TableRegistration:
    table_name: str
    schema_name: str = "default"
    columns: List[ColumnDef] = field(default_factory=list)
    partition_spec: Optional[List[PartitionSpec]] = None
    z_order: Optional[ZOrderSpec] = None
    file_format: FileFormat = FileFormat.PARQUET
    write_mode: WriteMode = WriteMode.COPY_ON_WRITE
    source_path: str = ""
    properties: Dict[str, str] = field(default_factory=dict)


class IcebergTableRegistry:
    """Iceberg 表注册器 - 处理 CSV/Parquet 数据注册为 Iceberg 表
    修复：正确处理 delete files，避免数据重复
    """

    def __init__(self, trino_host: str = "localhost", trino_port: int = 8080,
                 catalog: str = "iceberg", username: str = "admin"):
        self.trino_host = trino_host
        self.trino_port = trino_port
        self.catalog = catalog
        self.username = username
        self._connection = None

    def _get_connection(self):
        """获取 Trino 连接"""
        if self._connection is None:
            import trino.dbapi
            self._connection = trino.dbapi.connect(
                host=self.trino_host,
                port=self.trino_port,
                user=self.username,
                catalog=self.catalog,
            )
        return self._connection

    def execute_query(self, query: str, fetch: bool = True) -> Any:
        """执行 Trino 查询"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(query)
        if fetch:
            return cursor.fetchall()
        return cursor

    def execute_query_with_plan(self, query: str) -> Dict:
        """执行查询并返回执行计划"""
        explain_query = f"EXPLAIN (FORMAT JSON) {query}"
        result = self.execute_query(explain_query)
        if result and len(result) > 0:
            return json.loads(result[0][0]) if isinstance(result[0][0], str) else result[0][0]
        return {}

    def create_schema(self, schema_name: str):
        """创建 Schema"""
        query = f"CREATE SCHEMA IF NOT EXISTS {self.catalog}.{schema_name}"
        self.execute_query(query, fetch=False)

    def _generate_column_defs(self, columns: List[ColumnDef]) -> str:
        """生成列定义"""
        col_defs = []
        for col in columns:
            nullable_str = "" if col.nullable else " NOT NULL"
            col_defs.append(f"    {col.name} {col.data_type}{nullable_str}")
        return ",\n".join(col_defs)

    def _generate_partition_clause(self, partition_spec: List[PartitionSpec]) -> str:
        """生成分区子句"""
        if not partition_spec:
            return ""
        partition_exprs = [p.to_iceberg_expression() for p in partition_spec]
        return f"\nWITH (\n    partitioning = ARRAY[{', '.join(partition_exprs)}]\n)"

    def _generate_table_properties(self, registration: TableRegistration) -> Dict[str, str]:
        """生成表属性，包含 delete file 处理配置"""
        properties = dict(registration.properties)
        properties.setdefault("format", registration.file_format.value)

        if registration.write_mode == WriteMode.COPY_ON_WRITE:
            properties["write.delete.mode"] = "copy-on-write"
            properties["write.update.mode"] = "copy-on-write"
            properties["write.merge.mode"] = "copy-on-write"
        else:
            properties["write.delete.mode"] = "merge-on-read"
            properties["write.update.mode"] = "merge-on-read"
            properties["write.merge.mode"] = "merge-on-read"

        properties["read.split.target-size"] = "134217728"

        if registration.z_order and registration.z_order.columns:
            z_order_expr = registration.z_order.to_expression()
            properties["sort_order"] = z_order_expr

        return properties

    def create_table_ddl(self, registration: TableRegistration) -> str:
        """生成 CREATE TABLE DDL，包含 delete file 处理配置"""
        full_table_name = f"{self.catalog}.{registration.schema_name}.{registration.table_name}"
        column_defs = self._generate_column_defs(registration.columns)
        partition_clause = self._generate_partition_clause(registration.partition_spec or [])

        properties = self._generate_table_properties(registration)
        props_str = ",\n".join([f"    {k} = '{v}'" for k, v in properties.items()])

        ddl = f"""
CREATE TABLE IF NOT EXISTS {full_table_name} (
{column_defs}
)
WITH (
{props_str}
){partition_clause}
""".strip()
        return ddl

    def register_table(self, registration: TableRegistration) -> Dict:
        """注册 Iceberg 表"""
        self.create_schema(registration.schema_name)
        ddl = self.create_table_ddl(registration)
        self.execute_query(ddl, fetch=False)

        return {
            "status": "success",
            "table": f"{registration.schema_name}.{registration.table_name}",
            "ddl": ddl,
            "write_mode": registration.write_mode.value
        }

    def register_csv_table(self, registration: TableRegistration,
                           csv_path: str, delimiter: str = ",",
                           header: bool = True) -> Dict:
        """从 CSV 文件注册表"""
        registration.file_format = FileFormat.CSV
        result = self.register_table(registration)

        if csv_path and os.path.exists(csv_path):
            full_table_name = f"{self.catalog}.{registration.schema_name}.{registration.table_name}"
            columns = ", ".join([c.name for c in registration.columns])
            copy_query = f"""
COPY {full_table_name} ({columns})
FROM '{csv_path}'
WITH (
    format = '{registration.file_format.value}',
    csv_delimiter = '{delimiter}',
    csv_header = {str(header).lower()}
)
"""
            self.execute_query(copy_query, fetch=False)
            result["data_loaded"] = True

        return result

    def register_parquet_table(self, registration: TableRegistration,
                               parquet_path: str) -> Dict:
        """从 Parquet 文件注册表"""
        registration.file_format = FileFormat.PARQUET
        result = self.register_table(registration)

        if parquet_path:
            full_table_name = f"{self.catalog}.{registration.schema_name}.{registration.table_name}"
            columns = ", ".join([c.name for c in registration.columns])
            copy_query = f"""
COPY {full_table_name} ({columns})
FROM '{parquet_path}'
WITH (
    format = '{registration.file_format.value}'
)
"""
            self.execute_query(copy_query, fetch=False)
            result["data_loaded"] = True

        return result

    def apply_zorder_optimization(self, schema_name: str, table_name: str,
                                  z_order_columns: List[str]):
        """应用 Z-Order 排序优化"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        z_order_str = ", ".join(z_order_columns)
        query = f"ALTER TABLE {full_table_name} SET PROPERTIES sort_order = '{z_order_str}'"
        self.execute_query(query, fetch=False)

    def optimize_table(self, schema_name: str, table_name: str,
                       rewrite_data: bool = True) -> Dict:
        """执行表优化（数据压缩和重写）"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        if rewrite_data:
            query = f"ALTER TABLE {full_table_name} EXECUTE optimize"
            self.execute_query(query, fetch=False)
        return {"status": "optimized", "table": full_table_name}

    def compact_delete_files(self, schema_name: str, table_name: str) -> Dict:
        """合并 delete files，避免数据重复
        这是修复 delete file 问题的关键操作
        """
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        query = f"ALTER TABLE {full_table_name} EXECUTE rewrite_data_files"
        try:
            self.execute_query(query, fetch=False)
            return {"status": "success", "table": full_table_name, "action": "rewrite_data_files"}
        except Exception as e:
            return {"status": "error", "table": full_table_name, "error": str(e)}

    def purge_delete_files(self, schema_name: str, table_name: str) -> Dict:
        """清理已合并的 delete files"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        query = f"ALTER TABLE {full_table_name} EXECUTE remove_orphan_files"
        try:
            self.execute_query(query, fetch=False)
            return {"status": "success", "table": full_table_name, "action": "remove_orphan_files"}
        except Exception as e:
            return {"status": "error", "table": full_table_name, "error": str(e)}

    def expire_snapshots(self, schema_name: str, table_name: str,
                         retain_last: int = 10) -> Dict:
        """清理过期快照，减少元数据大小"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        query = f"ALTER TABLE {full_table_name} EXECUTE expire_snapshots(RETAIN_LAST => {retain_last})"
        try:
            self.execute_query(query, fetch=False)
            return {"status": "success", "table": full_table_name, "action": "expire_snapshots"}
        except Exception as e:
            return {"status": "error", "table": full_table_name, "error": str(e)}

    def get_table_info(self, schema_name: str, table_name: str) -> Dict:
        """获取表信息"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        query = f"DESCRIBE {full_table_name}"
        result = self.execute_query(query)
        return {"table": full_table_name, "columns": result}

    def get_delete_file_info(self, schema_name: str, table_name: str) -> Dict:
        """获取 delete files 信息"""
        full_table_name = f"{self.catalog}.{schema_name}.{table_name}"
        try:
            query = f"""
SELECT 
    COUNT(*) as delete_file_count,
    SUM(record_count) as total_deleted_records,
    SUM(file_size_in_bytes) as total_delete_file_size
FROM "{full_table_name}$files"
WHERE content = 2
"""
            result = self.execute_query(query)
            if result and len(result) > 0:
                return {
                    "table": full_table_name,
                    "delete_file_count": result[0][0],
                    "total_deleted_records": result[0][1],
                    "total_delete_file_size": result[0][2],
                    "has_delete_files": result[0][0] > 0
                }
        except Exception as e:
            pass

        try:
            query = f"""
SELECT 
    COUNT(*) as total_files,
    SUM(CASE WHEN content = 0 THEN 1 ELSE 0 END) as data_files,
    SUM(CASE WHEN content = 2 THEN 1 ELSE 0 END) as delete_files,
    SUM(record_count) as total_records,
    SUM(file_size_in_bytes) as total_size
FROM "{full_table_name}$files"
"""
            result = self.execute_query(query)
            if result and len(result) > 0:
                return {
                    "table": full_table_name,
                    "total_files": result[0][0],
                    "data_files": result[0][1],
                    "delete_files": result[0][2],
                    "total_records": result[0][3],
                    "total_size": result[0][4]
                }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}

        return {}

    def list_tables(self, schema_name: str = "default") -> List[str]:
        """列出所有表"""
        query = f"SHOW TABLES FROM {self.catalog}.{schema_name}"
        result = self.execute_query(query)
        return [row[0] for row in result] if result else []


class IcebergPartitionManager:
    """Iceberg 分区管理器 - 处理分区裁剪和优化"""

    def __init__(self, registry: IcebergTableRegistry):
        self.registry = registry

    def get_partition_info(self, schema_name: str, table_name: str) -> Dict:
        """获取分区信息"""
        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        query = f"""
SELECT 
    partition_key, 
    partition_value, 
    record_count,
    file_count
FROM "{full_table_name}$partitions"
ORDER BY partition_key
"""
        try:
            result = self.registry.execute_query(query)
            return {
                "table": full_table_name,
                "partitions": result,
                "partition_count": len(result)
            }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}

    def analyze_partition_pruning(self, query: str) -> Dict:
        """分析分区裁剪效果"""
        plan = self.registry.execute_query_with_plan(query)

        result = {
            "original_query": query,
            "partition_pruning_analysis": {}
        }

        if plan:
            result["partition_pruning_analysis"] = self._extract_partition_info(plan)

        return result

    def _extract_partition_info(self, plan: Dict) -> Dict:
        """从执行计划中提取分区信息"""
        info = {
            "partition_count_scanned": 0,
            "partition_count_total": 0,
            "pruning_effective": False,
            "scanned_partitions": []
        }

        def traverse(node):
            if isinstance(node, dict):
                if node.get("id") == "tableScan" or node.get("name") == "TableScan":
                    details = node.get("details", {})
                    info["partition_count_scanned"] = details.get("partitionsScanned", 0)
                    info["partition_count_total"] = details.get("partitionsTotal", 0)
                    info["scanned_partitions"] = details.get("partitions", [])
                    info["pruning_effective"] = (
                        info["partition_count_scanned"] < info["partition_count_total"]
                    )
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return info

    def add_partition(self, schema_name: str, table_name: str,
                      partition_values: Dict[str, Any]) -> Dict:
        """添加分区"""
        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        partition_clause = ", ".join(
            [f"{k} = '{v}'" for k, v in partition_values.items()]
        )
        query = f"ALTER TABLE {full_table_name} ADD PARTITION ({partition_clause})"
        self.registry.execute_query(query, fetch=False)
        return {"status": "partition_added", "partition": partition_clause}

    def drop_partition(self, schema_name: str, table_name: str,
                       partition_values: Dict[str, Any]) -> Dict:
        """删除分区"""
        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        partition_clause = ", ".join(
            [f"{k} = '{v}'" for k, v in partition_values.items()]
        )
        query = f"ALTER TABLE {full_table_name} DROP PARTITION ({partition_clause})"
        self.registry.execute_query(query, fetch=False)
        return {"status": "partition_dropped", "partition": partition_clause}


class DeleteFileCleaner:
    """Delete File 清理器 - 处理 delete files 避免数据重复"""

    def __init__(self, registry: IcebergTableRegistry):
        self.registry = registry

    def clean_table(self, schema_name: str, table_name: str) -> Dict:
        """完整清理表的 delete files"""
        print(f"🔍 检查表 {schema_name}.{table_name} 的 delete files...")

        delete_info = self.registry.get_delete_file_info(schema_name, table_name)
        print(f"  Delete files 信息: {delete_info}")

        if delete_info.get("delete_file_count", 0) > 0 or delete_info.get("delete_files", 0) > 0:
            print(f"📦 发现 delete files，开始清理...")

            print("  1. 重写数据文件 (合并 delete files)...")
            result1 = self.registry.compact_delete_files(schema_name, table_name)
            print(f"     结果: {result1}")

            print("  2. 清理孤立文件...")
            result2 = self.registry.purge_delete_files(schema_name, table_name)
            print(f"     结果: {result2}")

            print("  3. 清理过期快照...")
            result3 = self.registry.expire_snapshots(schema_name, table_name)
            print(f"     结果: {result3}")

            return {
                "status": "cleaned",
                "table": f"{schema_name}.{table_name}",
                "delete_info_before": delete_info
            }
        else:
            print(f"✅ 没有发现 delete files，表数据干净")
            return {
                "status": "clean",
                "table": f"{schema_name}.{table_name}",
                "delete_info": delete_info
            }

    def clean_all_tables(self, schema_name: str = "default") -> List[Dict]:
        """清理所有表的 delete files"""
        tables = self.registry.list_tables(schema_name)
        results = []

        for table_name in tables:
            result = self.clean_table(schema_name, table_name)
            results.append(result)

        return results


class ZOrderOptimizer:
    """Z-Order 排序优化器 - 处理多维度数据聚类"""

    def __init__(self, registry: IcebergTableRegistry):
        self.registry = registry

    def apply_zorder(self, schema_name: str, table_name: str,
                     z_order_columns: List[str]) -> Dict:
        """应用 Z-Order 排序"""
        self.registry.apply_zorder_optimization(schema_name, table_name, z_order_columns)
        self.registry.optimize_table(schema_name, table_name)

        return {
            "status": "zorder_applied",
            "table": f"{schema_name}.{table_name}",
            "z_order_columns": z_order_columns
        }

    def analyze_zorder_effectiveness(self, schema_name: str, table_name: str) -> Dict:
        """分析 Z-Order 效果"""
        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        query = f"SHOW PROPERTIES FROM {full_table_name}"
        try:
            result = self.registry.execute_query(query)
            properties = {}
            for row in result:
                properties[row[0]] = row[1]
            return {
                "table": full_table_name,
                "z_order_configured": "sort_order" in properties,
                "sort_order": properties.get("sort_order", "not configured")
            }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}

    def get_zorder_stats(self, schema_name: str, table_name: str) -> Dict:
        """获取 Z-Order 统计信息"""
        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        query = f"""
SELECT 
    COUNT(*) as file_count,
    SUM(record_count) as total_records,
    AVG(record_count) as avg_records_per_file,
    MIN(record_count) as min_records_per_file,
    MAX(record_count) as max_records_per_file
FROM "{full_table_name}$files"
WHERE content = 0
"""
        try:
            result = self.registry.execute_query(query)
            if result and len(result) > 0:
                return {
                    "table": full_table_name,
                    "file_count": result[0][0],
                    "total_records": result[0][1],
                    "avg_records_per_file": result[0][2],
                    "min_records_per_file": result[0][3],
                    "max_records_per_file": result[0][4]
                }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}
        return {}


def main():
    """主函数 - 演示数据注册流程"""
    registry = IcebergTableRegistry(
        trino_host="localhost",
        trino_port=8080,
        catalog="iceberg",
        username="admin"
    )

    print("=" * 60)
    print("湖仓查询加速层 - 数据注册模块")
    print("修复: 正确处理 delete files，避免数据重复")
    print("=" * 60)

    partition_manager = IcebergPartitionManager(registry)
    zorder_optimizer = ZOrderOptimizer(registry)
    delete_cleaner = DeleteFileCleaner(registry)

    tables_config = [
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
            ],
            partition_spec=[
                PartitionSpec("region", PartitionTransform.IDENTITY),
            ],
            z_order=ZOrderSpec(columns=["customer_id", "region"]),
            file_format=FileFormat.PARQUET,
            write_mode=WriteMode.COPY_ON_WRITE,
        ),
    ]

    for config in tables_config:
        print(f"\n注册表: {config.table_name}")
        result = registry.register_table(config)
        print(f"  状态: {result['status']}")
        print(f"  表名: {result['table']}")
        print(f"  写入模式: {result.get('write_mode', 'N/A')}")

        if config.z_order:
            print(f"  Z-Order 列: {config.z_order.columns}")
            zorder_optimizer.apply_zorder(config.schema_name, config.table_name,
                                          config.z_order.columns)

    print("\n🔍 检查 delete files...")
    for config in tables_config:
        delete_cleaner.clean_table(config.schema_name, config.table_name)

    print("\n" + "=" * 60)
    print("已注册的表:")
    for table in registry.list_tables("ecommerce"):
        print(f"  - {table}")
    print("=" * 60)


if __name__ == "__main__":
    main()
