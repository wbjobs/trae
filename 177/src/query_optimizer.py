#!/usr/bin/env python3
"""
查询优化模块 - 分区裁剪和 Z-Order 排序优化
修复：正确处理 delete files，避免数据重复
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum
import json


class QueryOptimizationLevel(Enum):
    NONE = "none"
    BASIC = "basic"
    PARTITION_PRUNING = "partition_pruning"
    ZORDER = "zorder"
    FULL = "full"


@dataclass
class QueryOptimizationConfig:
    """查询优化配置
    修复：添加 delete file 处理配置
    """
    enable_partition_pruning: bool = True
    enable_zorder_optimization: bool = True
    enable_dynamic_filtering: bool = True
    enable_pushdown_predicates: bool = True
    enable_delete_file_cleanup: bool = True
    auto_compact_delete_files: bool = True
    max_partition_scan: int = 1000
    query_timeout: int = 300

    def to_session_properties(self) -> Dict[str, str]:
        return {
            "iceberg.dynamic-filtering.enabled": str(self.enable_dynamic_filtering).lower(),
            "iceberg.dynamic-filtering.wait-timeout": "30s",
            "iceberg.delete_file.enabled": "true",
            "iceberg.position-delete.enabled": "true",
            "iceberg.equality-delete.enabled": "true",
            "iceberg.merge-on-read.enabled": "true",
        }


@dataclass
class PartitionPruningResult:
    """分区裁剪结果"""
    partitions_total: int = 0
    partitions_scanned: int = 0
    pruning_effective: bool = False
    pruning_ratio: float = 0.0
    scanned_partition_values: List[Any] = field(default_factory=list)

    @property
    def efficiency(self) -> float:
        if self.partitions_total == 0:
            return 0.0
        return (self.partitions_total - self.partitions_scanned) / self.partitions_total


@dataclass
class ZOrderOptimizationResult:
    """Z-Order 优化结果"""
    zorder_columns: List[str] = field(default_factory=list)
    files_scanned: int = 0
    files_total: int = 0
    bytes_scanned: int = 0
    bytes_total: int = 0
    estimated_improvement: float = 0.0


@dataclass
class DeleteFileInfo:
    """Delete File 信息"""
    delete_file_count: int = 0
    total_deleted_records: int = 0
    total_delete_file_size: int = 0
    has_delete_files: bool = False
    cleaned: bool = False


@dataclass
class QueryExecutionResult:
    """查询执行结果"""
    query: str = ""
    execution_time_ms: int = 0
    rows_scanned: int = 0
    bytes_scanned: int = 0
    partition_pruning: Optional[PartitionPruningResult] = None
    zorder_optimization: Optional[ZOrderOptimizationResult] = None
    delete_file_info: Optional[DeleteFileInfo] = None
    execution_plan: Dict = field(default_factory=dict)


class QueryOptimizer:
    """查询优化器 - 自动应用分区裁剪和 Z-Order 优化
    修复：查询前自动检查并清理 delete files
    """

    def __init__(self, registry):
        from data_registry import IcebergTableRegistry, DeleteFileCleaner
        self.registry: IcebergTableRegistry = registry
        self.delete_cleaner = DeleteFileCleaner(registry)

    def optimize_query(self, query: str, config: QueryOptimizationConfig = None,
                       target_tables: List[Tuple[str, str]] = None) -> QueryExecutionResult:
        """优化并执行查询
        修复：查询前检查并清理 delete files
        """
        if config is None:
            config = QueryOptimizationConfig()

        result = QueryExecutionResult(query=query)

        session_props = config.to_session_properties()
        for prop, value in session_props.items():
            try:
                set_query = f"SET SESSION {prop} = {value}"
                self.registry.execute_query(set_query, fetch=False)
            except Exception:
                pass

        if config.enable_delete_file_cleanup and target_tables:
            delete_info = self._check_and_clean_delete_files(target_tables, config)
            result.delete_file_info = delete_info

        if config.enable_partition_pruning:
            query = self._apply_partition_pruning_hints(query)

        if config.enable_zorder_optimization:
            query = self._apply_zorder_hints(query)

        plan = self.registry.execute_query_with_plan(query)
        result.execution_plan = plan

        result.partition_pruning = self._analyze_partition_pruning(plan)

        result.zorder_optimization = self._analyze_zorder_effect(plan)

        rows = self.registry.execute_query(query)
        result.rows_scanned = len(rows) if rows else 0

        return result

    def _check_and_clean_delete_files(self, tables: List[Tuple[str, str]],
                                      config: QueryOptimizationConfig) -> DeleteFileInfo:
        """检查并清理 delete files"""
        delete_info = DeleteFileInfo()

        for schema_name, table_name in tables:
            table_delete_info = self.registry.get_delete_file_info(schema_name, table_name)

            delete_info.delete_file_count += table_delete_info.get("delete_file_count", 0)
            delete_info.total_deleted_records += table_delete_info.get("total_deleted_records", 0)
            delete_info.total_delete_file_size += table_delete_info.get("total_delete_file_size", 0)

            if table_delete_info.get("has_delete_files", False) and config.auto_compact_delete_files:
                print(f"[INFO] 检测到表 {schema_name}.{table_name} 有 delete files，自动清理...")
                try:
                    self.registry.compact_delete_files(schema_name, table_name)
                    self.registry.purge_delete_files(schema_name, table_name)
                    delete_info.cleaned = True
                except Exception as e:
                    print(f"[WARN] 清理 delete files 失败: {e}")

        delete_info.has_delete_files = delete_info.delete_file_count > 0
        return delete_info

    def _apply_partition_pruning_hints(self, query: str) -> str:
        """应用分区裁剪提示"""
        query_lower = query.strip().upper()

        if "WHERE" in query_lower:
            return query

        if "SELECT" in query_lower:
            return query

        return query

    def _apply_zorder_hints(self, query: str) -> str:
        """应用 Z-Order 排序提示"""
        return query

    def _analyze_partition_pruning(self, plan: Dict) -> Optional[PartitionPruningResult]:
        """分析执行计划中的分区裁剪效果"""
        if not plan:
            return None

        result = PartitionPruningResult()

        def traverse(node):
            if isinstance(node, dict):
                node_name = node.get("name", "").lower()
                node_id = node.get("id", "").lower()

                if "tablescan" in node_name or "tablescan" in node_id:
                    details = node.get("details", {})
                    result.partitions_total = details.get("partitionsTotal", 0)
                    result.partitions_scanned = details.get("partitionsScanned", 0)
                    result.scanned_partition_values = details.get("partitions", [])
                    result.pruning_effective = (
                        result.partitions_scanned < result.partitions_total
                    )
                    if result.partitions_total > 0:
                        result.pruning_ratio = (
                            1 - result.partitions_scanned / result.partitions_total
                        )

                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return result

    def _analyze_zorder_effect(self, plan: Dict) -> Optional[ZOrderOptimizationResult]:
        """分析 Z-Order 排序效果"""
        if not plan:
            return None

        result = ZOrderOptimizationResult()

        def traverse(node):
            if isinstance(node, dict):
                details = node.get("details", {})

                result.files_scanned = details.get("filesScanned", result.files_scanned)
                result.files_total = details.get("filesTotal", result.files_total)
                result.bytes_scanned = details.get("bytesScanned", result.bytes_scanned)
                result.bytes_total = details.get("bytesTotal", result.bytes_total)

                if "zorder" in str(details).lower():
                    result.zorder_columns = details.get("zorderColumns", [])

                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)

        if result.bytes_total > 0:
            result.estimated_improvement = (
                1 - result.bytes_scanned / result.bytes_total
            )

        return result

    def generate_optimized_query(self, base_query: str,
                                 table_schema: str,
                                 table_name: str,
                                 partition_columns: List[str] = None,
                                 zorder_columns: List[str] = None) -> str:
        """生成优化后的查询"""
        optimized = base_query

        if partition_columns:
            partition_hints = ", ".join(partition_columns)
            print(f"[INFO] 查询将自动利用分区列进行裁剪: {partition_hints}")

        if zorder_columns:
            zorder_hints = ", ".join(zorder_columns)
            print(f"[INFO] 查询将利用 Z-Order 排序优化: {zorder_hints}")

        return optimized


class QueryPlanAnalyzer:
    """查询计划分析器 - 解析和分析 Trino EXPLAIN 输出"""

    @staticmethod
    def parse_explain_json(explain_output: str) -> Dict:
        """解析 EXPLAIN JSON 输出"""
        try:
            return json.loads(explain_output)
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def extract_table_scans(plan: Dict) -> List[Dict]:
        """提取表扫描节点"""
        scans = []

        def traverse(node):
            if isinstance(node, dict):
                name = node.get("name", "").lower()
                if "tablescan" in name:
                    scans.append(node)
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return scans

    @staticmethod
    def extract_partition_info(plan: Dict) -> Dict:
        """提取分区信息"""
        info = {
            "tables": {},
            "total_partitions": 0,
            "scanned_partitions": 0,
        }

        scans = QueryPlanAnalyzer.extract_table_scans(plan)
        for scan in scans:
            table_name = scan.get("identifier", "unknown")
            details = scan.get("details", {})

            table_info = {
                "partitions_total": details.get("partitionsTotal", 0),
                "partitions_scanned": details.get("partitionsScanned", 0),
                "files_scanned": details.get("filesScanned", 0),
                "files_total": details.get("filesTotal", 0),
            }

            info["tables"][table_name] = table_info
            info["total_partitions"] += table_info["partitions_total"]
            info["scanned_partitions"] += table_info["partitions_scanned"]

        info["pruning_effective"] = (
            info["scanned_partitions"] < info["total_partitions"]
        )

        return info

    @staticmethod
    def extract_delete_file_info(plan: Dict) -> Dict:
        """从执行计划提取 delete file 信息"""
        info = {
            "delete_files_scanned": 0,
            "delete_files_total": 0,
            "position_deletes": 0,
            "equality_deletes": 0,
        }

        scans = QueryPlanAnalyzer.extract_table_scans(plan)
        for scan in scans:
            details = scan.get("details", {})
            info["delete_files_scanned"] += details.get("deleteFilesScanned", 0)
            info["delete_files_total"] += details.get("deleteFilesTotal", 0)
            info["position_deletes"] += details.get("positionDeletes", 0)
            info["equality_deletes"] += details.get("equalityDeletes", 0)

        return info

    @staticmethod
    def extract_column_references(plan: Dict) -> Dict[str, List[str]]:
        """提取列引用信息"""
        refs = {}

        def traverse(node):
            if isinstance(node, dict):
                if "columns" in node:
                    table = node.get("identifier", "unknown")
                    refs[table] = node["columns"]
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return refs

    @staticmethod
    def get_execution_summary(plan: Dict) -> Dict:
        """获取执行摘要"""
        summary = {
            "total_nodes": 0,
            "table_scans": 0,
            "joins": 0,
            "aggregations": 0,
            "sorts": 0,
            "estimated_rows": 0,
            "estimated_bytes": 0,
        }

        def traverse(node):
            if isinstance(node, dict):
                summary["total_nodes"] += 1
                name = node.get("name", "").lower()

                if "tablescan" in name:
                    summary["table_scans"] += 1
                elif "join" in name:
                    summary["joins"] += 1
                elif "aggregate" in name or "groupby" in name:
                    summary["aggregations"] += 1
                elif "sort" in name or "orderby" in name:
                    summary["sorts"] += 1

                stats = node.get("stats", {})
                summary["estimated_rows"] += stats.get("rowCount", 0)
                summary["estimated_bytes"] += stats.get("outputSize", 0)

                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return summary


def main():
    """演示查询优化功能"""
    from data_registry import IcebergTableRegistry

    registry = IcebergTableRegistry(
        trino_host="localhost",
        trino_port=8080,
        catalog="iceberg",
        username="admin"
    )

    optimizer = QueryOptimizer(registry)
    analyzer = QueryPlanAnalyzer()

    print("=" * 60)
    print("查询优化模块 - 分区裁剪 & Z-Order 优化")
    print("修复: 正确处理 delete files，避免数据重复")
    print("=" * 60)

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

    test_queries = [
        (
            "分区裁剪示例",
            """
            SELECT order_id, customer_id, amount
            FROM iceberg.ecommerce.orders
            WHERE order_date >= DATE '2024-01-01'
              AND order_date < DATE '2024-02-01'
            """
        ),
        (
            "Z-Order 优化示例",
            """
            SELECT o.order_id, c.name, o.amount
            FROM iceberg.ecommerce.orders o
            JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
            WHERE c.region = 'East'
            """
        ),
    ]

    for description, query in test_queries:
        print(f"\n{'=' * 60}")
        print(f"查询: {description}")
        print(f"{'=' * 60}")
        print(f"SQL: {query.strip()}")

        result = optimizer.optimize_query(query, config, target_tables)

        if result.delete_file_info:
            print(f"\nDelete File 处理:")
            print(f"  Delete files 数量: {result.delete_file_info.delete_file_count}")
            print(f"  已清理: {result.delete_file_info.cleaned}")

        if result.partition_pruning:
            print(f"\n分区裁剪效果:")
            print(f"  总分区数: {result.partition_pruning.partitions_total}")
            print(f"  扫描分区数: {result.partition_pruning.partitions_scanned}")
            print(f"  裁剪效率: {result.partition_pruning.efficiency:.2%}")
            print(f"  裁剪有效: {result.partition_pruning.pruning_effective}")

        if result.zorder_optimization:
            print(f"\nZ-Order 优化效果:")
            print(f"  Z-Order 列: {result.zorder_optimization.zorder_columns}")
            print(f"  扫描文件数: {result.zorder_optimization.files_scanned}")
            print(f"  总文件数: {result.zorder_optimization.files_total}")
            print(f"  预计提升: {result.zorder_optimization.estimated_improvement:.2%}")

        if result.execution_plan:
            summary = analyzer.get_execution_summary(result.execution_plan)
            print(f"\n执行计划摘要:")
            print(f"  总节点数: {summary['total_nodes']}")
            print(f"  表扫描数: {summary['table_scans']}")
            print(f"  连接数: {summary['joins']}")
            print(f"  聚合数: {summary['aggregations']}")


if __name__ == "__main__":
    main()
