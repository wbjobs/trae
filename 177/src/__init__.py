"""
湖仓查询加速层 - 核心模块
技术栈: Trino + Iceberg + MinIO
功能: 分区裁剪 | Z-Order 优化 | 计划可视化 | 隐藏列去重 | 物化视图自动刷新
"""

from .data_registry import (
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

from .query_optimizer import (
    QueryOptimizer,
    QueryPlanAnalyzer,
    QueryOptimizationConfig,
    QueryExecutionResult,
    PartitionPruningResult,
    ZOrderOptimizationResult,
    DeleteFileInfo,
    QueryOptimizationLevel,
)

from .plan_visualizer import (
    QueryPlanVisualizer,
    VisualizationFormat,
    VisualizationResult,
    PartitionScanInfo,
    TableScanInfo,
)

from .deduplication import (
    HiddenColumnDeduplicator,
    DeduplicationConfig,
    DeduplicationResult,
    DeduplicationMode,
    DeduplicationStrategy,
)

from .materialized_view import (
    MaterializedViewManager,
    MaterializedViewDefinition,
    MaterializedViewStatus,
    RefreshMode,
    RefreshResult,
    PartitionChangeInfo,
)

__all__ = [
    "IcebergTableRegistry",
    "IcebergPartitionManager",
    "ZOrderOptimizer",
    "DeleteFileCleaner",
    "TableRegistration",
    "ColumnDef",
    "PartitionSpec",
    "ZOrderSpec",
    "PartitionTransform",
    "FileFormat",
    "WriteMode",
    "QueryOptimizer",
    "QueryPlanAnalyzer",
    "QueryOptimizationConfig",
    "QueryExecutionResult",
    "PartitionPruningResult",
    "ZOrderOptimizationResult",
    "DeleteFileInfo",
    "QueryOptimizationLevel",
    "QueryPlanVisualizer",
    "VisualizationFormat",
    "VisualizationResult",
    "PartitionScanInfo",
    "TableScanInfo",
    "HiddenColumnDeduplicator",
    "DeduplicationConfig",
    "DeduplicationResult",
    "DeduplicationMode",
    "DeduplicationStrategy",
    "MaterializedViewManager",
    "MaterializedViewDefinition",
    "MaterializedViewStatus",
    "RefreshMode",
    "RefreshResult",
    "PartitionChangeInfo",
]

__version__ = "1.2.0"
