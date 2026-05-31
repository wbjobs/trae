import numpy as np
from typing import Dict, List, Set, Tuple
from mesh import TriangleMesh


class ErrorEstimator:
    def __init__(self, mesh: TriangleMesh, u: np.ndarray):
        self.mesh = mesh
        self.u = u
        self._build_edge_data()

    def _build_edge_data(self):
        self.edge_to_cells: Dict[Tuple[int, int], List[int]] = {}
        self.cell_to_edges: Dict[int, List[Tuple[int, int]]] = {}
        for cell_idx in range(self.mesh.get_num_cells()):
            edges = self.mesh.get_cell_edges(cell_idx)
            self.cell_to_edges[cell_idx] = []
            for i, j in edges:
                edge = tuple(sorted([i, j]))
                self.cell_to_edges[cell_idx].append(edge)
                if edge not in self.edge_to_cells:
                    self.edge_to_cells[edge] = []
                self.edge_to_cells[edge].append(cell_idx)

    def get_interior_edges(self) -> List[Tuple[int, int]]:
        return [
            edge for edge, cells in self.edge_to_cells.items()
            if len(cells) == 2
        ]

    def get_boundary_edges(self) -> List[Tuple[int, int]]:
        return [
            edge for edge, cells in self.edge_to_cells.items()
            if len(cells) == 1
        ]

    def _compute_cell_gradient(self, cell_idx: int) -> np.ndarray:
        cell = self.mesh.cells[cell_idx]
        p0 = self.mesh.nodes[cell[0]]
        p1 = self.mesh.nodes[cell[1]]
        p2 = self.mesh.nodes[cell[2]]
        area = self.mesh.get_cell_area(cell_idx)
        if area < 1e-12:
            return np.zeros(2)
        grad_phi = np.array([
            [p1[1] - p2[1], p2[0] - p1[0]],
            [p2[1] - p0[1], p0[0] - p2[0]],
            [p0[1] - p1[1], p1[0] - p0[0]]
        ]) / (2 * area)
        u_cell = self.u[cell]
        return np.sum(u_cell[:, np.newaxis] * grad_phi, axis=0)

    def _compute_jump(self, edge: Tuple[int, int]) -> float:
        cells = self.edge_to_cells[edge]
        if len(cells) == 1:
            grad = self._compute_cell_gradient(cells[0])
            n = self._compute_edge_normal(edge, cells[0])
            return np.dot(grad, n)
        else:
            grad0 = self._compute_cell_gradient(cells[0])
            grad1 = self._compute_cell_gradient(cells[1])
            n = self._compute_edge_normal(edge, cells[0])
            return np.dot(grad0 - grad1, n)

    def _compute_edge_normal(self, edge: Tuple[int, int], cell_idx: int) -> np.ndarray:
        p0 = self.mesh.nodes[edge[0]]
        p1 = self.mesh.nodes[edge[1]]
        tangent = p1 - p0
        normal = np.array([-tangent[1], tangent[0]])
        normal = normal / np.linalg.norm(normal)
        cell = self.mesh.cells[cell_idx]
        other = None
        for n_idx in cell:
            if n_idx not in edge:
                other = self.mesh.nodes[n_idx]
                break
        if other is not None:
            mid = (p0 + p1) / 2
            pointing = other - mid
            if np.dot(normal, pointing) < 0:
                normal = -normal
        return normal

    def compute_gradient_recovery_indicator(self) -> np.ndarray:
        num_cells = self.mesh.get_num_cells()
        eta = np.zeros(num_cells)
        for cell_idx in range(num_cells):
            area = self.mesh.get_cell_area(cell_idx)
            if area < 1e-12:
                continue
            cell = self.mesh.cells[cell_idx]
            grad = self._compute_cell_gradient(cell_idx)
            for node_idx in cell:
                if self.mesh.is_boundary_node(node_idx):
                    continue
                eta[cell_idx] += 0.5 * np.linalg.norm(grad) ** 2 * area / 3.0
        return eta

    def compute_jump_indicator(self) -> np.ndarray:
        num_cells = self.mesh.get_num_cells()
        eta = np.zeros(num_cells)
        for edge in self.get_interior_edges():
            cells = self.edge_to_cells[edge]
            length = self.mesh.get_edge_length(edge)
            jump = self._compute_jump(edge)
            contrib = 0.25 * length * jump ** 2
            for cell_idx in cells:
                eta[cell_idx] += contrib
        for edge in self.get_boundary_edges():
            cells = self.edge_to_cells[edge]
            length = self.mesh.get_edge_length(edge)
            jump = self._compute_jump(edge)
            eta[cells[0]] += 0.25 * length * jump ** 2
        return eta

    def compute_residual_indicator(self, f=None) -> np.ndarray:
        if f is None:
            from solver import poisson_source
            f = poisson_source
        num_cells = self.mesh.get_num_cells()
        eta = np.zeros(num_cells)
        for cell_idx in range(num_cells):
            area = self.mesh.get_cell_area(cell_idx)
            if area < 1e-12:
                continue
            center = self.mesh.get_cell_center(cell_idx)
            f_val = f(center[0], center[1])
            eta[cell_idx] += area * f_val ** 2
        return eta

    def compute_combined_indicator(self, f=None) -> np.ndarray:
        jump_eta = self.compute_jump_indicator()
        residual_eta = self.compute_residual_indicator(f)
        return jump_eta + residual_eta

    def mark_cells(self, eta: np.ndarray, method: str = 'dorfler',
                   fraction: float = 0.3, threshold: float = 1e-6) -> Set[int]:
        eta_sorted = np.sort(eta)[::-1]
        indices = np.argsort(eta)[::-1]
        total = np.sum(eta)
        if total < 1e-12:
            return set()
        if method == 'dorfler':
            target = fraction * total
            cumsum = np.cumsum(eta_sorted)
            num_mark = np.searchsorted(cumsum, target) + 1
            return set(indices[:num_mark])
        elif method == 'maximum':
            max_eta = np.max(eta)
            return set(np.where(eta >= fraction * max_eta)[0])
        elif method == 'threshold':
            return set(np.where(eta >= threshold)[0])
        else:
            raise ValueError(f"Unknown marking method: {method}")


def estimate_and_mark(mesh: TriangleMesh, u: np.ndarray, f=None) -> Set[int]:
    estimator = ErrorEstimator(mesh, u)
    eta = estimator.compute_combined_indicator(f)
    return estimator.mark_cells(eta, method='dorfler', fraction=0.3)
