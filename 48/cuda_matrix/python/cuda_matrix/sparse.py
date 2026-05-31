import numpy as np
from typing import Union, Tuple, List
from .matrix import Matrix

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


class SparseMatrixCSR:
    def __init__(self, data=None, rows=None, cols=None, row_ptr=None, col_idx=None, values=None, on_gpu=True):
        _check_cuda()

        if data is not None:
            if isinstance(data, SparseMatrixCSR):
                self._core = data._core
            elif isinstance(data, np.ndarray):
                if data.ndim != 2:
                    raise ValueError("Input must be a 2D array")
                dense = Matrix(data)
                self._core = _core.SparseMatrixCSR.from_dense(dense._core)
            elif isinstance(data, Matrix):
                self._core = _core.SparseMatrixCSR.from_dense(data._core)
            else:
                raise TypeError("Unsupported data type")
        elif row_ptr is not None and col_idx is not None and values is not None:
            if rows is None or cols is None:
                raise ValueError("rows and cols must be provided when using CSR arrays")
            self._core = _core.SparseMatrixCSR(
                rows, cols,
                np.asarray(row_ptr, dtype=np.int32),
                np.asarray(col_idx, dtype=np.int32),
                np.asarray(values, dtype=np.float32),
                on_gpu
            )
        elif rows is not None and cols is not None:
            nnz = 0
            self._core = _core.SparseMatrixCSR(rows, cols, nnz, on_gpu)
        else:
            raise ValueError("Either data or CSR arrays must be provided")

    @property
    def rows(self) -> int:
        return int(self._core.rows)

    @property
    def cols(self) -> int:
        return int(self._core.cols)

    @property
    def shape(self) -> Tuple[int, int]:
        return (self.rows, self.cols)

    @property
    def nnz(self) -> int:
        return int(self._core.nnz)

    @property
    def on_gpu(self) -> bool:
        return self._core.on_gpu

    @property
    def density(self) -> float:
        return float(self._core.density)

    def row_ptr(self) -> np.ndarray:
        return self._core.row_ptr()

    def col_idx(self) -> np.ndarray:
        return self._core.col_idx()

    def values(self) -> np.ndarray:
        return self._core.values()

    def to_cpu(self):
        self._core.to_cpu()
        return self

    def to_gpu(self):
        self._core.to_gpu()
        return self

    def to_dense(self) -> Matrix:
        result = Matrix.__new__(Matrix)
        result._core = self._core.to_dense()
        return result

    def toarray(self) -> np.ndarray:
        return self.to_dense().numpy()

    def __matmul__(self, other: Union["SparseMatrixCSR", Matrix, np.ndarray]) -> Matrix:
        if isinstance(other, SparseMatrixCSR):
            raise NotImplementedError("Sparse-Sparse multiplication not yet implemented")
        elif isinstance(other, Matrix):
            result = Matrix.__new__(Matrix)
            result._core = _core.spmm(self._core, other._core)
            return result
        elif isinstance(other, np.ndarray):
            if other.ndim == 1:
                other = other.reshape(-1, 1)
            other_mat = Matrix(other)
            result = Matrix.__new__(Matrix)
            result._core = _core.spmm(self._core, other_mat._core)
            return result
        else:
            raise TypeError(f"Unsupported type for multiplication: {type(other)}")

    def __add__(self, other: "SparseMatrixCSR") -> "SparseMatrixCSR":
        if not isinstance(other, SparseMatrixCSR):
            raise TypeError("Addition is only supported between SparseMatrixCSR instances")
        result = SparseMatrixCSR.__new__(SparseMatrixCSR)
        result._core = _core.sparse_add(self._core, other._core)
        return result

    def __repr__(self) -> str:
        return f"SparseMatrixCSR(shape={self.shape}, nnz={self.nnz}, density={self.density:.4f}, on_gpu={self.on_gpu})"

    def __str__(self) -> str:
        arr = self.toarray()
        return str(arr)

    @staticmethod
    def from_dense(dense: Union[Matrix, np.ndarray], threshold: float = 1e-6) -> "SparseMatrixCSR":
        _check_cuda()
        if isinstance(dense, np.ndarray):
            dense = Matrix(dense)
        result = SparseMatrixCSR.__new__(SparseMatrixCSR)
        result._core = _core.SparseMatrixCSR.from_dense(dense._core, threshold)
        return result

    @staticmethod
    def random(rows: int, cols: int, density: float, min_val: float = 0.0, max_val: float = 1.0, on_gpu: bool = True) -> "SparseMatrixCSR":
        _check_cuda()
        m = SparseMatrixCSR.__new__(SparseMatrixCSR)
        m._core = _core.SparseMatrixCSR.random(rows, cols, density, min_val, max_val, on_gpu)
        return m

    @staticmethod
    def identity(n: int, on_gpu: bool = True) -> "SparseMatrixCSR":
        _check_cuda()
        m = SparseMatrixCSR.__new__(SparseMatrixCSR)
        m._core = _core.SparseMatrixCSR.identity(n, on_gpu)
        return m

    @staticmethod
    def diag(diag_values: Union[np.ndarray, List[float]], on_gpu: bool = True) -> "SparseMatrixCSR":
        _check_cuda()
        if isinstance(diag_values, list):
            diag_values = np.array(diag_values, dtype=np.float32)
        m = SparseMatrixCSR.__new__(SparseMatrixCSR)
        m._core = _core.SparseMatrixCSR.diag(diag_values.astype(np.float32), on_gpu)
        return m


def spmv(A: SparseMatrixCSR, x: Union[Matrix, np.ndarray]) -> Matrix:
    _check_cuda()
    if isinstance(x, np.ndarray):
        if x.ndim == 1:
            x = x.reshape(-1, 1)
        x = Matrix(x)
    result = Matrix.__new__(Matrix)
    result._core = _core.spmv(A._core, x._core)
    return result


def spmm(A: SparseMatrixCSR, B: Union[Matrix, np.ndarray]) -> Matrix:
    _check_cuda()
    if isinstance(B, np.ndarray):
        B = Matrix(B)
    result = Matrix.__new__(Matrix)
    result._core = _core.spmm(A._core, B._core)
    return result


def sparse_transpose(A: SparseMatrixCSR) -> SparseMatrixCSR:
    _check_cuda()
    result = SparseMatrixCSR.__new__(SparseMatrixCSR)
    result._core = _core.sparse_transpose(A._core)
    return result


def sparse_add(A: SparseMatrixCSR, B: SparseMatrixCSR) -> SparseMatrixCSR:
    _check_cuda()
    result = SparseMatrixCSR.__new__(SparseMatrixCSR)
    result._core = _core.sparse_add(A._core, B._core)
    return result


def sparse_matmul_dense(A: SparseMatrixCSR, B: Union[Matrix, np.ndarray]) -> Matrix:
    return spmm(A, B)
