import numpy as np
from typing import List, Tuple, Dict, Set


class TriangleMesh:
    def __init__(self, nodes: np.ndarray, cells: np.ndarray, boundary_nodes: List[int] = None):
        self.nodes = np.array(nodes, dtype=np.float64)
        self.cells = np.array(cells, dtype=np.int32)
        if boundary_nodes is None:
            self.boundary_nodes = self._compute_boundary_nodes()
        else:
            self.boundary_nodes = set(boundary_nodes)
        self._rebuild_connectivity()

    def _compute_boundary_nodes(self) -> Set[int]:
        edge_counts = {}
        for cell in self.cells:
            for i in range(3):
                j, k = cell[i], cell[(i + 1) % 3]
                edge = tuple(sorted([j, k]))
                edge_counts[edge] = edge_counts.get(edge, 0) + 1
        boundary = set()
        for edge, count in edge_counts.items():
            if count == 1:
                boundary.add(edge[0])
                boundary.add(edge[1])
        return boundary

    def _rebuild_connectivity(self):
        self.node_to_cells = [[] for _ in range(len(self.nodes))]
        for cell_idx, cell in enumerate(self.cells):
            for node_idx in cell:
                self.node_to_cells[node_idx].append(cell_idx)
        self.cell_centers = np.array([
            np.mean(self.nodes[cell], axis=0)
            for cell in self.cells
        ])

    def get_num_nodes(self) -> int:
        return len(self.nodes)

    def get_num_cells(self) -> int:
        return len(self.cells)

    def is_boundary_node(self, node_idx: int) -> bool:
        return node_idx in self.boundary_nodes

    def get_cell_center(self, cell_idx: int) -> np.ndarray:
        return self.cell_centers[cell_idx]

    def find_cell_containing_point(self, point: np.ndarray) -> int:
        point = np.array(point)
        for cell_idx in range(len(self.cells)):
            if self._point_in_cell(point, cell_idx):
                return cell_idx
        min_dist = float('inf')
        closest = 0
        for cell_idx in range(len(self.cells)):
            dist = np.linalg.norm(self.cell_centers[cell_idx] - point)
            if dist < min_dist:
                min_dist = dist
                closest = cell_idx
        return closest

    def _point_in_cell(self, point: np.ndarray, cell_idx: int) -> bool:
        cell = self.cells[cell_idx]
        p0 = self.nodes[cell[0]]
        p1 = self.nodes[cell[1]]
        p2 = self.nodes[cell[2]]
        A = self._triangle_area(p0, p1, p2)
        if A < 1e-12:
            return False
        A0 = self._triangle_area(point, p1, p2)
        A1 = self._triangle_area(p0, point, p2)
        A2 = self._triangle_area(p0, p1, point)
        total = A0 + A1 + A2
        return abs(total - A) < 1e-8

    def _triangle_area(self, p0, p1, p2) -> float:
        return 0.5 * abs(
            (p1[0] - p0[0]) * (p2[1] - p0[1]) -
            (p1[1] - p0[1]) * (p2[0] - p0[0])
        )

    def get_cell_area(self, cell_idx: int) -> float:
        cell = self.cells[cell_idx]
        return self._triangle_area(
            self.nodes[cell[0]],
            self.nodes[cell[1]],
            self.nodes[cell[2]]
        )

    def get_cell_edges(self, cell_idx: int) -> List[Tuple[int, int]]:
        cell = self.cells[cell_idx]
        return [
            (cell[0], cell[1]),
            (cell[1], cell[2]),
            (cell[2], cell[0])
        ]

    def get_edge_length(self, edge: Tuple[int, int]) -> float:
        return np.linalg.norm(self.nodes[edge[0]] - self.nodes[edge[1]])

    def get_longest_edge(self, cell_idx: int) -> Tuple[int, int]:
        edges = self.get_cell_edges(cell_idx)
        lengths = [self.get_edge_length(e) for e in edges]
        return edges[np.argmax(lengths)]

    def to_dict(self) -> Dict:
        return {
            'nodes': self.nodes.tolist(),
            'cells': self.cells.tolist(),
            'boundary_nodes': list(self.boundary_nodes)
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'TriangleMesh':
        return cls(
            nodes=np.array(data['nodes']),
            cells=np.array(data['cells']),
            boundary_nodes=set(data['boundary_nodes']) if 'boundary_nodes' in data else None
        )


def create_initial_mesh(nx: int = 10, ny: int = 10) -> TriangleMesh:
    x = np.linspace(0, 1, nx)
    y = np.linspace(0, 1, ny)
    nodes = []
    for j in range(ny):
        for i in range(nx):
            nodes.append([x[i], y[j]])
    nodes = np.array(nodes)
    cells = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            idx = j * nx + i
            cells.append([idx, idx + 1, idx + nx])
            cells.append([idx + 1, idx + nx + 1, idx + nx])
    return TriangleMesh(nodes, np.array(cells))
