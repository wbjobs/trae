import numpy as np
from typing import Set, Dict, Tuple, List
from mesh import TriangleMesh


class MeshRefiner:
    def __init__(self, mesh: TriangleMesh):
        self.mesh = mesh
        self.new_nodes: List[List[float]] = []
        self.new_cells: List[List[int]] = []
        self.edge_midpoints: Dict[Tuple[int, int], int] = {}

    def _get_edge_midpoint(self, edge: Tuple[int, int]) -> int:
        edge_key = tuple(sorted(edge))
        if edge_key in self.edge_midpoints:
            return self.edge_midpoints[edge_key]
        p0 = self.mesh.nodes[edge[0]]
        p1 = self.mesh.nodes[edge[1]]
        midpoint = [(p0[0] + p1[0]) / 2.0, (p0[1] + p1[1]) / 2.0]
        new_idx = len(self.mesh.nodes) + len(self.new_nodes)
        self.new_nodes.append(midpoint)
        self.edge_midpoints[edge_key] = new_idx
        return new_idx

    def _get_cell_nodes(self, cell: List[int]) -> Tuple[List[float], List[float], List[float]]:
        return (
            self.mesh.nodes[cell[0]],
            self.mesh.nodes[cell[1]],
            self.mesh.nodes[cell[2]]
        )

    def _find_third_node(self, cell: List[int], edge: Tuple[int, int]) -> int:
        for node in cell:
            if node not in edge:
                return node
        raise ValueError("Edge not found in cell")

    def refine_marked_cells(self, marked_cells: Set[int]) -> TriangleMesh:
        if not marked_cells:
            return self.mesh
        longest_edges = {}
        for cell_idx in marked_cells:
            longest_edges[cell_idx] = self.mesh.get_longest_edge(cell_idx)
        edge_to_cells = self._build_edge_to_cells()
        propagation_queue = set(marked_cells)
        propagation_marked = set(marked_cells)
        while propagation_queue:
            cell_idx = propagation_queue.pop()
            longest_edge = longest_edges.get(cell_idx)
            if longest_edge is None:
                longest_edge = self.mesh.get_longest_edge(cell_idx)
                longest_edges[cell_idx] = longest_edge
            edge_key = tuple(sorted(longest_edge))
            neighbors = edge_to_cells.get(edge_key, [])
            for neighbor_idx in neighbors:
                if neighbor_idx != cell_idx and neighbor_idx not in propagation_marked:
                    neighbor_longest = self.mesh.get_longest_edge(neighbor_idx)
                    neighbor_key = tuple(sorted(neighbor_longest))
                    if neighbor_key != edge_key:
                        propagation_marked.add(neighbor_idx)
                        propagation_queue.add(neighbor_idx)
                        longest_edges[neighbor_idx] = neighbor_longest
        all_nodes = list(self.mesh.nodes)
        is_boundary = [
            self.mesh.is_boundary_node(i) for i in range(len(self.mesh.nodes))
        ]
        new_boundary_nodes = set()
        for cell_idx in range(self.mesh.get_num_cells()):
            if cell_idx in propagation_marked:
                self._refine_cell_longest_edge(
                    cell_idx, longest_edges[cell_idx],
                    new_boundary_nodes, is_boundary
                )
            else:
                cell = self.mesh.cells[cell_idx]
                self.new_cells.append([int(cell[0]), int(cell[1]), int(cell[2])])
        all_nodes.extend(self.new_nodes)
        final_boundary = set([i for i, b in enumerate(is_boundary) if b])
        final_boundary.update(new_boundary_nodes)
        return TriangleMesh(np.array(all_nodes), np.array(self.new_cells), final_boundary)

    def _refine_cell_longest_edge(self, cell_idx: int, longest_edge: Tuple[int, int],
                                   new_boundary_nodes: Set[int], is_boundary: List[bool]):
        cell = self.mesh.cells[cell_idx]
        third_node = self._find_third_node(cell, longest_edge)
        mid_idx = self._get_edge_midpoint(longest_edge)
        v0, v1 = longest_edge
        self.new_cells.append([int(third_node), int(v0), int(mid_idx)])
        self.new_cells.append([int(third_node), int(mid_idx), int(v1)])
        if is_boundary[v0] and is_boundary[v1]:
            new_boundary_nodes.add(mid_idx)
            if len(is_boundary) <= mid_idx:
                is_boundary.extend([False] * (mid_idx - len(is_boundary) + 1))
            is_boundary[mid_idx] = True

    def _build_edge_to_cells(self) -> Dict[Tuple[int, int], List[int]]:
        edge_to_cells: Dict[Tuple[int, int], List[int]] = {}
        for cell_idx in range(self.mesh.get_num_cells()):
            edges = self.mesh.get_cell_edges(cell_idx)
            for i, j in edges:
                edge = tuple(sorted([i, j]))
                if edge not in edge_to_cells:
                    edge_to_cells[edge] = []
                edge_to_cells[edge].append(cell_idx)
        return edge_to_cells


def refine_by_click(mesh: TriangleMesh, click_point: np.ndarray,
                    u: np.ndarray, num_levels: int = 2) -> Tuple[TriangleMesh, List[Dict]]:
    refinement_history = []
    current_mesh = mesh
    for level in range(num_levels):
        cell_idx = current_mesh.find_cell_containing_point(click_point)
        from estimator import ErrorEstimator
        estimator = ErrorEstimator(current_mesh, u)
        eta = estimator.compute_combined_indicator()
        marked = set()
        neighbors = {cell_idx}
        visited = set()
        queue = [cell_idx]
        while queue and len(marked) < 10:
            c = queue.pop(0)
            if c in visited:
                continue
            visited.add(c)
            marked.add(c)
            if len(marked) < 15:
                cell = current_mesh.cells[c]
                for n_idx in cell:
                    for nc in current_mesh.node_to_cells[n_idx]:
                        if nc not in visited and nc not in queue:
                            queue.append(nc)
        refiner = MeshRefiner(current_mesh)
        new_mesh = refiner.refine_marked_cells(marked)
        refinement_history.append({
            'level': level,
            'num_nodes_before': current_mesh.get_num_nodes(),
            'num_nodes_after': new_mesh.get_num_nodes(),
            'num_cells_before': current_mesh.get_num_cells(),
            'num_cells_after': new_mesh.get_num_cells(),
            'marked_cells': len(marked),
            'average_eta': float(np.mean(eta[list(marked)]) if marked else 0.0)
        })
        current_mesh = new_mesh
    return current_mesh, refinement_history


def refine_by_estimator(mesh: TriangleMesh, u: np.ndarray,
                        num_levels: int = 1) -> Tuple[TriangleMesh, List[Dict]]:
    refinement_history = []
    current_mesh = mesh
    for level in range(num_levels):
        from estimator import estimate_and_mark
        marked = estimate_and_mark(current_mesh, u)
        refiner = MeshRefiner(current_mesh)
        new_mesh = refiner.refine_marked_cells(marked)
        from estimator import ErrorEstimator
        estimator = ErrorEstimator(current_mesh, u)
        eta = estimator.compute_combined_indicator()
        refinement_history.append({
            'level': level,
            'num_nodes_before': current_mesh.get_num_nodes(),
            'num_nodes_after': new_mesh.get_num_nodes(),
            'num_cells_before': current_mesh.get_num_cells(),
            'num_cells_after': new_mesh.get_num_cells(),
            'marked_cells': len(marked),
            'total_eta': float(np.sum(eta)),
            'max_eta': float(np.max(eta))
        })
        current_mesh = new_mesh
    return current_mesh, refinement_history
