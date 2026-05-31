import re
from typing import Any
from dataclasses import dataclass, field


@dataclass
class PlanNode:
    id: str
    node_type: str
    label: str
    details: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    is_full_scan: bool = False
    cost: float = 0.0
    rows: int = 0


class ExplainPlanParser:
    def __init__(self, explain_output: str = None, sql: str = None):
        self.explain_output = explain_output
        self.sql = sql
        self.nodes = []
        self.edges = []
        self.node_counter = 0

    def parse(self) -> dict:
        if self.explain_output:
            return self._parse_explain_output()
        else:
            return self._generate_mock_plan()

    def _parse_explain_output(self) -> dict:
        lines = self.explain_output.strip().split('\n')
        plan_tree = self._parse_text_plan(lines)
        return self._tree_to_graph(plan_tree)

    def _parse_text_plan(self, lines: list) -> PlanNode:
        if not lines:
            return PlanNode(id="0", node_type="Unknown", label="No Plan")

        root = None
        stack = []

        for line in lines:
            if not line.strip():
                continue

            indent = len(line) - len(line.lstrip())
            line = line.strip()

            if not line:
                continue

            node = self._parse_plan_line(line)

            while stack and stack[-1][1] >= indent:
                stack.pop()

            if stack:
                stack[-1][0].children.append(node)
            else:
                root = node

            stack.append((node, indent))

        return root or PlanNode(id="0", node_type="Unknown", label="No Plan")

    def _parse_plan_line(self, line: str) -> PlanNode:
        self.node_counter += 1
        node_id = str(self.node_counter)

        node_type_match = re.match(r'^([A-Z][A-Z\s]+?)\s+on\s+(\w+)', line)
        if node_type_match:
            node_type = node_type_match.group(1).strip()
            table_name = node_type_match.group(2)
            label = f"{node_type} on {table_name}"
        else:
            node_type = line.split(' ')[0]
            label = line.split('(')[0].strip()

        is_full_scan = self._check_full_scan(node_type, line)

        cost_match = re.search(r'cost=([\d.]+)\.\.([\d.]+)', line)
        cost = 0.0
        if cost_match:
            cost = float(cost_match.group(2))

        rows_match = re.search(r'rows=(\d+)', line)
        rows = int(rows_match.group(1)) if rows_match else 0

        details = {
            "original_line": line,
            "table_name": node_type_match.group(2) if node_type_match else None
        }

        return PlanNode(
            id=node_id,
            node_type=node_type,
            label=label,
            details=details,
            is_full_scan=is_full_scan,
            cost=cost,
            rows=rows
        )

    def _check_full_scan(self, node_type: str, line: str) -> bool:
        full_scan_keywords = [
            'Seq Scan',
            'Sequential Scan',
            'Full Scan',
            'SeqScan'
        ]

        if any(keyword.lower() in node_type.lower() for keyword in full_scan_keywords):
            return True

        if any(keyword.lower() in line.lower() for keyword in full_scan_keywords):
            return True

        return False

    def _tree_to_graph(self, root: PlanNode) -> dict:
        nodes = []
        edges = []

        def traverse(node: PlanNode, parent_id: str = None):
            node_color = '#ff6b6b' if node.is_full_scan else '#4ecdc4'
            node_shape = 'ellipse'

            nodes.append({
                'id': node.id,
                'label': node.label,
                'node_type': node.node_type,
                'is_full_scan': node.is_full_scan,
                'cost': node.cost,
                'rows': node.rows,
                'details': node.details,
                'color': node_color,
                'shape': node_shape
            })

            if parent_id:
                edges.append({
                    'id': f"{parent_id}-{node.id}",
                    'source': parent_id,
                    'target': node.id
                })

            for child in node.children:
                traverse(child, node.id)

        traverse(root)

        return {
            'nodes': nodes,
            'edges': edges,
            'has_full_scan': any(n['is_full_scan'] for n in nodes),
            'total_cost': sum(n['cost'] for n in nodes),
            'summary': self._generate_summary(nodes)
        }

    def _generate_summary(self, nodes: list) -> dict:
        node_types = {}
        full_scan_count = 0
        total_cost = 0
        total_rows = 0

        for node in nodes:
            node_type = node['node_type']
            node_types[node_type] = node_types.get(node_type, 0) + 1
            if node['is_full_scan']:
                full_scan_count += 1
            total_cost += node['cost']
            total_rows += node['rows']

        return {
            'node_count': len(nodes),
            'node_types': node_types,
            'full_scan_count': full_scan_count,
            'total_cost': round(total_cost, 2),
            'total_rows': total_rows,
            'has_performance_issue': full_scan_count > 0
        }

    def _generate_mock_plan(self) -> dict:
        sql_lower = self.sql.lower() if self.sql else ""

        self.node_counter = 0
        nodes = []
        edges = []

        if 'recursive' in sql_lower or 'with recursive' in sql_lower:
            return self._generate_recursive_plan()
        elif 'join' in sql_lower:
            return self._generate_join_plan()
        else:
            return self._generate_simple_plan()

    def _generate_recursive_plan(self) -> dict:
        nodes = [
            {
                'id': '1',
                'label': 'CTE Scan on path_cte',
                'node_type': 'CTE Scan',
                'is_full_scan': False,
                'cost': 100.0,
                'rows': 1000,
                'details': {'table_name': 'path_cte'},
                'color': '#4ecdc4',
                'shape': 'ellipse'
            },
            {
                'id': '2',
                'label': 'Nested Loop',
                'node_type': 'Nested Loop',
                'is_full_scan': False,
                'cost': 80.0,
                'rows': 1000,
                'details': {},
                'color': '#45b7d1',
                'shape': 'diamond'
            },
            {
                'id': '3',
                'label': 'Hash Join',
                'node_type': 'Hash Join',
                'is_full_scan': False,
                'cost': 50.0,
                'rows': 1000,
                'details': {},
                'color': '#45b7d1',
                'shape': 'diamond'
            },
            {
                'id': '4',
                'label': 'WorkTable Scan',
                'node_type': 'WorkTable Scan',
                'is_full_scan': True,
                'cost': 30.0,
                'rows': 5000,
                'details': {'table_name': 'path_cte'},
                'color': '#ff6b6b',
                'shape': 'ellipse'
            },
            {
                'id': '5',
                'label': 'Seq Scan on edges',
                'node_type': 'Seq Scan',
                'is_full_scan': True,
                'cost': 40.0,
                'rows': 10000,
                'details': {'table_name': 'edges'},
                'color': '#ff6b6b',
                'shape': 'ellipse'
            },
            {
                'id': '6',
                'label': 'Index Scan on nodes_pkey',
                'node_type': 'Index Scan',
                'is_full_scan': False,
                'cost': 0.5,
                'rows': 1,
                'details': {'table_name': 'nodes', 'index': 'nodes_pkey'},
                'color': '#95e1d3',
                'shape': 'ellipse'
            },
            {
                'id': '7',
                'label': 'Index Scan on nodes_pkey',
                'node_type': 'Index Scan',
                'is_full_scan': False,
                'cost': 0.5,
                'rows': 1,
                'details': {'table_name': 'nodes', 'index': 'nodes_pkey'},
                'color': '#95e1d3',
                'shape': 'ellipse'
            }
        ]

        edges = [
            {'id': '1-2', 'source': '1', 'target': '2'},
            {'id': '2-3', 'source': '2', 'target': '3'},
            {'id': '2-6', 'source': '2', 'target': '6'},
            {'id': '2-7', 'source': '2', 'target': '7'},
            {'id': '3-4', 'source': '3', 'target': '4'},
            {'id': '3-5', 'source': '3', 'target': '5'}
        ]

        return {
            'nodes': nodes,
            'edges': edges,
            'has_full_scan': True,
            'total_cost': 201.5,
            'summary': {
                'node_count': 7,
                'node_types': {
                    'CTE Scan': 1,
                    'Nested Loop': 1,
                    'Hash Join': 1,
                    'WorkTable Scan': 1,
                    'Seq Scan': 1,
                    'Index Scan': 2
                },
                'full_scan_count': 2,
                'total_cost': 201.5,
                'total_rows': 17003,
                'has_performance_issue': True
            }
        }

    def _generate_join_plan(self) -> dict:
        nodes = [
            {
                'id': '1',
                'label': 'Nested Loop',
                'node_type': 'Nested Loop',
                'is_full_scan': False,
                'cost': 45.5,
                'rows': 100,
                'details': {},
                'color': '#45b7d1',
                'shape': 'diamond'
            },
            {
                'id': '2',
                'label': 'Hash Join',
                'node_type': 'Hash Join',
                'is_full_scan': False,
                'cost': 25.0,
                'rows': 100,
                'details': {},
                'color': '#45b7d1',
                'shape': 'diamond'
            },
            {
                'id': '3',
                'label': 'Seq Scan on nodes n0',
                'node_type': 'Seq Scan',
                'is_full_scan': True,
                'cost': 10.0,
                'rows': 1000,
                'details': {'table_name': 'nodes'},
                'color': '#ff6b6b',
                'shape': 'ellipse'
            },
            {
                'id': '4',
                'label': 'Hash',
                'node_type': 'Hash',
                'is_full_scan': False,
                'cost': 15.0,
                'rows': 500,
                'details': {},
                'color': '#96ceb4',
                'shape': 'hexagon'
            },
            {
                'id': '5',
                'label': 'Seq Scan on edges r0',
                'node_type': 'Seq Scan',
                'is_full_scan': True,
                'cost': 15.0,
                'rows': 5000,
                'details': {'table_name': 'edges'},
                'color': '#ff6b6b',
                'shape': 'ellipse'
            },
            {
                'id': '6',
                'label': 'Index Scan on nodes_pkey',
                'node_type': 'Index Scan',
                'is_full_scan': False,
                'cost': 0.5,
                'rows': 1,
                'details': {'table_name': 'nodes', 'index': 'nodes_pkey'},
                'color': '#95e1d3',
                'shape': 'ellipse'
            }
        ]

        edges = [
            {'id': '1-2', 'source': '1', 'target': '2'},
            {'id': '1-6', 'source': '1', 'target': '6'},
            {'id': '2-3', 'source': '2', 'target': '3'},
            {'id': '2-4', 'source': '2', 'target': '4'},
            {'id': '4-5', 'source': '4', 'target': '5'}
        ]

        return {
            'nodes': nodes,
            'edges': edges,
            'has_full_scan': True,
            'total_cost': 71.0,
            'summary': {
                'node_count': 6,
                'node_types': {
                    'Nested Loop': 1,
                    'Hash Join': 1,
                    'Seq Scan': 2,
                    'Hash': 1,
                    'Index Scan': 1
                },
                'full_scan_count': 2,
                'total_cost': 71.0,
                'total_rows': 6602,
                'has_performance_issue': True
            }
        }

    def _generate_simple_plan(self) -> dict:
        nodes = [
            {
                'id': '1',
                'label': 'Seq Scan on nodes n',
                'node_type': 'Seq Scan',
                'is_full_scan': True,
                'cost': 15.0,
                'rows': 1000,
                'details': {'table_name': 'nodes', 'filter': "label = 'Person'"},
                'color': '#ff6b6b',
                'shape': 'ellipse'
            }
        ]

        edges = []

        return {
            'nodes': nodes,
            'edges': edges,
            'has_full_scan': True,
            'total_cost': 15.0,
            'summary': {
                'node_count': 1,
                'node_types': {
                    'Seq Scan': 1
                },
                'full_scan_count': 1,
                'total_cost': 15.0,
                'total_rows': 1000,
                'has_performance_issue': True
            }
        }
