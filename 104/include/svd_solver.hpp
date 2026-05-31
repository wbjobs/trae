#pragma once

#include "csr_matrix.hpp"
#include <vector>
#include <tuple>

struct SVDResult {
    std::vector<float> U;
    std::vector<float> S;
    std::vector<float> V;
    int k;
    int m;
    int n;
};

class SVDSolver {
public:
    SVDSolver(int k = 10, int n_iter = 2, int oversamples = 10,
              float tol = 1e-6f, bool use_fp16 = false);

    SVDResult compute(const CSRMatrix& A);

    void set_k(int k) { k_ = k; }
    void set_n_iter(int n_iter) { n_iter_ = n_iter; }
    void set_oversamples(int p) { oversamples_ = p; }
    void set_tol(float tol) { tol_ = tol; }
    void set_use_fp16(bool v) { use_fp16_ = v; }

private:
    int k_;
    int n_iter_;
    int oversamples_;
    float tol_;
    bool use_fp16_;

    void modified_gram_schmidt(std::vector<thrust::device_vector<float>>& Q,
                               int m, int l, bool reortho = true);

    void dense_svd(const std::vector<float>& B,
                   int l, int n,
                   std::vector<float>& U,
                   std::vector<float>& S,
                   std::vector<float>& V);

    void jacobi_eigen(std::vector<float>& A, int n,
                      std::vector<float>& eigenvalues,
                      std::vector<float>& eigenvectors);
};
