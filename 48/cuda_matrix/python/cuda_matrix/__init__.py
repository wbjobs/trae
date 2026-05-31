from .matrix import Matrix, matmul, transpose, inverse, eig
from .sparse import SparseMatrixCSR, spmv, spmm, sparse_transpose, sparse_add, sparse_matmul_dense
from . import linalg
from . import sparse

__version__ = "1.2.0"
__all__ = [
    "Matrix", "matmul", "transpose", "inverse", "eig", "linalg",
    "SparseMatrixCSR", "spmv", "spmm", "sparse_transpose", "sparse_add", "sparse_matmul_dense", "sparse"
]
