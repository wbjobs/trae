#!/usr/bin/env python3
"""
物化视图管理模块
功能：
1. 物化视图定义和管理
2. 分区变更检测
3. 自动增量刷新
4. 数据保留策略（最近 N 天）
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set, Tuple
from enum import Enum
from datetime import datetime, timedelta
import json


class MaterializedViewStatus(Enum):
    """物化视图状态"""
    ACTIVE = "active"
    REFRESHING = "refreshing"
    STALE = "stale"
    ERROR = "error"


class RefreshMode(Enum):
    """刷新模式"""
    FULL = "full"
    INCREMENTAL = "incremental"
    AUTO = "auto"


@dataclass
class MaterializedViewDefinition:
    """物化视图定义"""
    view_name: str
    schema_name: str
    base_table: str
    base_schema: str
    query: str
    partition_column: str = "order_date"
    refresh_mode: RefreshMode = RefreshMode.AUTO
    retention_days: int = 7
    properties: Dict[str, str] = field(default_factory=dict)

    def full_view_name(self, catalog: str) -> str:
        return f"{catalog}.{self.schema_name}.{self.view_name}"

    def full_base_table(self, catalog: str) -> str:
        return f"{catalog}.{self.base_schema}.{self.base_table}"


@dataclass
class RefreshResult:
    """刷新结果"""
    view_name: str
    status: str
    mode: RefreshMode
    rows_added: int = 0
    rows_removed: int = 0
    execution_time_ms: float = 0
    partitions_refreshed: List[str] = field(default_factory=list)
    error_message: Optional[str] = None

    @property
    def success(self) -> bool:
        return self.status == "success"


@dataclass
class PartitionChangeInfo:
    """分区变更信息"""
    table_name: str
    new_partitions: List[str] = field(default_factory=list)
    removed_partitions: List[str] = field(default_factory=list)
    changed_partitions: List[str] = field(default_factory=list)
    last_check_time: Optional[datetime] = None
    needs_refresh: bool = False


class MaterializedViewManager:
    """物化视图管理器"""

    METADATA_TABLE = "_mv_metadata"

    def __init__(self, registry):
        from data_registry import IcebergTableRegistry
        self.registry: IcebergTableRegistry = registry
        self._views: Dict[str, MaterializedViewDefinition] = {}
        self._last_partitions: Dict[str, Set[str]] = {}
        self._ensure_metadata_table()

    def _ensure_metadata_table(self):
        """确保元数据表存在"""
        catalog = self.registry.catalog
        schema = "default"

        create_sql = f"""
CREATE TABLE IF NOT EXISTS {catalog}.{schema}.{self.METADATA_TABLE} (
    view_name VARCHAR,
    schema_name VARCHAR,
    base_table VARCHAR,
    base_schema VARCHAR,
    query VARCHAR,
    partition_column VARCHAR,
    refresh_mode VARCHAR,
    retention_days INTEGER,
    last_refresh_time VARCHAR,
    last_partition VARCHAR,
    properties VARCHAR
)
WITH (
    format = 'PARQUET'
)
"""
        try:
            self.registry.execute_query(create_sql, fetch=False)
        except Exception:
            pass

    def create_materialized_view(self, definition: MaterializedViewDefinition,
                                 if_not_exists: bool = True) -> Dict:
        """创建物化视图"""
        catalog = self.registry.catalog
        full_view_name = definition.full_view_name(catalog)
        full_base_table = definition.full_base_table(catalog)

        if if_not_exists:
            check_sql = f"""
SELECT COUNT(*) 
FROM {catalog}.information_schema.tables 
WHERE table_schema = '{definition.schema_name}' 
AND table_name = '{definition.view_name}'
"""
            try:
                result = self.registry.execute_query(check_sql)
                if result and result[0][0] > 0:
                    return {
                        "status": "exists",
                        "view": full_view_name,
                        "message": "View already exists"
                    }
            except Exception:
                pass

        create_sql = f"""
CREATE TABLE {full_view_name}
WITH (
    format = 'PARQUET',
    partitioning = ARRAY['{definition.partition_column}']
)
AS
{definition.query}
"""

        try:
            self.registry.execute_query(create_sql, fetch=False)
            self._views[definition.view_name] = definition
            self._save_view_metadata(definition)

            return {
                "status": "created",
                "view": full_view_name,
                "base_table": full_base_table
            }
        except Exception as e:
            return {
                "status": "error",
                "view": full_view_name,
                "error": str(e)
            }

    def drop_materialized_view(self, schema_name: str, view_name: str) -> Dict:
        """删除物化视图"""
        catalog = self.registry.catalog
        full_view_name = f"{catalog}.{schema_name}.{view_name}"

        drop_sql = f"DROP TABLE IF EXISTS {full_view_name}"
        try:
            self.registry.execute_query(drop_sql, fetch=False)
            self._views.pop(view_name, None)
            self._delete_view_metadata(schema_name, view_name)

            return {
                "status": "dropped",
                "view": full_view_name
            }
        except Exception as e:
            return {
                "status": "error",
                "view": full_view_name,
                "error": str(e)
            }

    def refresh_materialized_view(self, schema_name: str, view_name: str,
                                   mode: RefreshMode = RefreshMode.AUTO) -> RefreshResult:
        """刷新物化视图"""
        import time
        start_time = time.time()

        catalog = self.registry.catalog
        full_view_name = f"{catalog}.{schema_name}.{view_name}"

        definition = self._views.get(view_name)
        if not definition:
            definition = self._load_view_metadata(schema_name, view_name)
        if not definition:
            return RefreshResult(
                view_name=view_name,
                status="error",
                mode=mode,
                error_message="View definition not found"
            )

        if mode == RefreshMode.AUTO:
            mode = self._detect_refresh_mode(definition)

        if mode == RefreshMode.INCREMENTAL:
            result = self._refresh_incremental(definition)
        else:
            result = self._refresh_full(definition)

        result.execution_time_ms = (time.time() - start_time) * 1000

        self._update_refresh_metadata(definition, result)

        return result

    def _detect_refresh_mode(self, definition: MaterializedViewDefinition) -> RefreshMode:
        """自动检测刷新模式"""
        change_info = self.detect_partition_changes(definition)

        if change_info.needs_refresh and len(change_info.new_partitions) > 0:
            if len(change_info.new_partitions) <= 10:
                return RefreshMode.INCREMENTAL
        return RefreshMode.FULL

    def _refresh_full(self, definition: MaterializedViewDefinition) -> RefreshResult:
        """全量刷新"""
        catalog = self.registry.catalog
        full_view_name = definition.full_view_name(catalog)

        try:
            delete_sql = f"DELETE FROM {full_view_name}"
            self.registry.execute_query(delete_sql, fetch=False)

            insert_sql = f"""
INSERT INTO {full_view_name}
{definition.query}
"""
            cursor = self.registry.execute_query(insert_sql, fetch=False)

            return RefreshResult(
                view_name=definition.view_name,
                status="success",
                mode=RefreshMode.FULL,
                rows_added=0
            )
        except Exception as e:
            return RefreshResult(
                view_name=definition.view_name,
                status="error",
                mode=RefreshMode.FULL,
                error_message=str(e)
            )

    def _refresh_incremental(self, definition: MaterializedViewDefinition) -> RefreshResult:
        """增量刷新"""
        catalog = self.registry.catalog
        full_view_name = definition.full_view_name(catalog)
        full_base_table = definition.full_base_table(catalog)

        change_info = self.detect_partition_changes(definition)
        partitions_refreshed = []

        for partition_value in change_info.new_partitions:
            try:
                delete_sql = f"""
DELETE FROM {full_view_name}
WHERE {definition.partition_column} = '{partition_value}'
"""
                self.registry.execute_query(delete_sql, fetch=False)

                insert_sql = f"""
INSERT INTO {full_view_name}
{definition.query}
AND {definition.partition_column} = '{partition_value}'
"""
                self.registry.execute_query(insert_sql, fetch=False)

                partitions_refreshed.append(partition_value)
            except Exception:
                continue

        return RefreshResult(
            view_name=definition.view_name,
            status="success",
            mode=RefreshMode.INCREMENTAL,
            partitions_refreshed=partitions_refreshed
        )

    def detect_partition_changes(self, definition: MaterializedViewDefinition) -> PartitionChangeInfo:
        """检测分区变更"""
        catalog = self.registry.catalog
        full_base_table = definition.full_base_table(catalog)

        try:
            current_partitions = self._get_current_partitions(full_base_table, definition.partition_column)
            last_partitions = self._last_partitions.get(definition.view_name, set())

            new_partitions = list(current_partitions - last_partitions)
            removed_partitions = list(last_partitions - current_partitions)

            self._last_partitions[definition.view_name] = current_partitions

            return PartitionChangeInfo(
                table_name=full_base_table,
                new_partitions=new_partitions,
                removed_partitions=removed_partitions,
                changed_partitions=new_partitions + removed_partitions,
                last_check_time=datetime.now(),
                needs_refresh=len(new_partitions) > 0 or len(removed_partitions) > 0
            )
        except Exception as e:
            return PartitionChangeInfo(
                table_name=full_base_table,
                last_check_time=datetime.now(),
                needs_refresh=True
            )

    def _get_current_partitions(self, table_name: str, partition_column: str) -> Set[str]:
        """获取当前分区列表"""
        query = f"""
SELECT DISTINCT {partition_column}
FROM {table_name}
WHERE {partition_column} IS NOT NULL
ORDER BY {partition_column}
"""
        try:
            result = self.registry.execute_query(query)
            return set(str(row[0]) for row in (result or []))
        except Exception:
            return set()

    def apply_retention_policy(self, definition: MaterializedViewDefinition) -> Dict:
        """应用数据保留策略（删除超过保留期的数据）"""
        catalog = self.registry.catalog
        full_view_name = definition.full_view_name(catalog)

        cutoff_date = (datetime.now() - timedelta(days=definition.retention_days)).strftime("%Y-%m-%d")

        delete_sql = f"""
DELETE FROM {full_view_name}
WHERE {definition.partition_column} < DATE '{cutoff_date}'
"""
        try:
            self.registry.execute_query(delete_sql, fetch=False)
            return {
                "status": "success",
                "view": full_view_name,
                "retention_days": definition.retention_days,
                "cutoff_date": cutoff_date
            }
        except Exception as e:
            return {
                "status": "error",
                "view": full_view_name,
                "error": str(e)
            }

    def auto_refresh_if_needed(self, schema_name: str, view_name: str) -> Optional[RefreshResult]:
        """如果需要则自动刷新"""
        definition = self._views.get(view_name)
        if not definition:
            definition = self._load_view_metadata(schema_name, view_name)
        if not definition:
            return None

        change_info = self.detect_partition_changes(definition)

        if change_info.needs_refresh:
            print(f"[INFO] 检测到分区变更，自动刷新 {view_name}...")
            result = self.refresh_materialized_view(schema_name, view_name, RefreshMode.AUTO)

            print(f"[INFO] 应用保留策略（保留 {definition.retention_days} 天）...")
            self.apply_retention_policy(definition)

            return result

        return None

    def list_materialized_views(self, schema_name: str = "default") -> List[Dict]:
        """列出所有物化视图"""
        catalog = self.registry.catalog
        query = f"""
SELECT view_name, schema_name, base_table, base_schema, 
       refresh_mode, retention_days, last_refresh_time
FROM {catalog}.default.{self.METADATA_TABLE}
WHERE schema_name = '{schema_name}'
ORDER BY view_name
"""
        try:
            result = self.registry.execute_query(query)
            return [
                {
                    "view_name": row[0],
                    "schema_name": row[1],
                    "base_table": row[2],
                    "base_schema": row[3],
                    "refresh_mode": row[4],
                    "retention_days": row[5],
                    "last_refresh_time": row[6]
                }
                for row in (result or [])
            ]
        except Exception:
            return []

    def get_view_status(self, schema_name: str, view_name: str) -> Dict:
        """获取视图状态"""
        catalog = self.registry.catalog
        full_view_name = f"{catalog}.{schema_name}.{view_name}"

        status = {
            "view_name": view_name,
            "exists": False,
            "row_count": 0,
            "partition_count": 0,
            "last_refresh_time": None
        }

        try:
            count_query = f"SELECT COUNT(*) FROM {full_view_name}"
            result = self.registry.execute_query(count_query)
            if result:
                status["row_count"] = result[0][0]
                status["exists"] = True
        except Exception:
            pass

        definition = self._views.get(view_name) or self._load_view_metadata(schema_name, view_name)
        if definition and status["exists"]:
            try:
                partition_query = f"""
SELECT COUNT(DISTINCT {definition.partition_column})
FROM {full_view_name}
"""
                result = self.registry.execute_query(partition_query)
                if result:
                    status["partition_count"] = result[0][0]
            except Exception:
                pass

        return status

    def _save_view_metadata(self, definition: MaterializedViewDefinition):
        """保存视图元数据"""
        catalog = self.registry.catalog
        table = f"{catalog}.default.{self.METADATA_TABLE}"

        delete_sql = f"""
DELETE FROM {table}
WHERE view_name = '{definition.view_name}'
AND schema_name = '{definition.schema_name}'
"""
        try:
            self.registry.execute_query(delete_sql, fetch=False)
        except Exception:
            pass

        insert_sql = f"""
INSERT INTO {table}
VALUES (
    '{definition.view_name}',
    '{definition.schema_name}',
    '{definition.base_table}',
    '{definition.base_schema}',
    '{definition.query.replace("'", "''")}',
    '{definition.partition_column}',
    '{definition.refresh_mode.value}',
    {definition.retention_days},
    '{datetime.now().isoformat()}',
    '',
    '{json.dumps(definition.properties)}'
)
"""
        try:
            self.registry.execute_query(insert_sql, fetch=False)
        except Exception:
            pass

    def _load_view_metadata(self, schema_name: str, view_name: str) -> Optional[MaterializedViewDefinition]:
        """加载视图元数据"""
        catalog = self.registry.catalog
        table = f"{catalog}.default.{self.METADATA_TABLE}"

        query = f"""
SELECT view_name, schema_name, base_table, base_schema, 
       query, partition_column, refresh_mode, retention_days, properties
FROM {table}
WHERE view_name = '{view_name}' AND schema_name = '{schema_name}'
"""
        try:
            result = self.registry.execute_query(query)
            if result and len(result) > 0:
                row = result[0]
                return MaterializedViewDefinition(
                    view_name=row[0],
                    schema_name=row[1],
                    base_table=row[2],
                    base_schema=row[3],
                    query=row[4],
                    partition_column=row[5],
                    refresh_mode=RefreshMode(row[6]) if row[6] else RefreshMode.AUTO,
                    retention_days=row[7] or 7,
                    properties=json.loads(row[8]) if row[8] else {}
                )
        except Exception:
            pass

        return None

    def _delete_view_metadata(self, schema_name: str, view_name: str):
        """删除视图元数据"""
        catalog = self.registry.catalog
        table = f"{catalog}.default.{self.METADATA_TABLE}"

        delete_sql = f"""
DELETE FROM {table}
WHERE view_name = '{view_name}' AND schema_name = '{schema_name}'
"""
        try:
            self.registry.execute_query(delete_sql, fetch=False)
        except Exception:
            pass

    def _update_refresh_metadata(self, definition: MaterializedViewDefinition,
                                  result: RefreshResult):
        """更新刷新元数据"""
        catalog = self.registry.catalog
        table = f"{catalog}.default.{self.METADATA_TABLE}"

        update_sql = f"""
UPDATE {table}
SET last_refresh_time = '{datetime.now().isoformat()}'
WHERE view_name = '{definition.view_name}'
AND schema_name = '{definition.schema_name}'
"""
        try:
            self.registry.execute_query(update_sql, fetch=False)
        except Exception:
            pass


def create_default_views(manager: MaterializedViewManager) -> List[MaterializedViewDefinition]:
    """创建默认的物化视图"""
    views = [
        MaterializedViewDefinition(
            view_name="mv_daily_orders",
            schema_name="ecommerce",
            base_table="orders",
            base_schema="ecommerce",
            partition_column="order_date",
            refresh_mode=RefreshMode.AUTO,
            retention_days=7,
            query="""
SELECT 
    order_date,
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
FROM iceberg.ecommerce.orders
WHERE status = 'completed'
GROUP BY order_date, customer_id
"""
        ),
        MaterializedViewDefinition(
            view_name="mv_customer_summary",
            schema_name="ecommerce",
            base_table="orders",
            base_schema="ecommerce",
            partition_column="order_date",
            refresh_mode=RefreshMode.AUTO,
            retention_days=7,
            query="""
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
GROUP BY c.customer_id, c.name, c.region
"""
        ),
        MaterializedViewDefinition(
            view_name="mv_product_sales",
            schema_name="ecommerce",
            base_table="orders",
            base_schema="ecommerce",
            partition_column="order_date",
            refresh_mode=RefreshMode.AUTO,
            retention_days=7,
            query="""
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
GROUP BY o.order_date, p.product_id, p.name, p.category
"""
        ),
    ]

    for view in views:
        result = manager.create_materialized_view(view)
        print(f"  {result['status']}: {result.get('view', view.view_name)}")

    return views


def main():
    """演示物化视图管理"""
    from data_registry import IcebergTableRegistry

    registry = IcebergTableRegistry(
        trino_host="localhost",
        trino_port=8080,
        catalog="iceberg",
        username="admin"
    )

    manager = MaterializedViewManager(registry)

    print("=" * 70)
    print("物化视图管理模块 - 自动刷新 & 数据保留")
    print("=" * 70)

    print("\n📦 创建物化视图...")
    views = create_default_views(manager)

    print("\n🔍 检测分区变更...")
    for view in views:
        change_info = manager.detect_partition_changes(view)
        print(f"  {view.view_name}:")
        print(f"    新增分区: {change_info.new_partitions}")
        print(f"    删除分区: {change_info.removed_partitions}")
        print(f"    需要刷新: {change_info.needs_refresh}")

    print("\n🔄 自动刷新物化视图...")
    for view in views:
        result = manager.auto_refresh_if_needed(view.schema_name, view.view_name)
        if result:
            print(f"  {view.view_name}: {result.status}")
            if result.partitions_refreshed:
                print(f"    刷新分区: {result.partitions_refreshed}")

    print("\n📊 应用数据保留策略（保留 7 天）...")
    for view in views:
        retention_result = manager.apply_retention_policy(view)
        print(f"  {view.view_name}: {retention_result['status']}")

    print("\n📋 物化视图状态:")
    for view in views:
        status = manager.get_view_status(view.schema_name, view.view_name)
        print(f"  {view.view_name}:")
        print(f"    存在: {status['exists']}")
        print(f"    行数: {status['row_count']:,}")
        print(f"    分区数: {status['partition_count']}")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
