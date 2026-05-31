#!/usr/bin/env python3
"""
隐藏列快速去重模块 - 利用 _hoodie_record_key 进行高效去重
支持增量去重和批量去重
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set, Tuple
from enum import Enum
from collections import defaultdict


class DeduplicationMode(Enum):
    """去重模式"""
    FULL = "full"
    INCREMENTAL = "incremental"
    WINDOW = "window"
    MERGE = "merge"


class DeduplicationStrategy(Enum):
    """去重策略"""
    KEEP_LATEST = "keep_latest"
    KEEP_EARLIEST = "keep_earliest"
    KEEP_FIRST = "keep_first"
    KEEP_LAST = "keep_last"
    AGGREGATE = "aggregate"


@dataclass
class DeduplicationConfig:
    """去重配置"""
    hidden_key_column: str = "_hoodie_record_key"
    timestamp_column: Optional[str] = "_hoodie_commit_time"
    order_column: Optional[str] = None
    mode: DeduplicationMode = DeduplicationMode.FULL
    strategy: DeduplicationStrategy = DeduplicationStrategy.KEEP_LATEST
    batch_size: int = 10000
    enable_index: bool = True
    enable_partition_aware: bool = True


@dataclass
class DeduplicationResult:
    """去重结果"""
    table_name: str
    total_rows_before: int
    total_rows_after: int
    duplicates_removed: int
    execution_time_ms: float
    mode: DeduplicationMode
    strategy: DeduplicationStrategy
    scanned_partitions: int
    details: Dict[str, Any] = field(default_factory=dict)

    @property
    def deduplication_rate(self) -> float:
        if self.total_rows_before == 0:
            return 0.0
        return self.duplicates_removed / self.total_rows_before


class HiddenColumnDeduplicator:
    """隐藏列去重器 - 利用 _hoodie_record_key 进行高效去重"""

    HIDDEN_KEY_COLUMN = "_hoodie_record_key"
    HIDDEN_COMMIT_TIME = "_hoodie_commit_time"
    HIDDEN_SEQ = "_hoodie_commit_seqno"

    def __init__(self, registry):
        from data_registry import IcebergTableRegistry
        self.registry: IcebergTableRegistry = registry

    def detect_duplicates(self, schema_name: str, table_name: str,
                          config: DeduplicationConfig = None) -> Dict:
        """检测重复数据"""
        if config is None:
            config = DeduplicationConfig()

        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        key_col = config.hidden_key_column

        query = f"""
SELECT 
    {key_col},
    COUNT(*) as duplicate_count
FROM {full_table_name}
WHERE {key_col} IS NOT NULL
GROUP BY {key_col}
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 100
"""

        try:
            result = self.registry.execute_query(query)
            return {
                "table": full_table_name,
                "duplicates_found": len(result) if result else 0,
                "duplicate_keys": [
                    {"key": row[0], "count": row[1]}
                    for row in (result or [])
                ]
            }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}

    def deduplicate_table(self, schema_name: str, table_name: str,
                          config: DeduplicationConfig = None) -> DeduplicationResult:
        """执行表去重"""
        if config is None:
            config = DeduplicationConfig()

        import time
        start_time = time.time()

        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        key_col = config.hidden_key_column

        count_before = self._get_row_count(full_table_name)

        if config.mode == DeduplicationMode.FULL:
            self._deduplicate_full(full_table_name, key_col, config)
        elif config.mode == DeduplicationMode.INCREMENTAL:
            self._deduplicate_incremental(full_table_name, key_col, config)
        elif config.mode == DeduplicationMode.WINDOW:
            self._deduplicate_window(full_table_name, key_col, config)
        elif config.mode == DeduplicationMode.MERGE:
            self._deduplicate_merge(full_table_name, key_col, config)

        count_after = self._get_row_count(full_table_name)

        execution_time = (time.time() - start_time) * 1000

        return DeduplicationResult(
            table_name=full_table_name,
            total_rows_before=count_before,
            total_rows_after=count_after,
            duplicates_removed=count_before - count_after,
            execution_time_ms=execution_time,
            mode=config.mode,
            strategy=config.strategy,
            scanned_partitions=0,
            details={
                "key_column": key_col,
                "timestamp_column": config.timestamp_column,
            }
        )

    def _get_row_count(self, table_name: str) -> int:
        """获取表行数"""
        query = f"SELECT COUNT(*) FROM {table_name}"
        try:
            result = self.registry.execute_query(query)
            return result[0][0] if result else 0
        except Exception:
            return 0

    def _deduplicate_full(self, table_name: str, key_col: str,
                          config: DeduplicationConfig):
        """全量去重"""
        order_col = self._get_order_column(table_name, config)
        row_num_expr = self._get_row_number_expr(key_col, order_col, config.strategy)

        temp_table = f"{table_name}_dedup_temp"

        create_temp_sql = f"""
CREATE TABLE {temp_table} AS
SELECT * FROM (
    SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY {key_col} ORDER BY {row_num_expr}) as _row_num
    FROM {table_name}
    WHERE {key_col} IS NOT NULL
) WHERE _row_num = 1
"""

        try:
            self.registry.execute_query(create_temp_sql, fetch=False)
        except Exception:
            pass

        self._replace_table(table_name, temp_table)

    def _deduplicate_incremental(self, table_name: str, key_col: str,
                                  config: DeduplicationConfig):
        """增量去重 - 只处理新数据"""
        if config.timestamp_column:
            query = f"""
DELETE FROM {table_name} t
WHERE {config.timestamp_column} > (
    SELECT MAX({config.timestamp_column})
    FROM {table_name}
    WHERE {key_col} = t.{key_col}
)
AND EXISTS (
    SELECT 1 FROM {table_name} t2
    WHERE t2.{key_col} = t.{key_col}
    AND t2.{config.timestamp_column} > t.{config.timestamp_column}
)
"""
            try:
                self.registry.execute_query(query, fetch=False)
            except Exception:
                pass

    def _deduplicate_window(self, table_name: str, key_col: str,
                             config: DeduplicationConfig):
        """窗口去重"""
        order_col = self._get_order_column(table_name, config)

        query = f"""
DELETE FROM {table_name}
WHERE {key_col} IN (
    SELECT {key_col}
    FROM (
        SELECT 
            {key_col},
            ROW_NUMBER() OVER (PARTITION BY {key_col} ORDER BY {order_col} DESC) as _rn
        FROM {table_name}
        WHERE {key_col} IS NOT NULL
    )
    WHERE _rn > 1
)
"""

        try:
            self.registry.execute_query(query, fetch=False)
        except Exception:
            pass

    def _deduplicate_merge(self, table_name: str, key_col: str,
                            config: DeduplicationConfig):
        """MERGE 去重"""
        order_col = self._get_order_column(table_name, config)

        merge_query = f"""
MERGE INTO {table_name} t
USING (
    SELECT 
        {key_col},
        MAX({order_col}) as max_order
    FROM {table_name}
    WHERE {key_col} IS NOT NULL
    GROUP BY {key_col}
    HAVING COUNT(*) > 1
) d ON t.{key_col} = d.{key_col} AND t.{order_col} < d.max_order
WHEN MATCHED THEN DELETE
"""

        try:
            self.registry.execute_query(merge_query, fetch=False)
        except Exception:
            pass

    def _replace_table(self, original_table: str, temp_table: str):
        """用临时表替换原表"""
        drop_sql = f"DROP TABLE IF EXISTS {original_table}"
        rename_sql = f"ALTER TABLE {temp_table} RENAME TO {original_table.split('.')[-1]}"

        try:
            self.registry.execute_query(drop_sql, fetch=False)
            self.registry.execute_query(rename_sql, fetch=False)
        except Exception:
            pass

    def _get_order_column(self, table_name: str, config: DeduplicationConfig) -> str:
        """获取排序列"""
        if config.order_column:
            return config.order_column
        if config.timestamp_column:
            return config.timestamp_column
        return self.HIDDEN_COMMIT_TIME

    def _get_row_number_expr(self, key_col: str, order_col: str,
                              strategy: DeduplicationStrategy) -> str:
        """获取行号表达式"""
        if strategy == DeduplicationStrategy.KEEP_LATEST:
            return f"{order_col} DESC"
        elif strategy == DeduplicationStrategy.KEEP_EARLIEST:
            return f"{order_col} ASC"
        elif strategy == DeduplicationStrategy.KEEP_FIRST:
            return f"{order_col} ASC"
        else:
            return f"{order_col} DESC"

    def query_unique_records(self, schema_name: str, table_name: str,
                             columns: List[str] = None,
                             config: DeduplicationConfig = None,
                             limit: int = 100) -> List[Dict]:
        """查询去重后的记录"""
        if config is None:
            config = DeduplicationConfig()

        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        key_col = config.hidden_key_column
        order_col = config.order_column or config.timestamp_column or self.HIDDEN_COMMIT_TIME

        col_expr = ", ".join(columns) if columns else "*"

        query = f"""
SELECT {col_expr}
FROM (
    SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY {key_col} ORDER BY {order_col} DESC) as _rn
    FROM {full_table_name}
    WHERE {key_col} IS NOT NULL
)
WHERE _rn = 1
LIMIT {limit}
"""

        try:
            result = self.registry.execute_query(query)
            return [dict(zip(columns or [f"col_{i}" for i in range(len(result[0]))], row))
                    for row in (result or [])]
        except Exception as e:
            return []

    def get_duplicate_statistics(self, schema_name: str, table_name: str,
                                  config: DeduplicationConfig = None) -> Dict:
        """获取重复数据统计"""
        if config is None:
            config = DeduplicationConfig()

        full_table_name = f"{self.registry.catalog}.{schema_name}.{table_name}"
        key_col = config.hidden_key_column

        stats_query = f"""
SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT {key_col}) as unique_keys,
    COUNT(*) - COUNT(DISTINCT {key_col}) as duplicate_rows,
    (COUNT(*) - COUNT(DISTINCT {key_col})) * 100.0 / COUNT(*) as duplicate_percentage
FROM {full_table_name}
WHERE {key_col} IS NOT NULL
"""

        try:
            result = self.registry.execute_query(stats_query)
            if result and len(result) > 0:
                return {
                    "table": full_table_name,
                    "total_rows": result[0][0],
                    "unique_keys": result[0][1],
                    "duplicate_rows": result[0][2],
                    "duplicate_percentage": result[0][3],
                    "has_duplicates": result[0][2] > 0
                }
        except Exception as e:
            return {"table": full_table_name, "error": str(e)}

        return {}

    def batch_deduplicate(self, tables: List[Tuple[str, str]],
                           config: DeduplicationConfig = None) -> List[DeduplicationResult]:
        """批量去重多个表"""
        if config is None:
            config = DeduplicationConfig()

        results = []
        for schema_name, table_name in tables:
            result = self.deduplicate_table(schema_name, table_name, config)
            results.append(result)

        return results

    def generate_deduplication_report(self, results: List[DeduplicationResult]) -> str:
        """生成去重报告"""
        report_lines = []
        report_lines.append("=" * 70)
        report_lines.append("隐藏列去重报告")
        report_lines.append("=" * 70)

        total_duplicates = 0
        total_rows_before = 0
        total_rows_after = 0

        for result in results:
            report_lines.append(f"\n📄 表: {result.table_name}")
            report_lines.append(f"   模式: {result.mode.value}")
            report_lines.append(f"   策略: {result.strategy.value}")
            report_lines.append(f"   去重前行数: {result.total_rows_before:,}")
            report_lines.append(f"   去重后行数: {result.total_rows_after:,}")
            report_lines.append(f"   移除重复数: {result.duplicates_removed:,}")
            report_lines.append(f"   去重率: {result.deduplication_rate:.2%}")
            report_lines.append(f"   执行时间: {result.execution_time_ms:.0f}ms")

            total_duplicates += result.duplicates_removed
            total_rows_before += result.total_rows_before
            total_rows_after += result.total_rows_after

        report_lines.append(f"\n{'=' * 70}")
        report_lines.append("📊 总体统计")
        report_lines.append(f"{'=' * 70}")
        report_lines.append(f"   处理表数: {len(results)}")
        report_lines.append(f"   总行数(去重前): {total_rows_before:,}")
        report_lines.append(f"   总行数(去重后): {total_rows_after:,}")
        report_lines.append(f"   总移除重复数: {total_duplicates:,}")

        if total_rows_before > 0:
            report_lines.append(f"   总体去重率: {total_duplicates / total_rows_before:.2%}")

        report_lines.append("=" * 70)

        return "\n".join(report_lines)


def main():
    """演示隐藏列去重功能"""
    from data_registry import IcebergTableRegistry

    registry = IcebergTableRegistry(
        trino_host="localhost",
        trino_port=8080,
        catalog="iceberg",
        username="admin"
    )

    deduplicator = HiddenColumnDeduplicator(registry)

    print("=" * 70)
    print("隐藏列快速去重模块 - _hoodie_record_key 去重")
    print("=" * 70)

    config = DeduplicationConfig(
        hidden_key_column="_hoodie_record_key",
        timestamp_column="_hoodie_commit_time",
        mode=DeduplicationMode.FULL,
        strategy=DeduplicationStrategy.KEEP_LATEST,
    )

    tables_to_deduplicate = [
        ("ecommerce", "orders"),
        ("ecommerce", "customers"),
    ]

    print("\n🔍 检测重复数据...")
    for schema_name, table_name in tables_to_deduplicate:
        stats = deduplicator.get_duplicate_statistics(schema_name, table_name, config)
        print(f"\n📊 表 {schema_name}.{table_name}:")
        if "error" in stats:
            print(f"   错误: {stats['error']}")
        else:
            print(f"   总行数: {stats.get('total_rows', 'N/A')}")
            print(f"   唯一键数: {stats.get('unique_keys', 'N/A')}")
            print(f"   重复行数: {stats.get('duplicate_rows', 'N/A')}")
            print(f"   重复率: {stats.get('duplicate_percentage', 'N/A')}%")

    print("\n⚙️  执行去重...")
    results = deduplicator.batch_deduplicate(tables_to_deduplicate, config)

    report = deduplicator.generate_deduplication_report(results)
    print("\n" + report)

    print("\n📋 查询去重后的记录...")
    unique_records = deduplicator.query_unique_records(
        "ecommerce", "orders",
        columns=["order_id", "customer_id", "amount", "_hoodie_record_key"],
        config=config,
        limit=10
    )
    print(f"\n   去重后的记录数: {len(unique_records)}")
    for i, record in enumerate(unique_records[:5]):
        print(f"   {i+1}. {record}")


if __name__ == "__main__":
    main()
