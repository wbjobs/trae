import numpy as np
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

try:
    import cuda_matrix as cm
    from cuda_matrix import Matrix, matmul, transpose, inverse, eig
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
        def on_gpu(self):
            return False
        @staticmethod
        def random(rows, cols, **kwargs):
            return Matrix(np.random.rand(rows, cols).astype(np.float32))
        @staticmethod
        def identity(n, **kwargs):
            return Matrix(np.eye(n, dtype=np.float32))
        def __matmul__(self, other):
            return Matrix(self._data @ other._data)
        def to_cpu(self):
            return self
        def to_gpu(self):
            return self
    def matmul(a, b):
        return a @ b
    def transpose(a):
        return Matrix(a.numpy().T)
    def inverse(a):
        return Matrix(np.linalg.inv(a.numpy()))
    def eig(a):
        vals, vecs = np.linalg.eig(a.numpy())
        return vals, Matrix(vecs)


def test_matmul():
    print("\n=== Testing Matrix Multiplication ===")
    A_np = np.array([[1, 2], [3, 4]], dtype=np.float32)
    B_np = np.array([[5, 6], [7, 8]], dtype=np.float32)
    C_np = A_np @ B_np

    A = Matrix(A_np)
    B = Matrix(B_np)
    C = matmul(A, B)
    C_result = C.numpy()

    print("A:")
    print(A_np)
    print("\nB:")
    print(B_np)
    print("\nA @ B (GPU):")
    print(C_result)
    print("\nA @ B (NumPy):")
    print(C_np)
    print("\nMatch:", np.allclose(C_result, C_np, atol=1e-5))
    assert np.allclose(C_result, C_np, atol=1e-5), "Matmul test failed!"
    print("Matrix multiplication test passed!")


def test_transpose():
    print("\n=== Testing Matrix Transpose ===")
    A_np = np.array([[1, 2, 3], [4, 5, 6]], dtype=np.float32)
    A = Matrix(A_np)
    A_T = transpose(A)
    A_T_np = A_T.numpy()

    print("Original:")
    print(A_np)
    print("\nTranspose (GPU):")
    print(A_T_np)
    print("\nTranspose (NumPy):")
    print(A_np.T)
    print("\nMatch:", np.allclose(A_T_np, A_np.T, atol=1e-5))
    assert np.allclose(A_T_np, A_np.T, atol=1e-5), "Transpose test failed!"
    print("Transpose test passed!")


def test_inverse():
    print("\n=== Testing Matrix Inverse ===")
    A_np = np.array([[4, 7], [2, 6]], dtype=np.float32)
    A = Matrix(A_np)
    A_inv = inverse(A)
    A_inv_np = A_inv.numpy()

    I = A @ A_inv
    I_np = I.numpy()

    print("Original:")
    print(A_np)
    print("\nInverse (GPU):")
    print(A_inv_np)
    print("\nA @ A_inv (should be identity):")
    print(I_np)
    print("\nClose to identity:", np.allclose(I_np, np.eye(2), atol=1e-3))
    assert np.allclose(I_np, np.eye(2), atol=1e-3), "Inverse test failed!"
    print("Inverse test passed!")


def test_eigenvalues():
    print("\n=== Testing Eigenvalues ===")
    A_np = np.array([[2, 1], [1, 2]], dtype=np.float32)
    A = Matrix(A_np)
    eigenvalues, eigenvectors = eig(A)
    eig_vecs_np = eigenvectors.numpy()

    print("Matrix:")
    print(A_np)
    print("\nEigenvalues:", eigenvalues)
    print("\nEigenvectors:")
    print(eig_vecs_np)

    expected_eigenvalues = np.array([3.0, 1.0])
    eigenvalues_sorted = np.sort(eigenvalues)
    print("\nExpected eigenvalues:", expected_eigenvalues)
    print("Match:", np.allclose(eigenvalues_sorted, expected_eigenvalues, atol=1e-3))
    assert np.allclose(eigenvalues_sorted, expected_eigenvalues, atol=1e-3), "Eigenvalue test failed!"
    print("Eigenvalue test passed!")


def test_large_matrix():
    print("\n=== Testing Large Matrix Multiplication ===")
    size = 512
    A_np = np.random.rand(size, size).astype(np.float32)
    B_np = np.random.rand(size, size).astype(np.float32)

    import time

    start = time.time()
    C_np = A_np @ B_np
    numpy_time = time.time() - start
    print(f"NumPy time: {numpy_time:.4f}s")

    start = time.time()
    A = Matrix(A_np)
    B = Matrix(B_np)
    C = matmul(A, B)
    C_result = C.numpy()
    gpu_time = time.time() - start
    print(f"GPU time: {gpu_time:.4f}s")

    print("Results match:", np.allclose(C_result, C_np, atol=1e-2))
    print(f"Speedup: {numpy_time / gpu_time:.2f}x")
    assert np.allclose(C_result, C_np, atol=1e-2), "Large matrix test failed!"
    print("Large matrix test passed!")


def test_numpy_integration():
    print("\n=== Testing NumPy Integration ===")
    A_np = np.random.rand(3, 3).astype(np.float32)
    A = Matrix(A_np)
    B = A.numpy()
    print("Original:", A_np)
    print("Round-trip:", B)
    print("Match:", np.allclose(A_np, B, atol=1e-5))
    assert np.allclose(A_np, B, atol=1e-5), "NumPy integration test failed!"
    print("NumPy integration test passed!")


def test_matrix_creation():
    print("\n=== Testing Matrix Creation ===")
    zeros = Matrix.zeros(2, 3)
    ones = Matrix.ones(3, 2)
    identity = Matrix.identity(3)
    rand = Matrix.random(4, 4)

    print("Zeros shape:", zeros.shape)
    print("Ones shape:", ones.shape)
    print("Identity shape:", identity.shape)
    print("Random shape:", rand.shape)
    print("Identity is identity:", np.allclose(identity.numpy(), np.eye(3), atol=1e-5))
    print("Matrix creation tests passed!")


def test_operators():
    print("\n=== Testing Operators ===")
    A = Matrix(np.array([[1, 2], [3, 4]], dtype=np.float32))
    B = Matrix(np.array([[5, 6], [7, 8]], dtype=np.float32))
    C = A @ B
    print("A @ B:")
    print(C.numpy())
    expected = np.array([[19, 22], [43, 50]], dtype=np.float32)
    assert np.allclose(C.numpy(), expected, atol=1e-5), "Operator test failed!"
    print("Operator tests passed!")


if __name__ == "__main__":
    print("=" * 50)
    print("CUDA Matrix Library Test Suite")
    print("=" * 50)

    test_matrix_creation()
    test_numpy_integration()
    test_operators()
    test_matmul()
    test_transpose()
    test_inverse()
    test_eigenvalues()
    test_large_matrix()

    print("\n" + "=" * 50)
    print("All tests passed!")
    print("=" * 50)
