import numpy as np
from typing import Tuple
from .solver_config import SolverConfig, FluidState
from ..mesh_generator import MeshData
from .. import precision_kernels as pk
from ..precision_kernels import PRECISION, to_precision


class MomentumSolver:
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

    def compute_time_step(self, state: FluidState) -> float:
        nu = max(self.config.viscosity / max(self.config.density, 1e-12), 1e-12)
        dt_stable = min(self._dx, self._dy) ** 2 / (4 * nu) if nu > 0 else 0.01
        dt = min(self.config.cfl_number * dt_stable, 0.1)
        return max(dt, 1e-8)

    def solve(self, state: FluidState) -> Tuple[np.ndarray, np.ndarray]:
        dx, dy = self._dx, self._dy
        nx, ny = self._nx, self._ny

        u = state.velocity[:, 0].reshape(nx, ny)
        v = state.velocity[:, 1].reshape(nx, ny)
        p = state.pressure.reshape(nx, ny)

        u = to_precision(np.clip(u, -1e10, 1e10))
        v = to_precision(np.clip(v, -1e10, 1e10))
        p = to_precision(np.clip(p, -1e10, 1e10))

        nu = max(self.config.viscosity / max(self.config.density, 1e-12), 1e-12)
        dt = self.compute_time_step(state)
        rho = max(self.config.density, 1e-12)
        gravity_y = self.config.gravity[1]
        alpha = self.config.relaxation_factor

        if pk.HAS_NUMBA:
            u_new, v_new = pk._kernel_momentum_2d(u, v, p, dx, dy, dt, nu, rho, gravity_y, alpha)
        else:
            u_new, v_new = self._solve_momentum_python(u, v, p, dx, dy, dt, nu, rho, gravity_y)

        u_new = np.clip(u_new, -1e10, 1e10)
        v_new = np.clip(v_new, -1e10, 1e10)

        u_final = alpha * u_new + (1 - alpha) * u
        v_final = alpha * v_new + (1 - alpha) * v

        return u_final.ravel(), v_final.ravel()

    def _solve_momentum_python(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
                                dx: float, dy: float, dt: float, nu: float,
                                rho: float, gravity_y: float) -> Tuple[np.ndarray, np.ndarray]:
        nx, ny = u.shape
        u_new = u.copy()
        v_new = v.copy()

        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                du_dx = (u[i+1, j] - u[i-1, j]) / (2.0 * dx)
                du_dy = (u[i, j+1] - u[i, j-1]) / (2.0 * dy)
                dp_dx = (p[i+1, j] - p[i-1, j]) / (2.0 * dx)
                d2u_dx2 = (u[i+1, j] - 2.0*u[i, j] + u[i-1, j]) / (dx * dx)
                d2u_dy2 = (u[i, j+1] - 2.0*u[i, j] + u[i, j-1]) / (dy * dy)

                u_new[i, j] = u[i, j] + dt * (
                    -u[i, j] * du_dx
                    - v[i, j] * du_dy
                    - dp_dx / rho
                    + nu * (d2u_dx2 + d2u_dy2)
                )

                dv_dx = (v[i+1, j] - v[i-1, j]) / (2.0 * dx)
                dv_dy = (v[i, j+1] - v[i, j-1]) / (2.0 * dy)
                dp_dy = (p[i, j+1] - p[i, j-1]) / (2.0 * dy)
                d2v_dx2 = (v[i+1, j] - 2.0*v[i, j] + v[i-1, j]) / (dx * dx)
                d2v_dy2 = (v[i, j+1] - 2.0*v[i, j] + v[i, j-1]) / (dy * dy)

                v_new[i, j] = v[i, j] + dt * (
                    -u[i, j] * dv_dx
                    - v[i, j] * dv_dy
                    - dp_dy / rho
                    + nu * (d2v_dx2 + d2v_dy2)
                    + gravity_y
                )

        return u_new, v_new
