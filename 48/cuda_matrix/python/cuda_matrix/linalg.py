import numpy as np
from typing import Union, Tuple
from .matrix import Matrix, matmul, transpose, inverse, eig, _check_cuda


def dot(A: Union[Matrix, np.ndarray], B: Union[Matrix, np.ndarray]) -> Matrix:
    return matmul(A, B)


def T(A: Union[Matrix, np.ndarray]) -> Matrix:
    return transpose(A)


def inv(A: Union[Matrix, np.ndarray]) -> Matrix:
    return inverse(A)


def solve(A: Union[Matrix, np.ndarray], b: Union[Matrix, np.ndarray]) -> np.ndarray:
    A_inv = inverse(A)
    if isinstance(b, Matrix):
        b = b.numpy()
    if b.ndim == 1:
        b = b.reshape(-1, 1)
    result = A_inv @ b
    return result.numpy()


def det(A: Union[Matrix, np.ndarray]) -> float:
    if isinstance(A, Matrix):
        A = A.numpy()
    return np.linalg.det(A)


def norm(A: Union[Matrix, np.ndarray], ord: str = 'fro') -> float:
    if isinstance(A, Matrix):
        A = A.numpy()
    return np.linalg.norm(A, ord=ord)


def svd(A: Union[Matrix, np.ndarray]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if isinstance(A, Matrix):
        A = A.numpy()
    return np.linalg.svd(A)


def lu_decomposition(A: Union[Matrix, np.ndarray]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if isinstance(A, Matrix):
        A = A.numpy()
    n = A.shape[0]
    L = np.eye(n)
    U = np.zeros_like(A)
    P = np.eye(n)

    for col in range(n):
        pivot_row = col
        max_val = abs(A[col, col])
        for row in range(col + 1, n):
            if abs(A[row, col]) > max_val:
                max_val = abs(A[row, col])
                pivot_row = row

        if pivot_row != col:
            A[[col, pivot_row]] = A[[pivot_row, col]]
            P[[col, pivot_row]] = P[[pivot_row, col]]

        U[col, col:] = A[col, col:]
        for row in range(col + 1, n):
            factor = A[row, col] / U[col, col]
            L[row, col] = factor
            A[row, col:] -= factor * U[col, col:]

    return P, L, U


def cholesky(A: Union[Matrix, np.ndarray]) -> Matrix:
    if isinstance(A, Matrix):
        A = A.numpy()
    L = np.linalg.cholesky(A)
    return Matrix(L)
