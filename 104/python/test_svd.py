import numpy as np
import scipy.sparse as sp
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'build', 'Release'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'build'))

try:
    import sparse_svd
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'build', 'Debug'))
    import sparse_svd


def generate_sparse_matrix(n, density=0.01, seed=42):
    rng = np.random.RandomState(seed)
    nnz = int(n * n * density)
    rows = rng.randint(0, n, nnz)
    cols = rng.randint(0, n, nnz)
    data = rng.randn(nnz).astype(np.float32)
    A = sp.csr_matrix((data, (rows, cols)), shape=(n, n))
    A.sum_duplicates()
    return A.tocsr()


def compute_relative_error(A, U, S, Vt, k):
    A_reconstructed = U[:, :k] @ np.diag(S[:k]) @ Vt[:k, :]
    if sp.issparse(A):
        A_dense = A.toarray().astype(np.float64)
    else:
        A_dense = A.astype(np.float64)
    error = np.linalg.norm(A_dense - A_reconstructed)
    rel_error = error / np.linalg.norm(A_dense)
    return rel_error


def check_orthogonality(U, tol=1e-4):
    UtU = U.T @ U
    diff = np.linalg.norm(UtU - np.eye(U.shape[1]))
    return diff < tol, diff


def run_svd(A, k, n_iter, oversamples, use_fp16, warmup=False):
    if warmup:
        for _ in range(3):
            sparse_svd.sparse_svd(
                A.data.astype(np.float32),
                A.indices.astype(np.int32),
                A.indptr.astype(np.int32),
                A.shape[0], A.shape[1],
                k=k, n_iter=n_iter, oversamples=oversamples,
                use_fp16=use_fp16
            )
    t0 = time.perf_counter()
    U, S, V = sparse_svd.sparse_svd(
        A.data.astype(np.float32),
        A.indices.astype(np.int32),
        A.indptr.astype(np.int32),
        A.shape[0], A.shape[1],
        k=k, n_iter=n_iter, oversamples=oversamples,
        use_fp16=use_fp16
    )
    t1 = time.perf_counter()
    return U, S, V, t1 - t0


def test_correctness_fp16(n, density=0.01, k=10, n_iter=2, oversamples=10):
    print(f"\n{'='*60}")
    print(f"FP16 Correctness Test: {n}x{n}, density={density}, k={k}")
    print(f"{'='*60}")

    A = generate_sparse_matrix(n, density)
    print(f"Matrix: shape={A.shape}, nnz={A.nnz}, "
          f"density={A.nnz / (n*n):.4f}")

    U_fp32, S_fp32, V_fp32, t_fp32 = run_svd(
        A, k, n_iter, oversamples, use_fp16=False, warmup=True
    )
    U_fp16, S_fp16, V_fp16, t_fp16 = run_svd(
        A, k, n_iter, oversamples, use_fp16=True, warmup=True
    )

    k_eff = min(k, S_fp32.shape[0], S_fp16.shape[0])
    print(f"FP32 time: {t_fp32:.4f}s  |  FP16 time: {t_fp16:.4f}s  |  "
          f"Speedup: {t_fp32/t_fp16:.2f}x")

    S_fp32 = S_fp32.astype(np.float64)
    S_fp16 = S_fp16.astype(np.float64)
    U_fp32 = U_fp32.astype(np.float64)
    U_fp16 = U_fp16.astype(np.float64)
    V_fp32 = V_fp32.astype(np.float64)
    V_fp16 = V_fp16.astype(np.float64)

    sv_rel_err = np.max(np.abs(S_fp32[:k_eff] - S_fp16[:k_eff]) /
                          (np.abs(S_fp32[:k_eff]) + 1e-12))
    print(f"Max relative singular value error: {sv_rel_err:.2e}")

    U_ortho, U_err = check_orthogonality(U_fp16[:, :k_eff])
    V_ortho, V_err = check_orthogonality(V_fp16[:, :k_eff])
    print(f"U orthogonality: {'PASS' if U_ortho else 'FAIL'} (||U^T U - I|| = {U_err:.2e})")
    print(f"V orthogonality: {'PASS' if V_ortho else 'FAIL'} (||V^T V - I|| = {V_err:.2e})")

    Vt_fp16 = V_fp16.T
    rel_err_fp16 = compute_relative_error(A, U_fp16, S_fp16, Vt_fp16, k_eff)
    rel_err_fp32 = compute_relative_error(A, U_fp32, S_fp32, V_fp32.T, k_eff)
    print(f"FP32 relative reconstruction error: {rel_err_fp32:.2e}")
    print(f"FP16 relative reconstruction error: {rel_err_fp16:.2e}")
    print(f"Precision loss (delta rel error): {abs(rel_err_fp16 - rel_err_fp32):.2e}")

    speedup = t_fp32 / t_fp16
    precision_ok = abs(rel_err_fp16 - rel_err_fp32) < 1e-4
    speedup_ok = speedup >= 1.8

    print(f"\nResults: Speedup {'PASS' if speedup_ok else 'FAIL'} "
          f"({speedup:.2f}x, target 1.8x)")
    print(f"Results: Precision {'PASS' if precision_ok else 'FAIL'} "
          f"(delta={abs(rel_err_fp16 - rel_err_fp32):.2e}, target <1e-4)")

    return {
        'n': n, 't_fp32': t_fp32, 't_fp16': t_fp16,
        'speedup': speedup, 'sv_rel_err': sv_rel_err,
        'rel_err_fp32': rel_err_fp32, 'rel_err_fp16': rel_err_fp16,
        'precision_loss': abs(rel_err_fp16 - rel_err_fp32),
        'speedup_ok': speedup_ok, 'precision_ok': precision_ok
    }


def test_svd(n, density=0.01, k=10, n_iter=2, oversamples=10):
    print(f"\n{'='*60}")
    print(f"Testing matrix size: {n}x{n}, density={density}, k={k}")
    print(f"{'='*60}")

    A = generate_sparse_matrix(n, density)
    print(f"Matrix generated: shape={A.shape}, nnz={A.nnz}, "
          f"density={A.nnz / (n*n):.4f}")

    U, S, V, t_total = run_svd(A, k, n_iter, oversamples, use_fp16=False, warmup=True)
    print(f"SVD computation time: {t_total:.3f}s")
    print(f"Output shapes: U={U.shape}, S={S.shape}, V={V.shape}")

    S = S.astype(np.float64)
    U = U.astype(np.float64)
    V = V.astype(np.float64)
    Vt = V.T

    k_eff = min(k, S.shape[0])
    print(f"Effective rank: {k_eff}")
    if k_eff > 0:
        print(f"Top 5 singular values: {S[:min(5, k_eff)]}")

    if k_eff > 0:
        U_ortho, U_err = check_orthogonality(U[:, :k_eff])
        V_ortho, V_err = check_orthogonality(V[:, :k_eff])
        print(f"U orthogonality: {'PASS' if U_ortho else 'FAIL'} "
              f"(||U^T U - I|| = {U_err:.2e})")
        print(f"V orthogonality: {'PASS' if V_ortho else 'FAIL'} "
              f"(||V^T V - I|| = {V_err:.2e})")

        rel_error = compute_relative_error(A, U, S, Vt, k_eff)
        print(f"Relative reconstruction error: {rel_error:.6e}")

        if n <= 2000:
            t2 = time.time()
            try:
                U_ref, S_ref, Vt_ref = sp.linalg.svds(A.astype(np.float64), k=k_eff, which='LM')
                t3 = time.time()
                print(f"scipy svds time: {t3 - t2:.3f}s")
                idx_ref = np.argsort(S_ref)[::-1]
                S_ref_sorted = S_ref[idx_ref]
                print(f"scipy top 5 singular values: {S_ref_sorted[:min(5, k_eff)]}")
            except Exception as e:
                print(f"scipy svds failed: {e}")

    return {'n': n, 'time': t_total, 'k_eff': k_eff}


def main():
    print("=" * 60)
    print("Sparse SVD Library - Mixed Precision Test Suite")
    print("=" * 60)

    fp16_results = []
    for n in [1000, 5000, 10000]:
        try:
            r = test_correctness_fp16(n, density=0.01, k=10, n_iter=2, oversamples=10)
            fp16_results.append(r)
        except Exception as e:
            print(f"\nFP16 test FAILED for n={n}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'='*60}")
    print("Mixed Precision Summary")
    print(f"{'='*60}")
    for r in fp16_results:
        print(f"  n={r['n']:>6}: FP32={r['t_fp32']:.3f}s  FP16={r['t_fp16']:.3f}s  "
              f"Speedup={r['speedup']:.2f}x  "
              f"SV_err={r['sv_rel_err']:.2e}  "
              f"PrecLoss={r['precision_loss']:.2e}  "
              f"{'OK' if r['speedup_ok'] and r['precision_ok'] else 'CHECK'}")

    print(f"\n{'='*60}")
    print("FP32 Baseline Tests")
    print(f"{'='*60}")
    baseline_results = []
    for n in [1000, 5000, 10000]:
        try:
            r = test_svd(n, density=0.01, k=10, n_iter=2, oversamples=10)
            baseline_results.append(r)
        except Exception as e:
            print(f"\nTest FAILED for n={n}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'='*60}")
    print("All tests completed.")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
