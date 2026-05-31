import numpy as np
from .solver_config import SolverConfig, FluidState
from ..mesh_generator import MeshData
from .. import precision_kernels as pk
from ..precision_kernels import PRECISION, to_precision


class EnergySolver:
    def __init__(self, mesh: MeshData, config: SolverConfig):
        self.mesh = mesh
        self.config = config
        self._nx = 0
        self._ny = 0
        self._dx = 0.0
        self._dy = 0.0
        self.thermal_diffusivity: float = 1e-5
        self._init_grid()

    def _init_grid(self):
        self._dx = max(self.mesh.dx, 1e-12)
        self._dy = max(self.mesh.dy, 1e-12)
        self._nx = int((self.mesh.nodes[-1, 0] - self.mesh.nodes[0, 0]) / self._dx) + 1 if self._dx > 1e-12 else 1
        self._ny = int((self.mesh.nodes[-1, 1] - self.mesh.nodes[0, 1]) / self._dy) + 1 if self._dy > 1e-12 else 1
        self._nx = max(3, min(self._nx, 10000))
        self._ny = max(3, min(self._ny, 10000))

    def compute_time_step(self) -> float:
        alpha = max(self.thermal_diffusivity, 1e-12)
        dt_stable = min(self._dx, self._dy) ** 2 / (4 * alpha) if alpha > 0 else 0.01
        dt = min(self.config.cfl_number * dt_stable, 0.1)
        return max(dt, 1e-8)

    def solve(self, state: FluidState) -> np.ndarray:
        if state.temperature is None:
            return np.array([])

        nx, ny = self._nx, self._ny
        dx, dy = self._dx, self._dy

        T = state.temperature.reshape(nx, ny)
        u = state.velocity[:, 0].reshape(nx, ny)
        v = state.velocity[:, 1].reshape(nx, ny)

        T = to_precision(np.clip(T, 0.0, 1e6))
        u = to_precision(np.clip(u, -1e10, 1e10))
        v = to_precision(np.clip(v, -1e10, 1e10))

        alpha = max(self.thermal_diffusivity, 1e-12)
        dt = self.compute_time_step()
        relax = self.config.relaxation_factor

        if pk.HAS_NUMBA:
            T_new = pk._kernel_energy_2d(T, u, v, dx, dy, dt, alpha)
        else:
            T_new = self._energy_python(T, u, v, dx, dy, dt, alpha)

        T_new = np.clip(T_new, 0.0, 1e6)
        T_final = relax * T_new + (1 - relax) * T

        return np.clip(T_final.ravel(), 0.0, 1e6)

    def _energy_python(self, T: np.ndarray, u: np.ndarray, v: np.ndarray,
                        dx: float, dy: float, dt: float, alpha: float) -> np.ndarray:
        nx, ny = T.shape
        T_new = T.copy()

        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                dT_dx = (T[i+1, j] - T[i-1, j]) / (2.0 * dx)
                dT_dy = (T[i, j+1] - T[i, j-1]) / (2.0 * dy)
                d2T_dx2 = (T[i+1, j] - 2.0*T[i, j] + T[i-1, j]) / (dx * dx)
                d2T_dy2 = (T[i, j+1] - 2.0*T[i, j] + T[i, j-1]) / (dy * dy)

                T_new[i, j] = np.clip(
                    T[i, j] + dt * (
                        -u[i, j] * dT_dx
                        - v[i, j] * dT_dy
                        + alpha * (d2T_dx2 + d2T_dy2)
                    ),
                    0.0, 1e6
                )

        return T_new
