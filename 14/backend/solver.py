import numpy as np
from scipy.sparse import csr_matrix, lil_matrix
from scipy.sparse.linalg import spsolve
from typing import Callable, Tuple
from mesh import TriangleMesh


def poisson_source(x: float, y: float) -> float:
    return -2 * np.pi ** 2 * np.sin(np.pi * x) * np.sin(np.pi * y)


def exact_solution(x: float, y: float) -> float:
    return np.sin(np.pi * x) * np.sin(np.pi * y)


def assemble_system(mesh: TriangleMesh, f: Callable = poisson_source) -> Tuple[csr_matrix, np.ndarray]:
    num_nodes = mesh.get_num_nodes()
    A = lil_matrix((num_nodes, num_nodes))
    b = np.zeros(num_nodes)
    for cell_idx in range(mesh.get_num_cells()):
        cell = mesh.cells[cell_idx]
        p0 = mesh.nodes[cell[0]]
        p1 = mesh.nodes[cell[1]]
        p2 = mesh.nodes[cell[2]]
        area = mesh.get_cell_area(cell_idx)
        if area < 1e-12:
            continue
        grad_phi = np.array([
            [p1[1] - p2[1], p2[0] - p1[0]],
            [p2[1] - p0[1], p0[0] - p2[0]],
            [p0[1] - p1[1], p1[0] - p0[0]]
        ]) / (2 * area)
        for i in range(3):
            for j in range(3):
                A[cell[i], cell[j]] += np.dot(grad_phi[i], grad_phi[j]) * area
        center = mesh.get_cell_center(cell_idx)
        f_val = f(center[0], center[1])
        for i in range(3):
            b[cell[i]] += f_val * area / 3.0
    return csr_matrix(A), b


def apply_dirichlet_bc(A: csr_matrix, b: np.ndarray, mesh: TriangleMesh, g: Callable = None) -> Tuple[csr_matrix, np.ndarray]:
    if g is None:
        g = exact_solution
    A = A.tolil()
    b = b.copy()
    for node_idx in mesh.boundary_nodes:
        x, y = mesh.nodes[node_idx]
        g_val = g(x, y)
        b -= g_val * A[:, node_idx].toarray().flatten()
        A[node_idx, :] = 0
        A[:, node_idx] = 0
        A[node_idx, node_idx] = 1
        b[node_idx] = g_val
    return csr_matrix(A), b


def solve_poisson(mesh: TriangleMesh, f: Callable = poisson_source, g: Callable = None) -> np.ndarray:
    A, b = assemble_system(mesh, f)
    A, b = apply_dirichlet_bc(A, b, mesh, g)
    u = spsolve(A, b)
    return u


def compute_l2_error(mesh: TriangleMesh, u: np.ndarray, u_exact: Callable = exact_solution) -> float:
    error = 0.0
    for cell_idx in range(mesh.get_num_cells()):
        cell = mesh.cells[cell_idx]
        area = mesh.get_cell_area(cell_idx)
        if area < 1e-12:
            continue
        center = mesh.get_cell_center(cell_idx)
        u_approx = np.mean(u[cell])
        u_true = u_exact(center[0], center[1])
        error += (u_approx - u_true) ** 2 * area
    return np.sqrt(error)
