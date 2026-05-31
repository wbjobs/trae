#include "svd_solver.hpp"
#include "cuda_kernels.cuh"
#include <thrust/device_vector.h>
#include <thrust/inner_product.h>
#include <vector>
#include <random>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <stdexcept>

SVDSolver::SVDSolver(int k, int n_iter, int oversamples, float tol, bool use_fp16)
    : k_(k), n_iter_(n_iter), oversamples_(oversamples), tol_(tol),
      use_fp16_(use_fp16) {}

void SVDSolver::modified_gram_schmidt(
    std::vector<thrust::device_vector<float>>& Q, int m, int l, bool reortho)
{
    for (int j = 0; j < l; ++j) {
        for (int pass = 0; pass < (reortho ? 2 : 1); ++pass) {
            for (int i = 0; i < j; ++i) {
                float dot = thrust::inner_product(
                    Q[i].begin(), Q[i].end(), Q[j].begin(), 0.0f);
                cuda_kernels::vector_axpy(Q[j], Q[i], -dot);
            }
        }
        float norm = std::sqrt(thrust::inner_product(
            Q[j].begin(), Q[j].end(), Q[j].begin(), 0.0f));
        if (norm > 1e-12f) {
            cuda_kernels::vector_scale(Q[j], 1.0f / norm);
        } else {
            cuda_kernels::vector_set(Q[j], 0.0f);
        }
    }
}

void SVDSolver::jacobi_eigen(std::vector<float>& A, int n,
                             std::vector<float>& eigenvalues,
                             std::vector<float>& eigenvectors)
{
    eigenvectors.assign(n * n, 0.0f);
    for (int i = 0; i < n; ++i) eigenvectors[i * n + i] = 1.0f;

    const int max_sweeps = 80;
    const float eps = 1e-14f;

    for (int sweep = 0; sweep < max_sweeps; ++sweep) {
        float off_norm = 0.0f;
        for (int i = 0; i < n; ++i)
            for (int j = i + 1; j < n; ++j)
                off_norm += A[i * n + j] * A[i * n + j];
        off_norm = std::sqrt(off_norm);
        if (off_norm < eps) break;

        for (int p = 0; p < n - 1; ++p) {
            for (int q = p + 1; q < n; ++q) {
                float App = A[p * n + p];
                float Aqq = A[q * n + q];
                float Apq = A[p * n + q];

                if (std::abs(Apq) < eps * std::sqrt(std::abs(App * Aqq) + 1.0f))
                    continue;

                float theta = (Aqq - App) / (2.0f * Apq);
                float t = (theta >= 0.0f ? 1.0f : -1.0f) /
                          (std::abs(theta) + std::sqrt(1.0f + theta * theta));
                float c = 1.0f / std::sqrt(1.0f + t * t);
                float s = t * c;

                A[p * n + p] = App - t * Apq;
                A[q * n + q] = Aqq + t * Apq;
                A[p * n + q] = 0.0f;
                A[q * n + p] = 0.0f;

                for (int i = 0; i < n; ++i) {
                    if (i != p && i != q) {
                        float Aip = A[i * n + p];
                        float Aiq = A[i * n + q];
                        A[i * n + p] = c * Aip - s * Aiq;
                        A[i * n + q] = s * Aip + c * Aiq;
                        A[p * n + i] = A[i * n + p];
                        A[q * n + i] = A[i * n + q];
                    }
                    float Vip = eigenvectors[i * n + p];
                    float Viq = eigenvectors[i * n + q];
                    eigenvectors[i * n + p] = c * Vip - s * Viq;
                    eigenvectors[i * n + q] = s * Vip + c * Viq;
                }
            }
        }
    }

    eigenvalues.resize(n);
    for (int i = 0; i < n; ++i) eigenvalues[i] = A[i * n + i];
}

void SVDSolver::dense_svd(const std::vector<float>& B, int l, int n,
                           std::vector<float>& U, std::vector<float>& S,
                           std::vector<float>& V)
{
    std::vector<float> C(l * l, 0.0f);
    for (int i = 0; i < l; ++i) {
        for (int j = i; j < l; ++j) {
            double sum = 0.0;
            for (int kk = 0; kk < n; ++kk) {
                sum += (double)B[i * n + kk] * (double)B[j * n + kk];
            }
            C[i * l + j] = (float)sum;
            C[j * l + i] = (float)sum;
        }
    }

    std::vector<float> eigenvalues, Uc;
    jacobi_eigen(C, l, eigenvalues, Uc);

    std::vector<int> order(l);
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(), [&](int a, int b) {
        return std::abs(eigenvalues[a]) > std::abs(eigenvalues[b]);
    });

    S.resize(l);
    U.assign(l * l, 0.0f);
    for (int i = 0; i < l; ++i) {
        int orig = order[i];
        S[i] = std::sqrt(std::max(0.0f, eigenvalues[orig]));
        for (int j = 0; j < l; ++j) {
            U[j * l + i] = Uc[j * l + orig];
        }
    }

    V.assign(n * l, 0.0f);
    for (int i = 0; i < l; ++i) {
        if (S[i] > 1e-12f) {
            double inv_s = 1.0 / (double)S[i];
            for (int kk = 0; kk < n; ++kk) {
                double sum = 0.0;
                for (int j = 0; j < l; ++j) {
                    sum += (double)U[j * l + i] * (double)B[j * n + kk];
                }
                V[kk * l + i] = (float)(sum * inv_s);
            }
        }
    }
}

SVDResult SVDSolver::compute(const CSRMatrix& A) {
    int m = A.rows;
    int n = A.cols;
    int k = std::min(k_, std::min(m, n));

    if (k <= 0) {
        SVDResult result;
        result.k = 0;
        result.m = m;
        result.n = n;
        return result;
    }

    int p = std::max(0, oversamples_);
    int l = std::min(k + p, std::min(m, n));

    auto spmv = [&](const thrust::device_vector<float>& x,
                     thrust::device_vector<float>& y,
                     bool transpose) {
        if (use_fp16_) {
            cuda_kernels::csr_spmv_fp16(A, x, y, transpose);
        } else {
            cuda_kernels::csr_spmv(A, x, y, transpose);
        }
    };

    std::mt19937 gen(42);
    std::normal_distribution<float> dist(0.0f, 1.0f);

    std::vector<std::vector<float>> Omega(l, std::vector<float>(n));
    for (int i = 0; i < l; ++i)
        for (int j = 0; j < n; ++j)
            Omega[i][j] = dist(gen);

    std::vector<thrust::device_vector<float>> Y(l, thrust::device_vector<float>(m, 0.0f));

    {
        thrust::device_vector<float> d_x(n);
        thrust::device_vector<float> d_y(m);

        for (int i = 0; i < l; ++i) {
            d_x.assign(Omega[i].begin(), Omega[i].end());
            spmv(d_x, d_y, false);
            Y[i].assign(d_y.begin(), d_y.end());
        }
    }

    std::vector<thrust::device_vector<float>> Q(l, thrust::device_vector<float>(m));
    for (int i = 0; i < l; ++i) {
        cuda_kernels::vector_copy(Q[i], Y[i]);
    }
    modified_gram_schmidt(Q, m, l, true);

    int eff_iter = n_iter_;
    if (eff_iter > 0 && l > 0) {
        float norm_est = 0.0f;
        for (int i = 0; i < l; ++i) {
            float nrm = std::sqrt(thrust::inner_product(
                Y[i].begin(), Y[i].end(), Y[i].begin(), 0.0f));
            if (nrm > norm_est) norm_est = nrm;
        }
        if (norm_est < 1e-8f) eff_iter = 0;
    }

    for (int iter = 0; iter < eff_iter; ++iter) {
        std::vector<thrust::device_vector<float>> Z(l, thrust::device_vector<float>(n, 0.0f));
        {
            thrust::device_vector<float> d_q(m);
            thrust::device_vector<float> d_z(n);

            for (int i = 0; i < l; ++i) {
                cuda_kernels::vector_copy(d_q, Q[i]);
                spmv(d_q, d_z, true);
                Z[i].assign(d_z.begin(), d_z.end());
            }
        }

        modified_gram_schmidt(Z, n, l, true);

        std::vector<thrust::device_vector<float>> Q_new(l, thrust::device_vector<float>(m, 0.0f));
        {
            thrust::device_vector<float> d_z(n);
            thrust::device_vector<float> d_q(m);

            for (int i = 0; i < l; ++i) {
                cuda_kernels::vector_copy(d_z, Z[i]);
                spmv(d_z, d_q, false);
                Q_new[i].assign(d_q.begin(), d_q.end());
            }
        }

        for (int i = 0; i < l; ++i) {
            cuda_kernels::vector_copy(Q[i], Q_new[i]);
        }
        modified_gram_schmidt(Q, m, l, true);
    }

    std::vector<float> B(l * n, 0.0f);
    {
        thrust::device_vector<float> d_q(m);
        thrust::device_vector<float> d_b_row(n);

        for (int i = 0; i < l; ++i) {
            cuda_kernels::vector_copy(d_q, Q[i]);
            spmv(d_q, d_b_row, true);
            std::vector<float> h_b_row(n);
            thrust::copy(d_b_row.begin(), d_b_row.end(), h_b_row.begin());
            std::copy(h_b_row.begin(), h_b_row.end(), B.begin() + i * n);
        }
    }

    std::vector<float> Ub, S_full, V_full;
    dense_svd(B, l, n, Ub, S_full, V_full);

    int k_eff = k;
    if (k_eff > S_full.size()) k_eff = S_full.size();

    int actual_k = 0;
    for (int i = 0; i < k_eff; ++i) {
        if (S_full[i] > tol_ * S_full[0]) actual_k++;
    }
    if (actual_k == 0) actual_k = 1;
    if (actual_k > k_eff) actual_k = k_eff;

    std::vector<float> U(m * actual_k, 0.0f);
    {
        std::vector<std::vector<float>> h_Q(l, std::vector<float>(m));
        for (int i = 0; i < l; ++i) {
            thrust::copy(Q[i].begin(), Q[i].end(), h_Q[i].begin());
        }

        for (int i = 0; i < m; ++i) {
            for (int j = 0; j < actual_k; ++j) {
                double sum = 0.0;
                for (int ll = 0; ll < l; ++ll) {
                    sum += (double)h_Q[ll][i] * (double)Ub[ll * l + j];
                }
                U[i * actual_k + j] = (float)sum;
            }
        }
    }

    std::vector<float> S_out(actual_k);
    std::vector<float> V(n * actual_k, 0.0f);
    for (int i = 0; i < actual_k; ++i) {
        S_out[i] = S_full[i];
        for (int j = 0; j < n; ++j) {
            V[j * actual_k + i] = V_full[j * l + i];
        }
    }

    SVDResult result;
    result.U = std::move(U);
    result.S = std::move(S_out);
    result.V = std::move(V);
    result.k = actual_k;
    result.m = m;
    result.n = n;
    return result;
}
