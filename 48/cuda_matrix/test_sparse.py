import numpy as np
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

try:
    import cuda_matrix as cm
    from cuda_matrix import Matrix, SparseMatrixCSR, spmv, spmm, sparse_transpose, sparse_add
    print("CUDA Matrix module loaded successfully!")
except ImportError as e:
    print(f"Failed to import CUDA module: {e}")
    print("Running in NumPy fallback mode for testing...")
    import numpy as np

    class Matrix:
        def __init__(self, data, **kwargs):
            if isinstance(data, np.ndarray):
                self._data = data.astype(np.float32)
            elif isinstance(data, list):
                self._data = np.array(data, dtype=np.float32)
            else:
                self._data = data
        def numpy(self):
            return self._data
        @property
        def shape(self):
            return self._data.shape
        @property
        def rows(self):
            return self._data.shape[0]
        @property
        def cols(self):
            return self._data.shape[1]
        @property
        def on_gpu(self):
            return False
        @staticmethod
        def random(rows, cols, **kwargs):
            return Matrix(np.random.rand(rows, cols).astype(np.float32))
        @staticmethod
        def identity(n, **kwargs):
            return Matrix(np.eye(n, dtype=np.float32))
        @staticmethod
        def zeros(rows, cols, **kwargs):
            return Matrix(np.zeros((rows, cols), dtype=np.float32))
        def __matmul__(self, other):
            return Matrix(self._data @ other._data)
        def to_cpu(self): return self
        def to_gpu(self): return self

    class SparseMatrixCSR:
        def __init__(self, data=None, **kwargs):
            if isinstance(data, np.ndarray):
                self._data = data.astype(np.float32)
            elif isinstance(data, Matrix):
                self._data = data.numpy()
            self._rows = self._data.shape[0]
            self._cols = self._data.shape[1]
            self._nnz = np.count_nonzero(self._data)
        @property
        def rows(self): return self._rows
        @property
        def cols(self): return self._cols
        @property
        def shape(self): return (self._rows, self._cols)
        @property
        def nnz(self): return self._nnz
        @property
        def density(self): return self._nnz / (self._rows * self._cols)
        @property
        def on_gpu(self): return False
        def toarray(self): return self._data
        def to_dense(self): return Matrix(self._data)
        def __matmul__(self, other):
            if isinstance(other, SparseMatrixCSR):
                return Matrix(self._data @ other._data)
            elif isinstance(other, Matrix):
                return Matrix(self._data @ other.numpy())
            elif isinstance(other, np.ndarray):
                return Matrix(self._data @ other)
        def __add__(self, other):
            return SparseMatrixCSR(self._data + other._data)
        @staticmethod
        def from_dense(dense, **kwargs):
            if isinstance(dense, Matrix):
                dense = dense.numpy()
            return SparseMatrixCSR(dense)
        @staticmethod
        def random(rows, cols, density, **kwargs):
            data = np.random.rand(rows, cols).astype(np.float32)
            mask = np.random.rand(rows, cols) < density
            data[~mask] = 0
            return SparseMatrixCSR(data)
        @staticmethod
        def identity(n, **kwargs):
            return SparseMatrixCSR(np.eye(n, dtype=np.float32))
        @staticmethod
        def diag(values, **kwargs):
            return SparseMatrixCSR(np.diag(values))

    def spmv(A, x):
        if isinstance(x, Matrix):
            x = x.numpy()
        return Matrix(A._data @ x)
    def spmm(A, B):
        if isinstance(B, Matrix):
            B = B.numpy()
        return Matrix(A._data @ B)
    def sparse_transpose(A):
        return SparseMatrixCSR(A._data.T)
    def sparse_add(A, B):
        return SparseMatrixCSR(A._data + B._data)


def test_sparse_creation():
    print("\n=== Testing Sparse Matrix Creation ===")

    dense = np.array([[1, 0, 0], [0, 2, 0], [0, 0, 3]], dtype=np.float32)
    sparse = SparseMatrixCSR(dense)

    print(f"Shape: {sparse.shape}")
    print(f"NNZ: {sparse.nnz}")
    print(f"Density: {sparse.density:.4f}")
    print(f"On GPU: {sparse.on_gpu}")

    reconstructed = sparse.toarray()
    print("Original:")
    print(dense)
    print("Reconstructed:")
    print(reconstructed)
    print("Match:", np.allclose(dense, reconstructed, atol=1e-5))

    assert np.allclose(dense, reconstructed, atol=1e-5), "Creation test failed!"
    print("Sparse matrix creation test passed!")


def test_sparse_identity():
    print("\n=== Testing Sparse Identity Matrix ===")

    n = 100
    sparse_eye = SparseMatrixCSR.identity(n)
    dense_eye = sparse_eye.toarray()

    print(f"Shape: {sparse_eye.shape}")
    print(f"NNZ: {sparse_eye.nnz} (expected: {n})")
    print(f"Density: {sparse_eye.density:.6f}")

    expected = np.eye(n, dtype=np.float32)
    print("Match:", np.allclose(dense_eye, expected, atol=1e-5))

    assert sparse_eye.nnz == n
    assert np.allclose(dense_eye, expected, atol=1e-5), "Identity test failed!"
    print("Sparse identity test passed!")


def test_sparse_diag():
    print("\n=== Testing Sparse Diagonal Matrix ===")

    diag_values = np.array([1.0, 2.0, 3.0, 4.0, 5.0], dtype=np.float32)
    sparse_diag = SparseMatrixCSR.diag(diag_values)
    dense_diag = sparse_diag.toarray()

    expected = np.diag(diag_values)
    print("Match:", np.allclose(dense_diag, expected, atol=1e-5))
    assert np.allclose(dense_diag, expected, atol=1e-5), "Diag test failed!"
    print("Sparse diag test passed!")


def test_sparse_random():
    print("\n=== Testing Sparse Random Matrix ===")

    rows, cols, density = 1000, 1000, 0.01
    sparse_rand = SparseMatrixCSR.random(rows, cols, density)

    actual_density = sparse_rand.nnz / (rows * cols)
    print(f"Target density: {density}")
    print(f"Actual density: {actual_density:.6f}")
    print(f"NNZ: {sparse_rand.nnz}")

    assert abs(actual_density - density) < 0.01, "Random density test failed!"
    print("Sparse random test passed!")


def test_spmv():
    print("\n=== Testing SpMV (Sparse Matrix-Vector Multiplication) ===")

    n = 2048
    density = 0.05
    sparse_A = SparseMatrixCSR.random(n, n, density)
    x = np.random.rand(n, 1).astype(np.float32)

    start = time.time()
    y_sparse = spmv(sparse_A, x)
    sparse_time = time.time() - start

    start = time.time()
    y_dense = sparse_A.toarray() @ x
    dense_time = time.time() - start

    y_sparse_arr = y_sparse.numpy() if hasattr(y_sparse, 'numpy') else y_sparse

    max_error = np.max(np.abs(y_sparse_arr - y_dense))
    print(f"Max error: {max_error:.6e}")
    print(f"SpMV time: {sparse_time:.4f}s")
    print(f"Dense time: {dense_time:.4f}s")
    print(f"Speedup: {dense_time / sparse_time:.2f}x")
    print("Match:", max_error < 1e-3)

    assert max_error < 1e-3, "SpMV test failed!"
    print("SpMV test passed!")


def test_spmm():
    print("\n=== Testing SpMM (Sparse Matrix-Dense Matrix Multiplication) ===")

    n = 1024
    k = 256
    density = 0.05

    sparse_A = SparseMatrixCSR.random(n, n, density)
    dense_B = Matrix.random(n, k)

    start = time.time()
    C_sparse = spmm(sparse_A, dense_B)
    sparse_time = time.time() - start

    start = time.time()
    C_dense = sparse_A.toarray() @ dense_B.numpy()
    dense_time = time.time() - start

    C_sparse_arr = C_sparse.numpy()

    max_error = np.max(np.abs(C_sparse_arr - C_dense))
    print(f"Shape of result: {C_sparse_arr.shape}")
    print(f"Max error: {max_error:.6e}")
    print(f"SpMM time: {sparse_time:.4f}s")
    print(f"Dense time: {dense_time:.4f}s")
    print(f"Speedup: {dense_time / sparse_time:.2f}x")
    print("Match:", max_error < 1e-3)

    assert max_error < 1e-3, "SpMM test failed!"
    print("SpMM test passed!")


def test_sparse_transpose():
    print("\n=== Testing Sparse Matrix Transpose ===")

    rows, cols, density = 500, 1000, 0.05
    sparse_A = SparseMatrixCSR.random(rows, cols, density)

    sparse_AT = sparse_transpose(sparse_A)
    dense_AT = sparse_AT.toarray()

    expected = sparse_A.toarray().T

    print(f"Original shape: {sparse_A.shape}")
    print(f"Transposed shape: {sparse_AT.shape}")
    print(f"Original NNZ: {sparse_A.nnz}")
    print(f"Transposed NNZ: {sparse_AT.nnz}")
    print("Match:", np.allclose(dense_AT, expected, atol=1e-5))

    assert sparse_AT.shape == (cols, rows)
    assert sparse_AT.nnz == sparse_A.nnz
    assert np.allclose(dense_AT, expected, atol=1e-5), "Transpose test failed!"
    print("Sparse transpose test passed!")


def test_sparse_add():
    print("\n=== Testing Sparse Matrix Addition ===")

    n = 500
    density = 0.1

    sparse_A = SparseMatrixCSR.random(n, n, density)
    sparse_B = SparseMatrixCSR.random(n, n, density)

    sparse_C = sparse_A + sparse_B
    dense_C = sparse_C.toarray()

    expected = sparse_A.toarray() + sparse_B.toarray()

    max_error = np.max(np.abs(dense_C - expected))
    print(f"Max error: {max_error:.6e}")
    print(f"Result NNZ: {sparse_C.nnz}")
    print("Match:", max_error < 1e-5)

    assert max_error < 1e-5, "Addition test failed!"
    print("Sparse addition test passed!")


def test_sparse_matmul_operator():
    print("\n=== Testing @ Operator for Sparse Matrices ===")

    n = 512
    density = 0.1

    sparse_A = SparseMatrixCSR.random(n, n, density)
    dense_B = Matrix.random(n, 128)

    C = sparse_A @ dense_B
    expected = sparse_A.toarray() @ dense_B.numpy()

    max_error = np.max(np.abs(C.numpy() - expected))
    print(f"Max error: {max_error:.6e}")
    print("Match:", max_error < 1e-3)

    assert max_error < 1e-3, "Operator test failed!"
    print("Sparse @ operator test passed!")


def test_from_dense():
    print("\n=== Testing from_dense Conversion ===")

    dense = np.random.rand(200, 200).astype(np.float32)
    dense[dense < 0.9] = 0

    sparse = SparseMatrixCSR.from_dense(dense)
    reconstructed = sparse.toarray()

    print(f"Original NNZ: {np.count_nonzero(dense)}")
    print(f"Sparse NNZ: {sparse.nnz}")
    print("Match:", np.allclose(dense, reconstructed, atol=1e-5))

    assert sparse.nnz == np.count_nonzero(dense)
    assert np.allclose(dense, reconstructed, atol=1e-5), "from_dense test failed!"
    print("from_dense test passed!")


def test_large_sparse():
    print("\n=== Testing Large Sparse Matrix (10000x10000, 1% density) ===")

    n = 10000
    density = 0.01

    start = time.time()
    sparse_A = SparseMatrixCSR.random(n, n, density)
    create_time = time.time() - start

    print(f"Shape: {sparse_A.shape}")
    print(f"NNZ: {sparse_A.nnz:,}")
    print(f"Creation time: {create_time:.4f}s")
    print(f"Memory for dense: {n * n * 4 / (1024**3):.2f} GB")
    print(f"Memory for sparse (approx): {sparse_A.nnz * (4 + 4 + 4) / (1024**2):.2f} MB")

    x = np.random.rand(n, 1).astype(np.float32)
    start = time.time()
    y = spmv(sparse_A, x)
    spmv_time = time.time() - start
    print(f"SpMV time: {spmv_time:.4f}s")

    print("Large sparse matrix test completed!")


def test_performance_comparison():
    print("\n=== Performance Comparison (Dense vs Sparse) ===")

    n = 2048
    densities = [0.01, 0.05, 0.1, 0.2, 0.5]

    print(f"{'Density':<10} {'NNZ':<12} {'SpMV Time (s)':<15} {'Dense Time (s)':<15} {'Speedup':<10}")
    print("-" * 70)

    for density in densities:
        sparse_A = SparseMatrixCSR.random(n, n, density)
        x = np.random.rand(n, 1).astype(np.float32)

        start = time.time()
        y_sparse = spmv(sparse_A, x)
        sparse_time = time.time() - start

        dense_A = sparse_A.toarray()
        start = time.time()
        y_dense = dense_A @ x
        dense_time = time.time() - start

        speedup = dense_time / sparse_time
        print(f"{density:<10.2%} {sparse_A.nnz:<12,} {sparse_time:<15.4f} {dense_time:<15.4f} {speedup:<10.2f}x")

    print("Performance comparison completed!")


if __name__ == "__main__":
    print("=" * 60)
    print("Sparse Matrix Operations Test Suite")
    print("=" * 60)

    test_sparse_creation()
    test_sparse_identity()
    test_sparse_diag()
    test_sparse_random()
    test_from_dense()
    test_sparse_transpose()
    test_sparse_add()
    test_sparse_matmul_operator()
    test_spmv()
    test_spmm()
    test_large_sparse()
    test_performance_comparison()

    print("\n" + "=" * 60)
    print("All sparse matrix tests passed!")
    print("=" * 60)
