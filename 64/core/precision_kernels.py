import numpy as np
from typing import Tuple, Optional

try:
    from numba import jit, float64, int64
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    def jit(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

PRECISION = np.float64
EPSILON = np.finfo(PRECISION).eps
SAFE_MIN = np.finfo(PRECISION).tiny * 100


def to_precision(arr: np.ndarray) -> np.ndarray:
    if arr.dtype != PRECISION:
        return arr.astype(PRECISION, copy=False)
    return arr


def safe_divide(numerator: np.ndarray, denominator: np.ndarray,
                 default: float = 0.0) -> np.ndarray:
    denom_safe = np.where(np.abs(denominator) < SAFE_MIN, SAFE_MIN, denominator)
    result = numerator / denom_safe
    return np.where(np.abs(denominator) < SAFE_MIN, default, result)


def safe_log(arr: np.ndarray, min_val: float = SAFE_MIN) -> np.ndarray:
    return np.log(np.maximum(arr, min_val))


def safe_sqrt(arr: np.ndarray) -> np.ndarray:
    return np.sqrt(np.maximum(arr, 0.0))


@jit(nopython=True, fastmath=False)
def _kernel_momentum_2d(u: np.ndarray, v: np.ndarray, p: np.ndarray,
                        dx: float, dy: float, dt: float, nu: float,
                        rho: float, gravity_y: float,
                        alpha: float) -> Tuple[np.ndarray, np.ndarray]:
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


@jit(nopython=True, fastmath=False)
def _kernel_poisson_jacobi(p_corr: np.ndarray, divergence: np.ndarray,
                           dx: float, dy: float, max_iter: int) -> np.ndarray:
    nx, ny = p_corr.shape
    p = p_corr.copy()
    dx2 = dx * dx
    dy2 = dy * dy

    for _ in range(max_iter):
        p_new = p.copy()
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                p_new[i, j] = 0.25 * (
                    p[i+1, j] + p[i-1, j]
                    + p[i, j+1] + p[i, j-1]
                    - dx2 * divergence[i, j]
                )
        p = p_new

    return p


@jit(nopython=True, fastmath=False)
def _kernel_divergence_2d(u: np.ndarray, v: np.ndarray,
                           dx: float, dy: float) -> np.ndarray:
    nx, ny = u.shape
    div = np.zeros_like(u)

    for i in range(1, nx - 1):
        for j in range(1, ny - 1):
            div[i, j] = (
                (u[i+1, j] - u[i-1, j]) / (2.0 * dx)
                + (v[i, j+1] - v[i, j-1]) / (2.0 * dy)
            )

    return div


@jit(nopython=True, fastmath=False)
def _kernel_energy_2d(T: np.ndarray, u: np.ndarray, v: np.ndarray,
                       dx: float, dy: float, dt: float,
                       alpha: float) -> np.ndarray:
    nx, ny = T.shape
    T_new = T.copy()

    for i in range(1, nx - 1):
        for j in range(1, ny - 1):
            dT_dx = (T[i+1, j] - T[i-1, j]) / (2.0 * dx)
            dT_dy = (T[i, j+1] - T[i, j-1]) / (2.0 * dy)
            d2T_dx2 = (T[i+1, j] - 2.0*T[i, j] + T[i-1, j]) / (dx * dx)
            d2T_dy2 = (T[i, j+1] - 2.0*T[i, j] + T[i, j-1]) / (dy * dy)

            T_new[i, j] = T[i, j] + dt * (
                -u[i, j] * dT_dx
                - v[i, j] * dT_dy
                + alpha * (d2T_dx2 + d2T_dy2)
            )

    return T_new


def compute_velocity_gradients(u: np.ndarray, v: np.ndarray,
                                dx: float, dy: float) -> Tuple[np.ndarray, np.ndarray,
                                                              np.ndarray, np.ndarray]:
    u = to_precision(u)
    v = to_precision(v)

    du_dx = np.gradient(u, dx, axis=0)
    du_dy = np.gradient(u, dy, axis=1)
    dv_dx = np.gradient(v, dx, axis=0)
    dv_dy = np.gradient(v, dy, axis=1)

    return du_dx, du_dy, dv_dx, dv_dy


def compute_vorticity(u: np.ndarray, v: np.ndarray,
                       dx: float, dy: float) -> np.ndarray:
    du_dx, du_dy, dv_dx, dv_dy = compute_velocity_gradients(u, v, dx, dy)
    return dv_dx - du_dy


def compute_strain_rate(u: np.ndarray, v: np.ndarray,
                         dx: float, dy: float) -> np.ndarray:
    du_dx, du_dy, dv_dx, dv_dy = compute_velocity_gradients(u, v, dx, dy)
    return np.sqrt(2.0 * (du_dx**2 + dv_dy**2) + (du_dy + dv_dx)**2)


def compute_kinetic_energy(u: np.ndarray, v: np.ndarray,
                            rho: float = 1.0) -> np.ndarray:
    u = to_precision(u)
    v = to_precision(v)
    return 0.5 * rho * (u**2 + v**2)


def compute_residual_fields(u_new: np.ndarray, u_old: np.ndarray,
                             v_new: np.ndarray, v_old: np.ndarray,
                             p_new: np.ndarray, p_old: np.ndarray) -> Tuple[float, float, float]:
    u_res = np.max(np.abs(u_new - u_old))
    v_res = np.max(np.abs(v_new - v_old))
    p_res = np.max(np.abs(p_new - p_old))
    return float(u_res), float(v_res), float(p_res)


def kahan_sum(arr: np.ndarray) -> float:
    s = PRECISION(0.0)
    c = PRECISION(0.0)
    for x in arr.ravel():
        y = PRECISION(x) - c
        t = s + y
        c = (t - s) - y
        s = t
    return float(s)


def compensated_summation(arr: np.ndarray) -> float:
    s = PRECISION(0.0)
    c = PRECISION(0.0)
    for x in arr.ravel():
        x = PRECISION(x)
        t = s + x
        if np.abs(s) >= np.abs(x):
            c += (s - t) + x
        else:
            c += (x - t) + s
        s = t
    return float(s + c)


def mean_precise(arr: np.ndarray) -> float:
    if arr.size == 0:
        return 0.0
    return kahan_sum(arr) / arr.size


def get_precision_info() -> Dict:
    return {
        "precision": "float64",
        "epsilon": float(EPSILON),
        "safe_min": float(SAFE_MIN),
        "max_float": float(np.finfo(PRECISION).max),
        "numba_enabled": HAS_NUMBA
    }
