import numpy as np
from typing import Tuple
from .solver_config import SolverConfig, FluidState
from ..mesh_generator import MeshData
from .. import precision_kernels as pk
from ..precision_kernels import PRECISION, to_precision


class PressureSolver:
    def __init__(self, mesh: MeshData, config: SolverConfig):
        self.mesh = mesh
        self.config = config
        self._nx = 0
        self._ny = 0
        self._dx = 0.0
        self._dy = 0.0
        self._init_grid()

    def _init_grid(self):
        self._dx = max(self.mesh.dx, 1e-12)
        self._dy = max(self.mesh.dy, 1e-12)
        self._nx = int((self.mesh.nodes[-1, 0] - self.mesh.nodes[0, 0]) / self._dx) + 1 if self._dx > 1e-12 else 1
        self._ny = int((self.mesh.nodes[-1, 1] - self.mesh.nodes[0, 1]) / self._dy) + 1 if self._dy > 1e-12 else 1
        self._nx = max(3, min(self._nx, 10000))
        self._ny = max(3, min(self._ny, 10000))

    def compute_divergence(self, u: np.ndarray, v: np.ndarray) -> np.ndarray:
        nx, ny = self._nx, self._ny
        u_2d = u.reshape(nx, ny)
        v_2d = v.reshape(nx, ny)

        if pk.HAS_NUMBA:
            return pk._kernel_divergence_2d(u_2d, v_2d, self._dx, self._dy)
        else:
            return self._divergence_python(u_2d, v_2d)

    def _divergence_python(self, u: np.ndarray, v: np.ndarray) -> np.ndarray:
        nx, ny = u.shape
        div = np.zeros_like(u)
        dx, dy = self._dx, self._dy

        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                div[i, j] = np.clip(
                    (u[i+1, j] - u[i-1, j]) / (2.0 * dx)
                    + (v[i, j+1] - v[i, j-1]) / (2.0 * dy),
                    -1e8, 1e8
                )
        return div

    def solve_poisson(self, divergence: np.ndarray, max_iter: int = 50) -> np.ndarray:
        nx, ny = divergence.shape
        p_corr = np.zeros_like(divergence)

        max_jacobi_iter = min(max_iter, int(1000 / (nx * ny)) + 20)

        if pk.HAS_NUMBA:
            return pk._kernel_poisson_jacobi(p_corr, divergence, self._dx, self._dy, max_jacobi_iter)
        else:
            return self._poisson_jacobi_python(p_corr, divergence, max_jacobi_iter)

    def _poisson_jacobi_python(self, p_corr: np.ndarray, divergence: np.ndarray,
                                max_iter: int) -> np.ndarray:
        nx, ny = p_corr.shape
        p = p_corr.copy()
        dx2 = self._dx * self._dx
        dy2 = self._dy * self._dy

        for _ in range(max_iter):
            p_new = p.copy()
            for i in range(1, nx - 1):
                for j in range(1, ny - 1):
                    p_new[i, j] = np.clip(
                        0.25 * (
                            p[i+1, j] + p[i-1, j]
                            + p[i, j+1] + p[i, j-1]
                            - dx2 * divergence[i, j]
                        ),
                        -1e8, 1e8
                    )
            p = p_new

        return p

    def correct_velocity(self, u: np.ndarray, v: np.ndarray, p_corr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        nx, ny = self._nx, self._ny
        dx, dy = self._dx, self._dy

        u_2d = u.reshape(nx, ny)
        v_2d = v.reshape(nx, ny)
        p_corr_2d = p_corr.reshape(nx, ny)

        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                u_2d[i, j] -= np.clip((p_corr_2d[i+1, j] - p_corr_2d[i-1, j]) / (2.0 * dx), -1e8, 1e8)
                v_2d[i, j] -= np.clip((p_corr_2d[i, j+1] - p_corr_2d[i, j-1]) / (2.0 * dy), -1e8, 1e8)

        u_2d = np.clip(u_2d, -1e10, 1e10)
        v_2d = np.clip(v_2d, -1e10, 1e10)

        return u_2d.ravel(), v_2d.ravel()

    def solve(self, state: FluidState) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        u = state.velocity[:, 0]
        v = state.velocity[:, 1]
        p = state.pressure

        u = to_precision(u)
        v = to_precision(v)
        p = to_precision(p)

        divergence = self.compute_divergence(u, v)
        p_corr = self.solve_poisson(divergence)
        p_corr = np.clip(p_corr, -1e8, 1e8)

        u_corrected, v_corrected = self.correct_velocity(u, v, p_corr)
        p_corrected = np.clip(p + p_corr.ravel(), -1e10, 1e10)

        return u_corrected, v_corrected, p_corrected
