#include "matrix.h"
#include "../kernels/matmul.cuh"
#include "../kernels/transpose.cuh"
#include <cuda_runtime.h>
#include <random>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <iostream>
#include <string>

#define CUDA_CHECK(err) \
    if (err != cudaSuccess) { \
        throw std::runtime_error("CUDA error: " + std::string(cudaGetErrorString(err))); \
    }

namespace cuda_matrix {

size_t Matrix::get_total_gpu_memory() {
    size_t free_mem, total_mem;
    CUDA_CHECK(cudaMemGetInfo(&free_mem, &total_mem));
    return total_mem;
}

size_t Matrix::get_available_gpu_memory() {
    size_t free_mem, total_mem;
    CUDA_CHECK(cudaMemGetInfo(&free_mem, &total_mem));
    return free_mem;
}

void Matrix::check_gpu_memory(size_t required_bytes) {
    size_t free_mem = get_available_gpu_memory();
    if (required_bytes > free_mem) {
        throw std::runtime_error(
            "Insufficient GPU memory: required " + std::to_string(required_bytes / (1024 * 1024)) +
            " MB, available " + std::to_string(free_mem / (1024 * 1024)) + " MB"
        );
    }
}

Matrix::Matrix() : rows_(0), cols_(0), on_gpu_(true), h_data_(nullptr), d_data_(nullptr) {}

Matrix::Matrix(size_t rows, size_t cols, bool on_gpu) : rows_(rows), cols_(cols), on_gpu_(on_gpu), h_data_(nullptr), d_data_(nullptr) {
    if (rows == 0 || cols == 0) {
        throw std::invalid_argument("Matrix dimensions must be positive");
    }
    size_t total_bytes = rows * cols * sizeof(float);
    if (on_gpu_) {
        check_gpu_memory(total_bytes);
        allocate_device();
    } else {
        allocate_host();
    }
}

Matrix::Matrix(size_t rows, size_t cols, const float* data, bool on_gpu) : rows_(rows), cols_(cols), on_gpu_(on_gpu), h_data_(nullptr), d_data_(nullptr) {
    if (rows == 0 || cols == 0) {
        throw std::invalid_argument("Matrix dimensions must be positive");
    }
    size_t total_bytes = rows * cols * sizeof(float);
    if (on_gpu_) {
        check_gpu_memory(total_bytes);
        allocate_device();
        CUDA_CHECK(cudaMemcpy(d_data_, data, total_bytes, cudaMemcpyHostToDevice));
    } else {
        allocate_host();
        std::memcpy(h_data_, data, total_bytes);
    }
}

Matrix::Matrix(const Matrix& other) : rows_(other.rows_), cols_(other.cols_), on_gpu_(other.on_gpu_), h_data_(nullptr), d_data_(nullptr) {
    size_t total_bytes = rows_ * cols_ * sizeof(float);
    if (on_gpu_) {
        check_gpu_memory(total_bytes);
        allocate_device();
        CUDA_CHECK(cudaMemcpy(d_data_, other.d_data_, total_bytes, cudaMemcpyDeviceToDevice));
    } else {
        allocate_host();
        std::memcpy(h_data_, other.h_data_, total_bytes);
    }
}

Matrix::Matrix(Matrix&& other) noexcept : rows_(other.rows_), cols_(other.cols_), on_gpu_(other.on_gpu_), h_data_(other.h_data_), d_data_(other.d_data_) {
    other.rows_ = 0;
    other.cols_ = 0;
    other.h_data_ = nullptr;
    other.d_data_ = nullptr;
}

Matrix::~Matrix() {
    free_host();
    free_device();
}

Matrix& Matrix::operator=(const Matrix& other) {
    if (this != &other) {
        free_host();
        free_device();
        rows_ = other.rows_;
        cols_ = other.cols_;
        on_gpu_ = other.on_gpu_;
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        if (on_gpu_) {
            check_gpu_memory(total_bytes);
            allocate_device();
            CUDA_CHECK(cudaMemcpy(d_data_, other.d_data_, total_bytes, cudaMemcpyDeviceToDevice));
        } else {
            allocate_host();
            std::memcpy(h_data_, other.h_data_, total_bytes);
        }
    }
    return *this;
}

Matrix& Matrix::operator=(Matrix&& other) noexcept {
    if (this != &other) {
        free_host();
        free_device();
        rows_ = other.rows_;
        cols_ = other.cols_;
        on_gpu_ = other.on_gpu_;
        h_data_ = other.h_data_;
        d_data_ = other.d_data_;
        other.rows_ = 0;
        other.cols_ = 0;
        other.h_data_ = nullptr;
        other.d_data_ = nullptr;
    }
    return *this;
}

float* Matrix::host_data() {
    copy_to_host();
    return h_data_;
}

const float* Matrix::host_data() const {
    copy_to_host();
    return h_data_;
}

float* Matrix::device_data() {
    copy_to_device();
    return d_data_;
}

const float* Matrix::device_data() const {
    copy_to_device();
    return d_data_;
}

void Matrix::to_cpu() {
    if (on_gpu_) {
        copy_to_host();
        free_device();
        on_gpu_ = false;
    }
}

void Matrix::to_gpu() {
    if (!on_gpu_) {
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        check_gpu_memory(total_bytes);
        copy_to_device();
        free_host();
        on_gpu_ = true;
    }
}

Matrix Matrix::zeros(size_t rows, size_t cols, bool on_gpu) {
    Matrix m(rows, cols, on_gpu);
    size_t total_bytes = rows * cols * sizeof(float);
    if (on_gpu) {
        CUDA_CHECK(cudaMemset(m.d_data_, 0, total_bytes));
    } else {
        std::memset(m.h_data_, 0, total_bytes);
    }
    return m;
}

Matrix Matrix::ones(size_t rows, size_t cols, bool on_gpu) {
    Matrix m(rows, cols, false);
    for (size_t i = 0; i < rows * cols; i++) {
        m.h_data_[i] = 1.0f;
    }
    if (on_gpu) {
        m.to_gpu();
    }
    return m;
}

Matrix Matrix::identity(size_t n, bool on_gpu) {
    Matrix m = zeros(n, n, false);
    for (size_t i = 0; i < n; i++) {
        m.h_data_[i * n + i] = 1.0f;
    }
    if (on_gpu) {
        m.to_gpu();
    }
    return m;
}

Matrix Matrix::random(size_t rows, size_t cols, float min, float max, bool on_gpu) {
    Matrix m(rows, cols, false);
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<float> dist(min, max);
    for (size_t i = 0; i < rows * cols; i++) {
        m.h_data_[i] = dist(gen);
    }
    if (on_gpu) {
        m.to_gpu();
    }
    return m;
}

void Matrix::allocate_host() {
    if (h_data_ == nullptr) {
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        h_data_ = new float[rows_ * cols_];
    }
}

void Matrix::allocate_device() {
    if (d_data_ == nullptr) {
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        CUDA_CHECK(cudaMalloc(&d_data_, total_bytes));
    }
}

void Matrix::free_host() {
    if (h_data_ != nullptr) {
        delete[] h_data_;
        h_data_ = nullptr;
    }
}

void Matrix::free_device() {
    if (d_data_ != nullptr) {
        CUDA_CHECK(cudaFree(d_data_));
        d_data_ = nullptr;
    }
}

void Matrix::copy_to_host() const {
    if (on_gpu_ && h_data_ == nullptr) {
        const_cast<Matrix*>(this)->allocate_host();
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        CUDA_CHECK(cudaMemcpy(h_data_, d_data_, total_bytes, cudaMemcpyDeviceToHost));
    }
}

void Matrix::copy_to_device() const {
    if (!on_gpu_ && d_data_ == nullptr) {
        const_cast<Matrix*>(this)->allocate_device();
        size_t total_bytes = rows_ * cols_ * sizeof(float);
        CUDA_CHECK(cudaMemcpy(d_data_, h_data_, total_bytes, cudaMemcpyHostToDevice));
    }
}

Matrix multiply(const Matrix& A, const Matrix& B) {
    if (A.cols() != B.rows()) {
        throw std::invalid_argument("Matrix dimensions mismatch for multiplication");
    }

    size_t M = A.rows();
    size_t K = A.cols();
    size_t N = B.cols();

    size_t output_bytes = M * N * sizeof(float);
    Matrix::check_gpu_memory(output_bytes);

    Matrix C(M, N, true);

    const int BLOCK_SIZE = 16;

    size_t grid_x = (N + BLOCK_SIZE - 1) / BLOCK_SIZE;
    size_t grid_y = (M + BLOCK_SIZE - 1) / BLOCK_SIZE;

    const size_t MAX_GRID_DIM = 65535;
    if (grid_x > MAX_GRID_DIM || grid_y > MAX_GRID_DIM) {
        size_t tile_size = 2048;
        size_t num_tiles_m = (M + tile_size - 1) / tile_size;
        size_t num_tiles_n = (N + tile_size - 1) / tile_size;
        size_t num_tiles_k = (K + tile_size - 1) / tile_size;

        CUDA_CHECK(cudaMemset(C.device_data(), 0, output_bytes));

        for (size_t tm = 0; tm < num_tiles_m; tm++) {
            size_t m_start = tm * tile_size;
            size_t m_end = std::min((tm + 1) * tile_size, M);
            size_t m_count = m_end - m_start;

            for (size_t tn = 0; tn < num_tiles_n; tn++) {
                size_t n_start = tn * tile_size;
                size_t n_end = std::min((tn + 1) * tile_size, N);
                size_t n_count = n_end - n_start;

                Matrix tile_C(m_count, n_count, true);
                CUDA_CHECK(cudaMemset(tile_C.device_data(), 0, m_count * n_count * sizeof(float)));

                for (size_t tk = 0; tk < num_tiles_k; tk++) {
                    size_t k_start = tk * tile_size;
                    size_t k_end = std::min((tk + 1) * tile_size, K);
                    size_t k_count = k_end - k_start;

                    Matrix tile_A(m_count, k_count, true);
                    Matrix tile_B(k_count, n_count, true);

                    for (size_t i = 0; i < m_count; i++) {
                        CUDA_CHECK(cudaMemcpy(
                            tile_A.device_data() + i * k_count,
                            A.device_data() + (m_start + i) * K + k_start,
                            k_count * sizeof(float),
                            cudaMemcpyDeviceToDevice
                        ));
                    }

                    for (size_t i = 0; i < k_count; i++) {
                        CUDA_CHECK(cudaMemcpy(
                            tile_B.device_data() + i * n_count,
                            B.device_data() + (k_start + i) * N + n_start,
                            n_count * sizeof(float),
                            cudaMemcpyDeviceToDevice
                        ));
                    }

                    Matrix tile_temp(m_count, n_count, true);

                    dim3 blockDim_t(BLOCK_SIZE, BLOCK_SIZE);
                    dim3 gridDim_t(
                        (n_count + BLOCK_SIZE - 1) / BLOCK_SIZE,
                        (m_count + BLOCK_SIZE - 1) / BLOCK_SIZE
                    );

                    matmul_tiled_kernel<<<gridDim_t, blockDim_t>>>(
                        tile_A.device_data(), tile_B.device_data(), tile_temp.device_data(),
                        m_count, n_count, k_count
                    );
                    CUDA_CHECK(cudaGetLastError());
                    CUDA_CHECK(cudaDeviceSynchronize());

                    float* temp_cpu = tile_temp.host_data();
                    float* c_cpu = tile_C.host_data();
                    for (size_t i = 0; i < m_count * n_count; i++) {
                        c_cpu[i] += temp_cpu[i];
                    }
                    tile_C.to_gpu();
                }

                for (size_t i = 0; i < m_count; i++) {
                    CUDA_CHECK(cudaMemcpy(
                        C.device_data() + (m_start + i) * N + n_start,
                        tile_C.device_data() + i * n_count,
                        n_count * sizeof(float),
                        cudaMemcpyDeviceToDevice
                    ));
                }
            }
        }
    } else {
        dim3 blockDim(BLOCK_SIZE, BLOCK_SIZE);
        dim3 gridDim(grid_x, grid_y);

        matmul_tiled_kernel<<<gridDim, blockDim>>>(
            A.device_data(), B.device_data(), C.device_data(),
            M, N, K
        );
        CUDA_CHECK(cudaGetLastError());
        CUDA_CHECK(cudaDeviceSynchronize());
    }

    return C;
}

Matrix transpose(const Matrix& A) {
    Matrix B(A.cols(), A.rows(), true);

    const int BLOCK_SIZE = 16;
    dim3 blockDim(BLOCK_SIZE, BLOCK_SIZE);
    dim3 gridDim(
        (A.cols() + BLOCK_SIZE - 1) / BLOCK_SIZE,
        (A.rows() + BLOCK_SIZE - 1) / BLOCK_SIZE
    );

    transpose_shared_kernel<<<gridDim, blockDim>>>(
        A.device_data(), B.device_data(), A.rows(), A.cols()
    );
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    return B;
}

Matrix inverse(const Matrix& A) {
    if (A.rows() != A.cols()) {
        throw std::invalid_argument("Matrix must be square for inversion");
    }

    size_t n = A.rows();
    Matrix a_cpu = A;
    a_cpu.to_cpu();
    float* a = a_cpu.host_data();

    Matrix result = Matrix::identity(n, false);
    float* inv = result.host_data();

    std::vector<float> aug(n * 2 * n);
    for (size_t i = 0; i < n; i++) {
        for (size_t j = 0; j < n; j++) {
            aug[i * 2 * n + j] = a[i * n + j];
        }
        for (size_t j = 0; j < n; j++) {
            aug[i * 2 * n + n + j] = (i == j) ? 1.0f : 0.0f;
        }
    }

    for (size_t col = 0; col < n; col++) {
        size_t pivot_row = col;
        float max_val = std::abs(aug[col * 2 * n + col]);
        for (size_t row = col + 1; row < n; row++) {
            float val = std::abs(aug[row * 2 * n + col]);
            if (val > max_val) {
                max_val = val;
                pivot_row = row;
            }
        }

        if (max_val < 1e-10f) {
            throw std::runtime_error("Matrix is singular, cannot invert");
        }

        if (pivot_row != col) {
            for (size_t j = 0; j < 2 * n; j++) {
                std::swap(aug[col * 2 * n + j], aug[pivot_row * 2 * n + j]);
            }
        }

        float pivot = aug[col * 2 * n + col];
        for (size_t j = 0; j < 2 * n; j++) {
            aug[col * 2 * n + j] /= pivot;
        }

        for (size_t row = 0; row < n; row++) {
            if (row != col) {
                float factor = aug[row * 2 * n + col];
                for (size_t j = 0; j < 2 * n; j++) {
                    aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j];
                }
            }
        }
    }

    for (size_t i = 0; i < n; i++) {
        for (size_t j = 0; j < n; j++) {
            inv[i * n + j] = aug[i * 2 * n + n + j];
        }
    }

    result.to_gpu();
    return result;
}

std::pair<std::vector<float>, Matrix> eigenvalues(const Matrix& A, int max_iter, float tol) {
    if (A.rows() != A.cols()) {
        throw std::invalid_argument("Matrix must be square for eigenvalue computation");
    }

    size_t n = A.rows();
    Matrix A_k = A;
    A_k.to_cpu();
    float* data = A_k.host_data();

    std::vector<std::vector<float>> Q_total(n, std::vector<float>(n, 0.0f));
    for (size_t i = 0; i < n; i++) {
        Q_total[i][i] = 1.0f;
    }

    for (int iter = 0; iter < max_iter; iter++) {
        std::vector<std::vector<float>> Q(n, std::vector<float>(n, 0.0f));
        std::vector<std::vector<float>> R(n, std::vector<float>(n, 0.0f));
        std::vector<std::vector<float>> Ak(n, std::vector<float>(n, 0.0f));

        for (size_t i = 0; i < n; i++) {
            for (size_t j = 0; j < n; j++) {
                Ak[i][j] = data[i * n + j];
            }
        }

        for (size_t col = 0; col < n; col++) {
            std::vector<float> v(n);
            for (size_t i = 0; i < n; i++) {
                v[i] = Ak[i][col];
            }

            for (size_t prev = 0; prev < col; prev++) {
                float dot = 0.0f;
                for (size_t i = 0; i < n; i++) {
                    dot += v[i] * Q[i][prev];
                }
                R[prev][col] = dot;
                for (size_t i = 0; i < n; i++) {
                    v[i] -= dot * Q[i][prev];
                }
            }

            float norm = 0.0f;
            for (size_t i = 0; i < n; i++) {
                norm += v[i] * v[i];
            }
            norm = std::sqrt(norm);

            if (norm < 1e-10f) {
                throw std::runtime_error("Matrix is rank-deficient");
            }

            R[col][col] = norm;
            for (size_t i = 0; i < n; i++) {
                Q[i][col] = v[i] / norm;
            }
        }

        std::vector<std::vector<float>> new_Ak(n, std::vector<float>(n, 0.0f));
        for (size_t i = 0; i < n; i++) {
            for (size_t j = 0; j < n; j++) {
                for (size_t k = 0; k < n; k++) {
                    new_Ak[i][j] += R[i][k] * Q[k][j];
                }
            }
        }

        std::vector<std::vector<float>> new_Q_total(n, std::vector<float>(n, 0.0f));
        for (size_t i = 0; i < n; i++) {
            for (size_t j = 0; j < n; j++) {
                for (size_t k = 0; k < n; k++) {
                    new_Q_total[i][j] += Q_total[i][k] * Q[k][j];
                }
            }
        }
        Q_total = new_Q_total;

        float off_diag = 0.0f;
        for (size_t i = 0; i < n; i++) {
            for (size_t j = 0; j < n; j++) {
                data[i * n + j] = new_Ak[i][j];
                if (i != j) {
                    off_diag += new_Ak[i][j] * new_Ak[i][j];
                }
            }
        }

        if (std::sqrt(off_diag) < tol) {
            break;
        }
    }

    std::vector<float> eigenvalues(n);
    for (size_t i = 0; i < n; i++) {
        eigenvalues[i] = data[i * n + i];
    }

    Matrix eigenvectors(n, n, false);
    float* eig_vec_data = eigenvectors.host_data();
    for (size_t i = 0; i < n; i++) {
        for (size_t j = 0; j < n; j++) {
            eig_vec_data[i * n + j] = Q_total[i][j];
        }
    }
    eigenvectors.to_gpu();

    return {eigenvalues, eigenvectors};
}

}
