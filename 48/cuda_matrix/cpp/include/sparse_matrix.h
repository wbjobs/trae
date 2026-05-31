#pragma once

#include <vector>
#include <memory>
#include <stdexcept>
#include <cstddef>
#include "matrix.h"

namespace cuda_matrix {

class SparseMatrixCSR {
public:
    SparseMatrixCSR();
    SparseMatrixCSR(size_t rows, size_t cols, size_t nnz, bool on_gpu = true);
    SparseMatrixCSR(size_t rows, size_t cols,
                    const std::vector<int>& row_ptr,
                    const std::vector<int>& col_idx,
                    const std::vector<float>& values,
                    bool on_gpu = true);
    SparseMatrixCSR(const SparseMatrixCSR& other);
    SparseMatrixCSR(SparseMatrixCSR&& other) noexcept;
    ~SparseMatrixCSR();

    SparseMatrixCSR& operator=(const SparseMatrixCSR& other);
    SparseMatrixCSR& operator=(SparseMatrixCSR&& other) noexcept;

    size_t rows() const { return rows_; }
    size_t cols() const { return cols_; }
    size_t nnz() const { return nnz_; }
    bool on_gpu() const { return on_gpu_; }
    float density() const { return static_cast<float>(nnz_) / (rows_ * cols_); }

    const int* row_ptr() const { return on_gpu_ ? d_row_ptr_ : h_row_ptr_; }
    const int* col_idx() const { return on_gpu_ ? d_col_idx_ : h_col_idx_; }
    const float* values() const { return on_gpu_ ? d_values_ : h_values_; }

    std::vector<int> row_ptr_cpu() const;
    std::vector<int> col_idx_cpu() const;
    std::vector<float> values_cpu() const;

    void to_cpu();
    void to_gpu();

    static SparseMatrixCSR from_dense(const Matrix& dense, float threshold = 1e-6f);
    Matrix to_dense() const;

    static SparseMatrixCSR random(size_t rows, size_t cols, float density,
                                  float min_val = 0.0f, float max_val = 1.0f,
                                  bool on_gpu = true);
    static SparseMatrixCSR identity(size_t n, bool on_gpu = true);
    static SparseMatrixCSR diag(const std::vector<float>& diag_values, bool on_gpu = true);

private:
    size_t rows_;
    size_t cols_;
    size_t nnz_;
    bool on_gpu_;

    int* h_row_ptr_;
    int* h_col_idx_;
    float* h_values_;

    int* d_row_ptr_;
    int* d_col_idx_;
    float* d_values_;

    void allocate_host();
    void allocate_device();
    void free_host();
    void free_device();
    void copy_to_host() const;
    void copy_to_device() const;
};

Matrix spmv(const SparseMatrixCSR& A, const Matrix& x);
Matrix spmm(const SparseMatrixCSR& A, const Matrix& B);
SparseMatrixCSR sparse_transpose(const SparseMatrixCSR& A);
SparseMatrixCSR sparse_add(const SparseMatrixCSR& A, const SparseMatrixCSR& B);
Matrix sparse_matmul_dense(const SparseMatrixCSR& A, const Matrix& B);

}
