import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Callable, Optional, Union
from enum import Enum


class PrecisionMode(Enum):
    """精度模式"""
    SINGLE = "single"
    DOUBLE = "double"
    EXTENDED = "extended"
    QUAD = "quad"
    ARBITRARY = "arbitrary"


class SummationMethod(Enum):
    """求和方法"""
    NAIVE = "naive"
    KAHAN = "kahan"
    PAIRWISE = "pairwise"
    COMPENSATED = "compensated"


class VectorizationMode(Enum):
    """向量化模式"""
    SCALAR = "scalar"
    VECTORIZED = "vectorized"
    BATCH = "batch"


@dataclass
class KernelConfig:
    """内核配置"""
    precision_mode: PrecisionMode = PrecisionMode.DOUBLE
    summation_method: SummationMethod = SummationMethod.KAHAN
    vectorization_mode: VectorizationMode = VectorizationMode.VECTORIZED
    enable_fma: bool = True
    enable_compensated: bool = True
    max_relative_error: float = 1e-15
    min_denominator: float = 1e-300


def get_dtype(config: KernelConfig) -> np.dtype:
    """根据精度模式获取numpy数据类型"""
    if config.precision_mode == PrecisionMode.SINGLE:
        return np.float32
    elif config.precision_mode == PrecisionMode.DOUBLE:
        return np.float64
    elif config.precision_mode == PrecisionMode.EXTENDED:
        return np.float128
    else:
        return np.float64


def safe_divide(
    numerator: np.ndarray,
    denominator: np.ndarray,
    default: float = 0.0,
    min_denominator: float = 1e-300
) -> np.ndarray:
    """安全除法，避免除以零"""
    numerator = np.asarray(numerator)
    denominator = np.asarray(denominator)
    
    safe_denom = np.where(
        np.abs(denominator) < min_denominator,
        np.sign(denominator) * min_denominator + np.where(denominator == 0, 1.0, 0.0),
        denominator
    )
    
    result = numerator / safe_denom
    
    result = np.where(
        np.abs(denominator) < min_denominator,
        default,
        result
    )
    
    return result


def kahan_summation(values: np.ndarray) -> float:
    """Kahan求和算法，减少浮点误差累积"""
    values = np.asarray(values, dtype=np.float128)
    s = np.float128(0.0)
    c = np.float128(0.0)
    
    for v in values:
        y = v - c
        t = s + y
        c = (t - s) - y
        s = t
    
    return float(s)


def pairwise_summation(values: np.ndarray) -> float:
    """成对求和算法"""
    values = np.asarray(values)
    
    if len(values) == 1:
        return float(values[0])
    elif len(values) == 2:
        return float(values[0] + values[1])
    else:
        mid = len(values) // 2
        return pairwise_summation(values[:mid]) + pairwise_summation(values[mid:])


def compensated_summation(values: np.ndarray) -> Tuple[float, float]:
    """补偿求和（Ogita-Rump-Oishi），返回和与误差估计"""
    values = np.asarray(values, dtype=np.float128)
    s = np.float128(0.0)
    c = np.float128(0.0)
    
    for x in values:
        p = s + x
        if abs(s) >= abs(x):
            c += (s - p) + x
        else:
            c += (x - p) + s
        s = p
    
    return float(s), float(c)


def dot_product_high_precision(
    a: np.ndarray,
    b: np.ndarray,
    method: SummationMethod = SummationMethod.KAHAN
) -> float:
    """高精度点积计算"""
    a = np.asarray(a)
    b = np.asarray(b)
    
    products = a * b
    
    if method == SummationMethod.NAIVE:
        return float(np.sum(products))
    elif method == SummationMethod.KAHAN:
        return kahan_summation(products)
    elif method == SummationMethod.PAIRWISE:
        return pairwise_summation(products)
    elif method == SummationMethod.COMPENSATED:
        s, _ = compensated_summation(products)
        return s
    else:
        return float(np.sum(products))


def vector_norm_high_precision(
    v: np.ndarray,
    order: int = 2,
    method: SummationMethod = SummationMethod.KAHAN
) -> float:
    """高精度向量范数计算"""
    v = np.asarray(v, dtype=np.float128)
    
    if order == 2:
        return np.sqrt(dot_product_high_precision(v, v, method))
    elif order == 1:
        abs_v = np.abs(v)
        if method == SummationMethod.NAIVE:
            return float(np.sum(abs_v))
        elif method == SummationMethod.KAHAN:
            return kahan_summation(abs_v)
        elif method == SummationMethod.PAIRWISE:
            return pairwise_summation(abs_v)
        else:
            return float(np.sum(abs_v))
    elif order == np.inf:
        return float(np.max(np.abs(v)))
    else:
        abs_v_pow = np.power(np.abs(v), order)
        if method == SummationMethod.NAIVE:
            s = np.sum(abs_v_pow)
        elif method == SummationMethod.KAHAN:
            s = kahan_summation(abs_v_pow)
        else:
            s = np.sum(abs_v_pow)
        return float(np.power(s, 1.0 / order))


def matrix_multiply_high_precision(
    A: np.ndarray,
    B: np.ndarray,
    use_fma: bool = True
) -> np.ndarray:
    """高精度矩阵乘法"""
    A = np.asarray(A, dtype=np.float128)
    B = np.asarray(B, dtype=np.float128)
    
    if A.ndim == 1:
        A = A.reshape(1, -1)
    if B.ndim == 1:
        B = B.reshape(-1, 1)
    
    m, k1 = A.shape
    k2, n = B.shape
    
    if k1 != k2:
        raise ValueError(f"矩阵维度不匹配: {A.shape} x {B.shape}")
    
    result = np.zeros((m, n), dtype=np.float128)
    
    for i in range(m):
        for j in range(n):
            s = np.float128(0.0)
            c = np.float128(0.0)
            for l in range(k1):
                if use_fma:
                    y = A[i, l] * B[l, j] - c
                    t = s + y
                    c = (t - s) - y
                    s = t
                else:
                    y = A[i, l] * B[l, j] - c
                    t = s + y
                    c = (t - s) - y
                    s = t
            result[i, j] = s
    
    return result.astype(np.float64)


def cross_product_high_precision(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """高精度叉积计算"""
    a = np.asarray(a, dtype=np.float128)
    b = np.asarray(b, dtype=np.float128)
    
    if a.shape != (3,) or b.shape != (3,):
        raise ValueError("叉积需要3维向量")
    
    result = np.array([
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ], dtype=np.float128)
    
    return result.astype(np.float64)


def normalize_vector(v: np.ndarray, min_norm: float = 1e-15) -> np.ndarray:
    """安全归一化向量"""
    v = np.asarray(v, dtype=np.float64)
    norm = np.linalg.norm(v)
    
    if norm < min_norm:
        return np.zeros_like(v)
    
    return v / norm


def robust_sqrt(x: np.ndarray, min_value: float = 0.0) -> np.ndarray:
    """安全平方根，避免负数"""
    x = np.asarray(x, dtype=np.float64)
    x_safe = np.maximum(x, min_value)
    return np.sqrt(x_safe)


def robust_acos(x: np.ndarray) -> np.ndarray:
    """安全反余弦，限制输入范围到[-1, 1]"""
    x = np.asarray(x, dtype=np.float64)
    x_clipped = np.clip(x, -1.0 + 1e-15, 1.0 - 1e-15)
    return np.arccos(x_clipped)


def robust_asin(x: np.ndarray) -> np.ndarray:
    """安全反正弦，限制输入范围到[-1, 1]"""
    x = np.asarray(x, dtype=np.float64)
    x_clipped = np.clip(x, -1.0 + 1e-15, 1.0 - 1e-15)
    return np.arcsin(x_clipped)


def compute_jacobian(
    func: Callable[[np.ndarray], np.ndarray],
    x: np.ndarray,
    eps: float = 1e-8
) -> np.ndarray:
    """数值计算雅可比矩阵"""
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    
    f0 = func(x)
    m = len(f0)
    
    jacobian = np.zeros((m, n), dtype=np.float64)
    
    for i in range(n):
        x_plus = x.copy()
        x_plus[i] += eps
        f_plus = func(x_plus)
        
        x_minus = x.copy()
        x_minus[i] -= eps
        f_minus = func(x_minus)
        
        jacobian[:, i] = (f_plus - f_minus) / (2 * eps)
    
    return jacobian


def compute_hessian(
    func: Callable[[np.ndarray], float],
    x: np.ndarray,
    eps: float = 1e-6
) -> np.ndarray:
    """数值计算海森矩阵"""
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    
    hessian = np.zeros((n, n), dtype=np.float64)
    
    for i in range(n):
        for j in range(i, n):
            x_pp = x.copy()
            x_pp[i] += eps
            x_pp[j] += eps
            f_pp = func(x_pp)
            
            x_pm = x.copy()
            x_pm[i] += eps
            x_pm[j] -= eps
            f_pm = func(x_pm)
            
            x_mp = x.copy()
            x_mp[i] -= eps
            x_mp[j] += eps
            f_mp = func(x_mp)
            
            x_mm = x.copy()
            x_mm[i] -= eps
            x_mm[j] -= eps
            f_mm = func(x_mm)
            
            hessian[i, j] = (f_pp - f_pm - f_mp + f_mm) / (4 * eps * eps)
            hessian[j, i] = hessian[i, j]
    
    return hessian


def condition_number(matrix: np.ndarray) -> float:
    """计算矩阵条件数"""
    matrix = np.asarray(matrix, dtype=np.float64)
    
    try:
        u, s, vh = np.linalg.svd(matrix)
        if s[-1] < 1e-15:
            return np.inf
        return float(s[0] / s[-1])
    except np.linalg.LinAlgError:
        return np.inf


class HighPrecisionAccumulator:
    """高精度累加器"""
    
    def __init__(self, dtype=np.float128):
        self.dtype = dtype
        self._sum = np.zeros(3, dtype=dtype)
        self._compensation = np.zeros(3, dtype=dtype)
    
    def add(self, value: np.ndarray):
        """添加值"""
        value = np.asarray(value, dtype=self.dtype)
        y = value - self._compensation
        t = self._sum + y
        self._compensation = (t - self._sum) - y
        self._sum = t
    
    def add_many(self, values: List[np.ndarray]):
        """批量添加"""
        for v in values:
            self.add(v)
    
    def sum(self) -> np.ndarray:
        """获取总和"""
        return self._sum.astype(np.float64)
    
    def reset(self):
        """重置累加器"""
        self._sum = np.zeros(3, dtype=self.dtype)
        self._compensation = np.zeros(3, dtype=self.dtype)


class HighPrecisionOrbitKernel:
    """高精度轨道计算内核"""
    
    def __init__(self, config: Optional[KernelConfig] = None):
        self.config = config or KernelConfig()
        self.accumulator = HighPrecisionAccumulator()
    
    def compute_acceleration_sum(
        self,
        accelerations: List[np.ndarray],
        method: Optional[SummationMethod] = None
    ) -> np.ndarray:
        """高精度加速度求和"""
        if method is None:
            method = self.config.summation_method
        
        if len(accelerations) == 0:
            return np.zeros(3, dtype=np.float64)
        
        acc_matrix = np.array(accelerations, dtype=np.float128)
        
        if method == SummationMethod.NAIVE:
            result = np.sum(acc_matrix, axis=0)
        elif method == SummationMethod.KAHAN:
            result = np.array([
                kahan_summation(acc_matrix[:, i])
                for i in range(3)
            ])
        elif method == SummationMethod.PAIRWISE:
            result = np.array([
                pairwise_summation(acc_matrix[:, i])
                for i in range(3)
            ])
        elif method == SummationMethod.COMPENSATED:
            result = np.array([
                compensated_summation(acc_matrix[:, i])[0]
                for i in range(3)
            ])
        else:
            result = np.sum(acc_matrix, axis=0)
        
        return result.astype(np.float64)
    
    def compute_state_transition_matrix(
        self,
        state: np.ndarray,
        dt: float,
        derivative_func: Callable[[np.ndarray], np.ndarray]
    ) -> np.ndarray:
        """计算状态转移矩阵"""
        n = len(state)
        phi = np.eye(n, dtype=np.float64)
        
        k1 = derivative_func(state)
        k2 = derivative_func(state + 0.5 * dt * k1)
        k3 = derivative_func(state + 0.5 * dt * k2)
        k4 = derivative_func(state + dt * k3)
        
        derivative = (k1 + 2*k2 + 2*k3 + k4) / 6.0
        
        for i in range(n):
            perturbed = state.copy()
            perturbed[i] += 1e-8
            
            dp_k1 = derivative_func(perturbed)
            dp_k2 = derivative_func(perturbed + 0.5 * dt * dp_k1)
            dp_k3 = derivative_func(perturbed + 0.5 * dt * dp_k2)
            dp_k4 = derivative_func(perturbed + dt * dp_k3)
            
            dp_derivative = (dp_k1 + 2*dp_k2 + 2*dp_k3 + dp_k4) / 6.0
            phi[:, i] += dt * (dp_derivative - derivative) / 1e-8
        
        return phi
    
    def estimate_roundoff_error(self, values: np.ndarray) -> float:
        """估计舍入误差"""
        values = np.asarray(values)
        n = len(values)
        
        if n < 2:
            return 0.0
        
        kahan_sum = kahan_summation(values)
        naive_sum = float(np.sum(values))
        
        return abs(kahan_sum - naive_sum)
    
    def check_numerical_stability(self, matrix: np.ndarray) -> Dict[str, Any]:
        """检查数值稳定性"""
        matrix = np.asarray(matrix)
        
        cond = condition_number(matrix)
        det = np.linalg.det(matrix) if matrix.shape[0] == matrix.shape[1] else None
        rank = np.linalg.matrix_rank(matrix)
        
        return {
            'condition_number': cond,
            'determinant': det,
            'rank': rank,
            'is_ill_conditioned': cond > 1e10,
            'is_singular': det is not None and abs(det) < 1e-15
        }
