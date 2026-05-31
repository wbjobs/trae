import numpy as np
from typing import Union, Tuple, List

try:
    from . import _cuda_matrix_core as _core
    _HAS_CUDA = True
except ImportError:
    _HAS_CUDA = False
    _core = None


def _check_cuda():
    if not _HAS_CUDA:
        raise RuntimeError(
            "CUDA extension not available. Please build the library with CUDA support."
        )


class Matrix:
    def __init__(self, data: Union[np.ndarray, "Matrix", List[List[float]], None] = None,
                 rows: int = None, cols: int = None, on_gpu: bool = True):
        _check_cuda()

        if data is not None:
            if isinstance(data, Matrix):
                self._core = data._core
            elif isinstance(data, np.ndarray):
                if data.ndim != 2:
                    raise ValueError("Input must be a 2D array")
                rows = data.shape[0]
                cols = data.shape[1]
                self._core = _core.Matrix(rows, cols, data.astype(np.float32), on_gpu)
            elif isinstance(data, list):
                arr = np.array(data, dtype=np.float32)
                if arr.ndim != 2:
                    raise ValueError("Input must be a 2D list")
                rows = arr.shape[0]
                cols = arr.shape[1]
                self._core = _core.Matrix(rows, cols, arr, on_gpu)
            else:
                raise TypeError("Unsupported data type")
        elif rows is not None and cols is not None:
            self._core = _core.Matrix(rows, cols, on_gpu)
        else:
            raise ValueError("Either data or (rows, cols) must be provided")

    @property
    def rows(self) -> int:
        return self._core.rows

    @property
    def cols(self) -> int:
        return self._core.cols

    @property
    def shape(self) -> Tuple[int, int]:
        return (int(self._core.rows), int(self._core.cols))

    @property
    def size(self) -> int:
        return int(self._core.size)

    @property
    def on_gpu(self) -> bool:
        return self._core.on_gpu

    def to_cpu(self):
        self._core.to_cpu()
        return self

    def to_gpu(self):
        self._core.to_gpu()
        return self

    def numpy(self) -> np.ndarray:
        return self._core.numpy()

    def __matmul__(self, other: "Matrix") -> "Matrix":
        if not isinstance(other, Matrix):
            other = Matrix(other)
        result = matmul(self, other)
        return result

    def __repr__(self) -> str:
        return f"Matrix(shape={self.shape}, on_gpu={self.on_gpu})"

    def __str__(self) -> str:
        arr = self.numpy()
        return str(arr)

    @staticmethod
    def zeros(rows: int, cols: int, on_gpu: bool = True) -> "Matrix":
        _check_cuda()
        m = Matrix.__new__(Matrix)
        m._core = _core.Matrix.zeros(rows, cols, on_gpu)
        return m

    @staticmethod
    def ones(rows: int, cols: int, on_gpu: bool = True) -> "Matrix":
        _check_cuda()
        m = Matrix.__new__(Matrix)
        m._core = _core.Matrix.ones(rows, cols, on_gpu)
        return m

    @staticmethod
    def identity(n: int, on_gpu: bool = True) -> "Matrix":
        _check_cuda()
        m = Matrix.__new__(Matrix)
        m._core = _core.Matrix.identity(n, on_gpu)
        return m

    @staticmethod
    def random(rows: int, cols: int, min_val: float = 0.0, max_val: float = 1.0,
               on_gpu: bool = True) -> "Matrix":
        _check_cuda()
        m = Matrix.__new__(Matrix)
        m._core = _core.Matrix.random(rows, cols, min_val, max_val, on_gpu)
        return m

    @staticmethod
    def get_available_gpu_memory() -> int:
        _check_cuda()
        return int(_core.Matrix.get_available_gpu_memory())

    @staticmethod
    def get_total_gpu_memory() -> int:
        _check_cuda()
        return int(_core.Matrix.get_total_gpu_memory())


def matmul(A: Union[Matrix, np.ndarray], B: Union[Matrix, np.ndarray]) -> Matrix:
    _check_cuda()
    if not isinstance(A, Matrix):
        A = Matrix(A)
    if not isinstance(B, Matrix):
        B = Matrix(B)
    result = Matrix.__new__(Matrix)
    result._core = _core.matmul(A._core, B._core)
    return result


def transpose(A: Union[Matrix, np.ndarray]) -> Matrix:
    _check_cuda()
    if not isinstance(A, Matrix):
        A = Matrix(A)
    result = Matrix.__new__(Matrix)
    result._core = _core.transpose(A._core)
    return result


def inverse(A: Union[Matrix, np.ndarray]) -> Matrix:
    _check_cuda()
    if not isinstance(A, Matrix):
        A = Matrix(A)
    result = Matrix.__new__(Matrix)
    result._core = _core.inverse(A._core)
    return result


def eig(A: Union[Matrix, np.ndarray], max_iter: int = 1000, tol: float = 1e-6) -> Tuple[np.ndarray, Matrix]:
    _check_cuda()
    if not isinstance(A, Matrix):
        A = Matrix(A)
    eigenvalues, eigenvectors_core = _core.eigenvalues(A._core, max_iter, tol)
    eigenvectors = Matrix.__new__(Matrix)
    eigenvectors._core = eigenvectors_core
    return np.array(eigenvalues), eigenvectors
