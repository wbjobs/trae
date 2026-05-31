#!/usr/bin/env python3
"""
查询计划可视化模块 - 展示扫描的分区数和执行计划
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum
import json
from collections import defaultdict


class VisualizationFormat(Enum):
    TEXT = "text"
    HTML = "html"
    JSON = "json"
    Mermaid = "mermaid"


@dataclass
class PartitionScanInfo:
    """分区扫描信息"""
    table_name: str
    partition_column: str
    total_partitions: int
    scanned_partitions: int
    scanned_partition_values: List[Any] = field(default_factory=list)
    pruning_effective: bool = False

    @property
    def skipped_partitions(self) -> int:
        return self.total_partitions - self.scanned_partitions

    @property
    def pruning_rate(self) -> float:
        if self.total_partitions == 0:
            return 0.0
        return self.skipped_partitions / self.total_partitions


@dataclass
class TableScanInfo:
    """表扫描信息"""
    table_name: str
    files_scanned: int
    files_total: int
    bytes_scanned: int
    bytes_total: int
    rows_estimated: int
    partitions: List[PartitionScanInfo] = field(default_factory=list)

    @property
    def data_skipped(self) -> int:
        return self.bytes_total - self.bytes_scanned

    @property
    def skip_rate(self) -> float:
        if self.bytes_total == 0:
            return 0.0
        return self.data_skipped / self.bytes_total


@dataclass
class ExecutionNode:
    """执行计划节点"""
    node_id: str
    node_type: str
    description: str
    cost: float
    rows: int
    children: List['ExecutionNode'] = field(default_factory=list)


@dataclass
class VisualizationResult:
    """可视化结果"""
    format: VisualizationFormat
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class QueryPlanVisualizer:
    """查询计划可视化器"""

    def __init__(self, plan_analyzer=None):
        self.analyzer = plan_analyzer

    def visualize(self, execution_plan: Dict,
                  format: VisualizationFormat = VisualizationFormat.TEXT,
                  query: str = "") -> VisualizationResult:
        """生成可视化结果"""
        if format == VisualizationFormat.TEXT:
            return self._visualize_text(execution_plan, query)
        elif format == VisualizationFormat.HTML:
            return self._visualize_html(execution_plan, query)
        elif format == VisualizationFormat.Mermaid:
            return self._visualize_mermaid(execution_plan, query)
        else:
            return self._visualize_json(execution_plan)

    def _visualize_text(self, plan: Dict, query: str = "") -> VisualizationResult:
        """生成文本格式的可视化"""
        lines = []

        lines.append("=" * 70)
        lines.append("查询执行计划可视化")
        lines.append("=" * 70)

        if query:
            lines.append(f"\n📋 查询语句:")
            lines.append(f"   {query.strip()}")

        table_scans = self._extract_table_scans(plan)
        partition_info = self._extract_partition_info(plan)

        lines.append(f"\n📊 表扫描分析:")
        lines.append("-" * 70)

        for scan in table_scans:
            lines.append(f"\n   📄 表: {scan['table_name']}")
            lines.append(f"      📁 文件: {scan['files_scanned']}/{scan['files_total']}")
            lines.append(f"      💾 数据: {self._format_bytes(scan['bytes_scanned'])}/{self._format_bytes(scan['bytes_total'])}")
            lines.append(f"      📊 跳过率: {scan['skip_rate']:.2%}")

        lines.append(f"\n🔍 分区裁剪分析:")
        lines.append("-" * 70)

        total_partitions = 0
        total_scanned = 0

        for part_info in partition_info:
            lines.append(f"\n   📂 表: {part_info.table_name}")
            lines.append(f"      🔑 分区列: {part_info.partition_column}")
            lines.append(f"      📊 总分区数: {part_info.total_partitions}")
            lines.append(f"      ✅ 扫描分区数: {part_info.scanned_partitions}")
            lines.append(f"      ⏭️  跳过分区数: {part_info.skipped_partitions}")
            lines.append(f"      📈 裁剪率: {part_info.pruning_rate:.2%}")
            lines.append(f"      🎯 裁剪有效: {'✓ Yes' if part_info.pruning_effective else '✗ No'}")

            if part_info.scanned_partition_values:
                lines.append(f"      📋 扫描的分区值: {part_info.scanned_partition_values[:10]}")

            total_partitions += part_info.total_partitions
            total_scanned += part_info.scanned_partitions

        lines.append(f"\n📈 总体统计:")
        lines.append("-" * 70)
        lines.append(f"   总分区数: {total_partitions}")
        lines.append(f"   扫描分区数: {total_scanned}")
        lines.append(f"   跳过分区数: {total_partitions - total_scanned}")
        if total_partitions > 0:
            lines.append(f"   总体裁剪率: {(total_partitions - total_scanned) / total_partitions:.2%}")

        lines.append("\n" + "=" * 70)

        return VisualizationResult(
            format=VisualizationFormat.TEXT,
            content="\n".join(lines),
            metadata={
                "total_partitions": total_partitions,
                "total_scanned": total_scanned,
                "tables": len(table_scans)
            }
        )

    def _visualize_html(self, plan: Dict, query: str = "") -> VisualizationResult:
        """生成 HTML 格式的可视化"""
        table_scans = self._extract_table_scans(plan)
        partition_info = self._extract_partition_info(plan)

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>查询执行计划可视化</title>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
        h2 {{ color: #34495e; margin-top: 30px; }}
        .query-box {{ background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 8px; font-family: monospace; }}
        .card {{ background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .table-info {{ display: flex; justify-content: space-between; margin: 10px 0; }}
        .stat {{ text-align: center; padding: 10px; }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #3498db; }}
        .stat-label {{ font-size: 12px; color: #7f8c8d; }}
        .progress-bar {{ background: #e0e0e0; border-radius: 4px; height: 20px; overflow: hidden; }}
        .progress-fill {{ height: 100%; transition: width 0.3s; }}
        .progress-green {{ background: #27ae60; }}
        .progress-yellow {{ background: #f39c12; }}
        .progress-red {{ background: #e74c3c; }}
        table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
        th {{ background: #3498db; color: white; padding: 10px; text-align: left; }}
        td {{ padding: 10px; border-bottom: 1px solid #ecf0f1; }}
        tr:hover {{ background: #f8f9fa; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }}
        .badge-success {{ background: #27ae60; color: white; }}
        .badge-warning {{ background: #f39c12; color: white; }}
        .badge-error {{ background: #e74c3c; color: white; }}
    </style>
</head>
<body>
<div class="container">
    <h1>📊 查询执行计划可视化</h1>

    <div class="card">
        <h2>📋 查询语句</h2>
        <div class="query-box">{query}</div>
    </div>

    <div class="card">
        <h2>📈 分区裁剪统计</h2>
        <div class="table-info">
"""

        total_partitions = sum(p.total_partitions for p in partition_info)
        total_scanned = sum(p.scanned_partitions for p in partition_info)

        html += f"""
            <div class="stat">
                <div class="stat-value">{total_partitions}</div>
                <div class="stat-label">总分区数</div>
            </div>
            <div class="stat">
                <div class="stat-value">{total_scanned}</div>
                <div class="stat-label">扫描分区</div>
            </div>
            <div class="stat">
                <div class="stat-value">{total_partitions - total_scanned}</div>
                <div class="stat-label">跳过分区</div>
            </div>
            <div class="stat">
                <div class="stat-value">{(total_partitions - total_scanned) / total_partitions * 100:.1f}%</div>
                <div class="stat-label">裁剪率</div>
            </div>
        """

        html += """
        </div>
    </div>

    <div class="card">
        <h2>📄 表扫描详情</h2>
        <table>
            <tr>
                <th>表名</th>
                <th>扫描文件/总文件</th>
                <th>扫描数据/总数据</th>
                <th>跳过率</th>
                <th>状态</th>
            </tr>
"""

        for scan in table_scans:
            skip_rate = scan['skip_rate']
            if skip_rate > 0.5:
                badge_class = "badge-success"
                status = "✓ 良好"
            elif skip_rate > 0.2:
                badge_class = "badge-warning"
                status = "⚠ 一般"
            else:
                badge_class = "badge-error"
                status = "✗ 差"

            progress_class = "progress-green" if skip_rate > 0.5 else "progress-yellow" if skip_rate > 0.2 else "progress-red"

            html += f"""
            <tr>
                <td>{scan['table_name']}</td>
                <td>{scan['files_scanned']}/{scan['files_total']}</td>
                <td>{self._format_bytes(scan['bytes_scanned'])}/{self._format_bytes(scan['bytes_total'])}</td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill {progress_class}" style="width: {skip_rate * 100}%"></div>
                    </div>
                    {skip_rate:.1%}
                </td>
                <td><span class="badge {badge_class}">{status}</span></td>
            </tr>
"""

        html += """
        </table>
    </div>

    <div class="card">
        <h2>🔍 分区裁剪详情</h2>
        <table>
            <tr>
                <th>表名</th>
                <th>分区列</th>
                <th>总分区</th>
                <th>扫描分区</th>
                <th>跳过分区</th>
                <th>裁剪率</th>
                <th>有效</th>
            </tr>
"""

        for part in partition_info:
            badge = "✓" if part.pruning_effective else "✗"
            badge_class = "badge-success" if part.pruning_effective else "badge-error"

            html += f"""
            <tr>
                <td>{part.table_name}</td>
                <td>{part.partition_column}</td>
                <td>{part.total_partitions}</td>
                <td>{part.scanned_partitions}</td>
                <td>{part.skipped_partitions}</td>
                <td>{part.pruning_rate:.1%}</td>
                <td><span class="badge {badge_class}">{badge}</span></td>
            </tr>
"""

        html += """
        </table>
    </div>
</div>
</body>
</html>
"""

        return VisualizationResult(
            format=VisualizationFormat.HTML,
            content=html,
            metadata={
                "total_partitions": total_partitions,
                "total_scanned": total_scanned,
                "tables": len(table_scans)
            }
        )

    def _visualize_mermaid(self, plan: Dict, query: str = "") -> VisualizationResult:
        """生成 Mermaid 图格式的可视化"""
        mermaid = "graph TD\n"
        mermaid += "    Start[查询开始] --> Execute[执行查询]\n"

        table_scans = self._extract_table_scans(plan)
        partition_info = self._extract_partition_info(plan)

        for i, scan in enumerate(table_scans):
            node_id = f"TableScan{i}"
            mermaid += f"    Execute --> {node_id}[表扫描: {scan['table_name']}]\n"

            for j, part in enumerate(partition_info):
                if part.table_name == scan['table_name']:
                    part_node = f"Partition{i}_{j}"
                    mermaid += f"    {node_id} --> {part_node}[分区: {part.partition_column}]\n"
                    mermaid += f"    {part_node} --> Prune{i}_{j}[裁剪: {part.pruning_rate:.0%}]\n"

        mermaid += "    Execute --> End[查询完成]\n"

        return VisualizationResult(
            format=VisualizationFormat.Mermaid,
            content=mermaid,
            metadata={}
        )

    def _visualize_json(self, plan: Dict) -> VisualizationResult:
        """生成 JSON 格式的可视化"""
        table_scans = self._extract_table_scans(plan)
        partition_info = self._extract_partition_info(plan)

        output = {
            "table_scans": table_scans,
            "partition_info": [
                {
                    "table_name": p.table_name,
                    "partition_column": p.partition_column,
                    "total_partitions": p.total_partitions,
                    "scanned_partitions": p.scanned_partitions,
                    "skipped_partitions": p.skipped_partitions,
                    "pruning_rate": p.pruning_rate,
                    "pruning_effective": p.pruning_effective,
                }
                for p in partition_info
            ]
        }

        return VisualizationResult(
            format=VisualizationFormat.JSON,
            content=json.dumps(output, indent=2, ensure_ascii=False),
            metadata=output
        )

    def _extract_table_scans(self, plan: Dict) -> List[Dict]:
        """从执行计划提取表扫描信息"""
        scans = []

        def traverse(node):
            if isinstance(node, dict):
                name = node.get("name", "").lower()
                if "tablescan" in name:
                    details = node.get("details", {})
                    table_name = node.get("identifier", "unknown")
                    scan = {
                        "table_name": table_name,
                        "files_scanned": details.get("filesScanned", 0),
                        "files_total": details.get("filesTotal", 0),
                        "bytes_scanned": details.get("bytesScanned", 0),
                        "bytes_total": details.get("bytesTotal", 0),
                        "rows_estimated": details.get("rowCount", 0),
                    }
                    scan["skip_rate"] = (
                        (scan["bytes_total"] - scan["bytes_scanned"]) / scan["bytes_total"]
                        if scan["bytes_total"] > 0 else 0.0
                    )
                    scans.append(scan)
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return scans

    def _extract_partition_info(self, plan: Dict) -> List[PartitionScanInfo]:
        """从执行计划提取分区信息"""
        info_list = []

        def traverse(node):
            if isinstance(node, dict):
                name = node.get("name", "").lower()
                if "tablescan" in name:
                    details = node.get("details", {})
                    table_name = node.get("identifier", "unknown")

                    partitions = details.get("partitions", [])
                    for part in partitions:
                        info = PartitionScanInfo(
                            table_name=table_name,
                            partition_column=part.get("column", "unknown"),
                            total_partitions=details.get("partitionsTotal", 0),
                            scanned_partitions=details.get("partitionsScanned", 0),
                            scanned_partition_values=part.get("values", []),
                            pruning_effective=(
                                details.get("partitionsScanned", 0) < details.get("partitionsTotal", 0)
                            )
                        )
                        info_list.append(info)
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)

        if not info_list:
            for node in self._get_all_nodes(plan):
                details = node.get("details", {})
                if "partitionsTotal" in details or "partitionsScanned" in details:
                    info = PartitionScanInfo(
                        table_name=node.get("identifier", "unknown"),
                        partition_column="unknown",
                        total_partitions=details.get("partitionsTotal", 0),
                        scanned_partitions=details.get("partitionsScanned", 0),
                        pruning_effective=(
                            details.get("partitionsScanned", 0) < details.get("partitionsTotal", 0)
                        )
                    )
                    info_list.append(info)

        return info_list

    def _get_all_nodes(self, plan: Dict) -> List[Dict]:
        """获取所有节点"""
        nodes = []

        def traverse(node):
            if isinstance(node, dict):
                nodes.append(node)
                for value in node.values():
                    traverse(value)
            elif isinstance(node, list):
                for item in node:
                    traverse(item)

        traverse(plan)
        return nodes

    @staticmethod
    def _format_bytes(bytes_val: int) -> str:
        """格式化字节数"""
        if bytes_val == 0:
            return "0 B"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if abs(bytes_val) < 1024.0:
                return f"{bytes_val:.1f} {unit}"
            bytes_val /= 1024.0
        return f"{bytes_val:.1f} PB"


def main():
    """演示查询计划可视化"""
    from query_optimizer import QueryPlanAnalyzer

    visualizer = QueryPlanVisualizer()

    sample_plan = {
        "name": "Plan",
        "details": {},
        "children": [
            {
                "name": "TableScan",
                "identifier": "iceberg.ecommerce.orders",
                "details": {
                    "filesScanned": 50,
                    "filesTotal": 200,
                    "bytesScanned": 1073741824,
                    "bytesTotal": 4294967296,
                    "partitionsTotal": 365,
                    "partitionsScanned": 31,
                    "partitions": [
                        {"column": "order_date", "values": ["2024-01-01", "2024-01-02"]}
                    ]
                }
            },
            {
                "name": "TableScan",
                "identifier": "iceberg.ecommerce.customers",
                "details": {
                    "filesScanned": 100,
                    "filesTotal": 100,
                    "bytesScanned": 536870912,
                    "bytesTotal": 536870912,
                    "partitionsTotal": 10,
                    "partitionsScanned": 10,
                    "partitions": []
                }
            }
        ]
    }

    sample_query = """
SELECT o.order_id, c.name, o.amount
FROM iceberg.ecommerce.orders o
JOIN iceberg.ecommerce.customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01'
  AND o.order_date < DATE '2024-02-01'
"""

    print("=" * 70)
    print("查询计划可视化 - 分区扫描分析")
    print("=" * 70)

    result = visualizer.visualize(sample_plan, VisualizationFormat.TEXT, sample_query)
    print(result.content)

    html_result = visualizer.visualize(sample_plan, VisualizationFormat.HTML, sample_query)
    with open("query_plan.html", "w", encoding="utf-8") as f:
        f.write(html_result.content)
    print("\n📄 HTML 可视化已保存到: query_plan.html")

    json_result = visualizer.visualize(sample_plan, VisualizationFormat.JSON, sample_query)
    with open("query_plan.json", "w", encoding="utf-8") as f:
        f.write(json_result.content)
    print("📄 JSON 可视化已保存到: query_plan.json")


if __name__ == "__main__":
    main()
