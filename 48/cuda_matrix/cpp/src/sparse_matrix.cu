#include "sparse_matrix.h"
#include "../kernels/sparse.cuh"
#include <cuda_runtime.h>
#include <random>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <string>

#define CUDA_CHECK(err) \
    if (err != cudaSuccess) { \
        throw std::runtime_error("CUDA error: " + std::string(cudaGetErrorString(err))); \
    }

namespace cuda_matrix {

SparseMatrixCSR::SparseMatrixCSR()
    : rows_(0), cols_(0), nnz_(0), on_gpu_(true),
      h_row_ptr_(nullptr), h_col_idx_(nullptr), h_values_(nullptr),
      d_row_ptr_(nullptr), d_col_idx_(nullptr), d_values_(nullptr) {}

SparseMatrixCSR::SparseMatrixCSR(size_t rows, size_t cols, size_t nnz, bool on_gpu)
    : rows_(rows), cols_(cols), nnz_(nnz), on_gpu_(on_gpu),
      h_row_ptr_(nullptr), h_col_idx_(nullptr), h_values_(nullptr),
      d_row_ptr_(nullptr), d_col_idx_(nullptr), d_values_(nullptr) {
    if (rows == 0 || cols == 0) {
        throw std::invalid_argument("Matrix dimensions must be positive");
    }
    if (on_gpu_) {
        allocate_device();
    } else {
        allocate_host();
    }
}

SparseMatrixCSR::SparseMatrixCSR(size_t rows, size_t cols,
                                 const std::vector<int>& row_ptr,
                                 const std::vector<int>& col_idx,
                                 const std::vector<float>& values,
                                 bool on_gpu)
    : rows_(rows), cols_(cols), nnz_(values.size()), on_gpu_(on_gpu),
      h_row_ptr_(nullptr), h_col_idx_(nullptr), h_values_(nullptr),
      d_row_ptr_(nullptr), d_col_idx_(nullptr), d_values_(nullptr) {
    if (rows == 0 || cols == 0) {
        throw std::invalid_argument("Matrix dimensions must be positive");
    }
    if (row_ptr.size() != rows + 1) {
        throw std::invalid_argument("row_ptr size must be rows + 1");
    }
    if (col_idx.size() != nnz_) {
        throw std::invalid_argument("col_idx size must match nnz");
    }

    if (on_gpu_) {
        allocate_device();
        CUDA_CHECK(cudaMemcpy(d_row_ptr_, row_ptr.data(), (rows + 1) * sizeof(int), cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(d_col_idx_, col_idx.data(), nnz_ * sizeof(int), cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(d_values_, values.data(), nnz_ * sizeof(float), cudaMemcpyHostToDevice));
    } else {
        allocate_host();
        std::memcpy(h_row_ptr_, row_ptr.data(), (rows + 1) * sizeof(int));
        std::memcpy(h_col_idx_, col_idx.data(), nnz_ * sizeof(int));
        std::memcpy(h_values_, values.data(), nnz_ * sizeof(float));
    }
}

SparseMatrixCSR::SparseMatrixCSR(const SparseMatrixCSR& other)
    : rows_(other.rows_), cols_(other.cols_), nnz_(other.nnz_), on_gpu_(other.on_gpu_),
      h_row_ptr_(nullptr), h_col_idx_(nullptr), h_values_(nullptr),
      d_row_ptr_(nullptr), d_col_idx_(nullptr), d_values_(nullptr) {
    if (on_gpu_) {
        allocate_device();
        CUDA_CHECK(cudaMemcpy(d_row_ptr_, other.d_row_ptr_, (rows_ + 1) * sizeof(int), cudaMemcpyDeviceToDevice));
        CUDA_CHECK(cudaMemcpy(d_col_idx_, other.d_col_idx_, nnz_ * sizeof(int), cudaMemcpyDeviceToDevice));
        CUDA_CHECK(cudaMemcpy(d_values_, other.d_values_, nnz_ * sizeof(float), cudaMemcpyDeviceToDevice));
    } else {
        allocate_host();
        std::memcpy(h_row_ptr_, other.h_row_ptr_, (rows_ + 1) * sizeof(int));
        std::memcpy(h_col_idx_, other.h_col_idx_, nnz_ * sizeof(int));
        std::memcpy(h_values_, other.h_values_, nnz_ * sizeof(float));
    }
}

SparseMatrixCSR::SparseMatrixCSR(SparseMatrixCSR&& other) noexcept
    : rows_(other.rows_), cols_(other.cols_), nnz_(other.nnz_), on_gpu_(other.on_gpu_),
      h_row_ptr_(other.h_row_ptr_), h_col_idx_(other.h_col_idx_), h_values_(other.h_values_),
      d_row_ptr_(other.d_row_ptr_), d_col_idx_(other.d_col_idx_), d_values_(other.d_values_) {
    other.rows_ = 0;
    other.cols_ = 0;
    other.nnz_ = 0;
    other.h_row_ptr_ = nullptr;
    other.h_col_idx_ = nullptr;
    other.h_values_ = nullptr;
    other.d_row_ptr_ = nullptr;
    other.d_col_idx_ = nullptr;
    other.d_values_ = nullptr;
}

SparseMatrixCSR::~SparseMatrixCSR() {
    free_host();
    free_device();
}

SparseMatrixCSR& SparseMatrixCSR::operator=(const SparseMatrixCSR& other) {
    if (this != &other) {
        free_host();
        free_device();
        rows_ = other.rows_;
        cols_ = other.cols_;
        nnz_ = other.nnz_;
        on_gpu_ = other.on_gpu_;
        if (on_gpu_) {
            allocate_device();
            CUDA_CHECK(cudaMemcpy(d_row_ptr_, other.d_row_ptr_, (rows_ + 1) * sizeof(int), cudaMemcpyDeviceToDevice));
            CUDA_CHECK(cudaMemcpy(d_col_idx_, other.d_col_idx_, nnz_ * sizeof(int), cudaMemcpyDeviceToDevice));
            CUDA_CHECK(cudaMemcpy(d_values_, other.d_values_, nnz_ * sizeof(float), cudaMemcpyDeviceToDevice));
        } else {
            allocate_host();
            std::memcpy(h_row_ptr_, other.h_row_ptr_, (rows_ + 1) * sizeof(int));
            std::memcpy(h_col_idx_, other.h_col_idx_, nnz_ * sizeof(int));
            std::memcpy(h_values_, other.h_values_, nnz_ * sizeof(float));
        }
    }
    return *this;
}

SparseMatrixCSR& SparseMatrixCSR::operator=(SparseMatrixCSR&& other) noexcept {
    if (this != &other) {
        free_host();
        free_device();
        rows_ = other.rows_;
        cols_ = other.cols_;
        nnz_ = other.nnz_;
        on_gpu_ = other.on_gpu_;
        h_row_ptr_ = other.h_row_ptr_;
        h_col_idx_ = other.h_col_idx_;
        h_values_ = other.h_values_;
        d_row_ptr_ = other.d_row_ptr_;
        d_col_idx_ = other.d_col_idx_;
        d_values_ = other.d_values_;
        other.rows_ = 0;
        other.cols_ = 0;
        other.nnz_ = 0;
        other.h_row_ptr_ = nullptr;
        other.h_col_idx_ = nullptr;
        other.h_values_ = nullptr;
        other.d_row_ptr_ = nullptr;
        other.d_col_idx_ = nullptr;
        other.d_values_ = nullptr;
    }
    return *this;
}

std::vector<int> SparseMatrixCSR::row_ptr_cpu() const {
    copy_to_host();
    return std::vector<int>(h_row_ptr_, h_row_ptr_ + rows_ + 1);
}

std::vector<int> SparseMatrixCSR::col_idx_cpu() const {
    copy_to_host();
    return std::vector<int>(h_col_idx_, h_col_idx_ + nnz_);
}

std::vector<float> SparseMatrixCSR::values_cpu() const {
    copy_to_host();
    return std::vector<float>(h_values_, h_values_ + nnz_);
}

void SparseMatrixCSR::to_cpu() {
    if (on_gpu_) {
        copy_to_host();
        free_device();
        on_gpu_ = false;
    }
}

void SparseMatrixCSR::to_gpu() {
    if (!on_gpu_) {
        copy_to_device();
        free_host();
        on_gpu_ = true;
    }
}

SparseMatrixCSR SparseMatrixCSR::from_dense(const Matrix& dense, float threshold) {
    Matrix dense_cpu = dense;
    dense_cpu.to_cpu();
    const float* data = dense_cpu.host_data();
    size_t rows = dense.rows();
    size_t cols = dense.cols();

    std::vector<int> col_idx;
    std::vector<float> values;
    std::vector<int> row_ptr(rows + 1, 0);

    for (size_t i = 0; i < rows; i++) {
        int count = 0;
        for (size_t j = 0; j < cols; j++) {
            float val = data[i * cols + j];
            if (std::abs(val) > threshold) {
                col_idx.push_back(static_cast<int>(j));
                values.push_back(val);
                count++;
            }
        }
        row_ptr[i + 1] = row_ptr[i] + count;
    }

    return SparseMatrixCSR(rows, cols, row_ptr, col_idx, values, true);
}

Matrix SparseMatrixCSR::to_dense() const {
    Matrix result(rows_, cols_, false);
    float* data = result.host_data();
    std::memset(data, 0, rows_ * cols_ * sizeof(float));

    copy_to_host();
    for (size_t i = 0; i < rows_; i++) {
        int start = h_row_ptr_[i];
        int end = h_row_ptr_[i + 1];
        for (int j = start; j < end; j++) {
            int col = h_col_idx_[j];
            data[i * cols_ + col] = h_values_[j];
        }
    }

    result.to_gpu();
    return result;
}

SparseMatrixCSR SparseMatrixCSR::random(size_t rows, size_t cols, float density,
                                        float min_val, float max_val, bool on_gpu) {
    if (density <= 0 || density > 1) {
        throw std::invalid_argument("Density must be in (0, 1]");
    }

    size_t total_elems = rows * cols;
    size_t expected_nnz = static_cast<size_t>(total_elems * density);

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<float> val_dist(min_val, max_val);
    std::uniform_real_distribution<float> prob_dist(0.0f, 1.0f);

    std::vector<int> col_idx;
    std::vector<float> values;
    std::vector<int> row_ptr(rows + 1, 0);

    col_idx.reserve(expected_nnz);
    values.reserve(expected_nnz);

    for (size_t i = 0; i < rows; i++) {
        int count = 0;
        for (size_t j = 0; j < cols; j++) {
            if (prob_dist(gen) < density) {
                col_idx.push_back(static_cast<int>(j));
                values.push_back(val_dist(gen));
                count++;
            }
        }
        row_ptr[i + 1] = row_ptr[i] + count;
    }

    return SparseMatrixCSR(rows, cols, row_ptr, col_idx, values, on_gpu);
}

SparseMatrixCSR SparseMatrixCSR::identity(size_t n, bool on_gpu) {
    std::vector<int> row_ptr(n + 1);
    std::vector<int> col_idx(n);
    std::vector<float> values(n, 1.0f);

    for (size_t i = 0; i <= n; i++) {
        row_ptr[i] = static_cast<int>(i);
    }
    for (size_t i = 0; i < n; i++) {
        col_idx[i] = static_cast<int>(i);
    }

    return SparseMatrixCSR(n, n, row_ptr, col_idx, values, on_gpu);
}

SparseMatrixCSR SparseMatrixCSR::diag(const std::vector<float>& diag_values, bool on_gpu) {
    size_t n = diag_values.size();
    std::vector<int> row_ptr(n + 1);
    std::vector<int> col_idx(n);
    std::vector<float> values(diag_values);

    for (size_t i = 0; i <= n; i++) {
        row_ptr[i] = static_cast<int>(i);
    }
    for (size_t i = 0; i < n; i++) {
        col_idx[i] = static_cast<int>(i);
    }

    return SparseMatrixCSR(n, n, row_ptr, col_idx, values, on_gpu);
}

void SparseMatrixCSR::allocate_host() {
    if (h_row_ptr_ == nullptr) {
        h_row_ptr_ = new int[rows_ + 1];
    }
    if (h_col_idx_ == nullptr && nnz_ > 0) {
        h_col_idx_ = new int[nnz_];
    }
    if (h_values_ == nullptr && nnz_ > 0) {
        h_values_ = new float[nnz_];
    }
}

void SparseMatrixCSR::allocate_device() {
    if (d_row_ptr_ == nullptr) {
        CUDA_CHECK(cudaMalloc(&d_row_ptr_, (rows_ + 1) * sizeof(int)));
    }
    if (d_col_idx_ == nullptr && nnz_ > 0) {
        CUDA_CHECK(cudaMalloc(&d_col_idx_, nnz_ * sizeof(int)));
    }
    if (d_values_ == nullptr && nnz_ > 0) {
        CUDA_CHECK(cudaMalloc(&d_values_, nnz_ * sizeof(float)));
    }
}

void SparseMatrixCSR::free_host() {
    if (h_row_ptr_ != nullptr) {
        delete[] h_row_ptr_;
        h_row_ptr_ = nullptr;
    }
    if (h_col_idx_ != nullptr) {
        delete[] h_col_idx_;
        h_col_idx_ = nullptr;
    }
    if (h_values_ != nullptr) {
        delete[] h_values_;
        h_values_ = nullptr;
    }
}

void SparseMatrixCSR::free_device() {
    if (d_row_ptr_ != nullptr) {
        CUDA_CHECK(cudaFree(d_row_ptr_));
        d_row_ptr_ = nullptr;
    }
    if (d_col_idx_ != nullptr) {
        CUDA_CHECK(cudaFree(d_col_idx_));
        d_col_idx_ = nullptr;
    }
    if (d_values_ != nullptr) {
        CUDA_CHECK(cudaFree(d_values_));
        d_values_ = nullptr;
    }
}

void SparseMatrixCSR::copy_to_host() const {
    if (on_gpu_) {
        const_cast<SparseMatrixCSR*>(this)->allocate_host();
        CUDA_CHECK(cudaMemcpy(h_row_ptr_, d_row_ptr_, (rows_ + 1) * sizeof(int), cudaMemcpyDeviceToHost));
        if (nnz_ > 0) {
            CUDA_CHECK(cudaMemcpy(h_col_idx_, d_col_idx_, nnz_ * sizeof(int), cudaMemcpyDeviceToHost));
            CUDA_CHECK(cudaMemcpy(h_values_, d_values_, nnz_ * sizeof(float), cudaMemcpyDeviceToHost));
        }
    }
}

void SparseMatrixCSR::copy_to_device() const {
    if (!on_gpu_) {
        const_cast<SparseMatrixCSR*>(this)->allocate_device();
        CUDA_CHECK(cudaMemcpy(d_row_ptr_, h_row_ptr_, (rows_ + 1) * sizeof(int), cudaMemcpyHostToDevice));
        if (nnz_ > 0) {
            CUDA_CHECK(cudaMemcpy(d_col_idx_, h_col_idx_, nnz_ * sizeof(int), cudaMemcpyHostToDevice));
            CUDA_CHECK(cudaMemcpy(d_values_, h_values_, nnz_ * sizeof(float), cudaMemcpyHostToDevice));
        }
    }
}

Matrix spmv(const SparseMatrixCSR& A, const Matrix& x) {
    if (A.cols() != x.rows()) {
        throw std::invalid_argument("Dimensions mismatch for SpMV");
    }
    if (x.cols() != 1) {
        throw std::invalid_argument("x must be a column vector (cols == 1)");
    }

    Matrix y(A.rows(), 1, true);
    CUDA_CHECK(cudaMemset(y.device_data(), 0, A.rows() * sizeof(float)));

    int block_size = 256;
    int grid_size = (A.rows() + block_size - 1) / block_size;

    spmv_csr_kernel<<<grid_size, block_size>>>(
        A.row_ptr(), A.col_idx(), A.values(),
        x.device_data(), y.device_data(), static_cast<int>(A.rows())
    );
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    return y;
}

Matrix spmm(const SparseMatrixCSR& A, const Matrix& B) {
    if (A.cols() != B.rows()) {
        throw std::invalid_argument("Dimensions mismatch for SpMM");
    }

    size_t num_rows = A.rows();
    size_t num_cols = B.cols();
    size_t k = A.cols();

    Matrix C(num_rows, num_cols, true);
    CUDA_CHECK(cudaMemset(C.device_data(), 0, num_rows * num_cols * sizeof(float)));

    dim3 blockDim(16, 16);
    dim3 gridDim(
        (num_cols + blockDim.x - 1) / blockDim.x,
        (num_rows + blockDim.y - 1) / blockDim.y
    );

    spmm_csr_kernel<<<gridDim, blockDim>>>(
        A.row_ptr(), A.col_idx(), A.values(),
        B.device_data(), C.device_data(),
        static_cast<int>(num_rows), static_cast<int>(num_cols), static_cast<int>(k)
    );
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    return C;
}

SparseMatrixCSR sparse_transpose(const SparseMatrixCSR& A) {
    A.to_cpu();
    size_t num_rows = A.rows();
    size_t num_cols = A.cols();
    size_t nnz = A.nnz();

    std::vector<int> src_row_ptr = A.row_ptr_cpu();
    std::vector<int> src_col_idx = A.col_idx_cpu();
    std::vector<float> src_values = A.values_cpu();

    std::vector<int> dst_row_ptr(num_cols + 1, 0);
    std::vector<int> dst_col_idx(nnz);
    std::vector<float> dst_values(nnz);

    std::vector<int> col_count(num_cols, 0);
    for (size_t i = 0; i < nnz; i++) {
        col_count[src_col_idx[i]]++;
    }

    dst_row_ptr[0] = 0;
    for (size_t i = 0; i < num_cols; i++) {
        dst_row_ptr[i + 1] = dst_row_ptr[i] + col_count[i];
    }

    std::vector<int> col_offset(num_cols, 0);
    for (size_t i = 0; i < num_rows; i++) {
        int start = src_row_ptr[i];
        int end = src_row_ptr[i + 1];
        for (int j = start; j < end; j++) {
            int col = src_col_idx[j];
            int pos = dst_row_ptr[col] + col_offset[col];
            dst_col_idx[pos] = static_cast<int>(i);
            dst_values[pos] = src_values[j];
            col_offset[col]++;
        }
    }

    return SparseMatrixCSR(num_cols, num_rows, dst_row_ptr, dst_col_idx, dst_values, true);
}

SparseMatrixCSR sparse_add(const SparseMatrixCSR& A, const SparseMatrixCSR& B) {
    if (A.rows() != B.rows() || A.cols() != B.cols()) {
        throw std::invalid_argument("Matrix dimensions mismatch for addition");
    }

    A.to_cpu();
    B.to_cpu();

    size_t num_rows = A.rows();
    size_t num_cols = A.cols();

    std::vector<int> a_row_ptr = A.row_ptr_cpu();
    std::vector<int> a_col_idx = A.col_idx_cpu();
    std::vector<float> a_values = A.values_cpu();

    std::vector<int> b_row_ptr = B.row_ptr_cpu();
    std::vector<int> b_col_idx = B.col_idx_cpu();
    std::vector<float> b_values = B.values_cpu();

    std::vector<int> c_row_ptr(num_rows + 1, 0);
    std::vector<int> c_col_idx;
    std::vector<float> c_values;

    for (size_t i = 0; i < num_rows; i++) {
        int a_start = a_row_ptr[i];
        int a_end = a_row_ptr[i + 1];
        int b_start = b_row_ptr[i];
        int b_end = b_row_ptr[i + 1];

        int a_ptr = a_start;
        int b_ptr = b_start;

        while (a_ptr < a_end && b_ptr < b_end) {
            if (a_col_idx[a_ptr] == b_col_idx[b_ptr]) {
                float sum = a_values[a_ptr] + b_values[b_ptr];
                if (std::abs(sum) > 1e-10f) {
                    c_col_idx.push_back(a_col_idx[a_ptr]);
                    c_values.push_back(sum);
                }
                a_ptr++;
                b_ptr++;
            } else if (a_col_idx[a_ptr] < b_col_idx[b_ptr]) {
                c_col_idx.push_back(a_col_idx[a_ptr]);
                c_values.push_back(a_values[a_ptr]);
                a_ptr++;
            } else {
                c_col_idx.push_back(b_col_idx[b_ptr]);
                c_values.push_back(b_values[b_ptr]);
                b_ptr++;
            }
        }

        while (a_ptr < a_end) {
            c_col_idx.push_back(a_col_idx[a_ptr]);
            c_values.push_back(a_values[a_ptr]);
            a_ptr++;
        }

        while (b_ptr < b_end) {
            c_col_idx.push_back(b_col_idx[b_ptr]);
            c_values.push_back(b_values[b_ptr]);
            b_ptr++;
        }

        c_row_ptr[i + 1] = static_cast<int>(c_col_idx.size());
    }

    return SparseMatrixCSR(num_rows, num_cols, c_row_ptr, c_col_idx, c_values, true);
}

Matrix sparse_matmul_dense(const SparseMatrixCSR& A, const Matrix& B) {
    return spmm(A, B);
}

}
