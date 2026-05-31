#pragma once

#include <vector>
#include <memory>
#include <stdexcept>
#include <cstddef>

namespace cuda_matrix {

class Matrix {
public:
    Matrix();
    Matrix(size_t rows, size_t cols, bool on_gpu = true);
    Matrix(size_t rows, size_t cols, const float* data, bool on_gpu = true);
    Matrix(const Matrix& other);
    Matrix(Matrix&& other) noexcept;
    ~Matrix();

    Matrix& operator=(const Matrix& other);
    Matrix& operator=(Matrix&& other) noexcept;

    size_t rows() const { return rows_; }
    size_t cols() const { return cols_; }
    size_t size() const { return rows_ * cols_; }
    bool on_gpu() const { return on_gpu_; }

    float* data() { return on_gpu_ ? d_data_ : h_data_; }
    const float* data() const { return on_gpu_ ? d_data_ : h_data_; }

    float* host_data();
    const float* host_data() const;
    float* device_data();
    const float* device_data() const;

    void to_cpu();
    void to_gpu();

    static Matrix zeros(size_t rows, size_t cols, bool on_gpu = true);
    static Matrix ones(size_t rows, size_t cols, bool on_gpu = true);
    static Matrix identity(size_t n, bool on_gpu = true);
    static Matrix random(size_t rows, size_t cols, float min = 0.0f, float max = 1.0f, bool on_gpu = true);

    static size_t get_available_gpu_memory();
    static size_t get_total_gpu_memory();

private:
    size_t rows_;
    size_t cols_;
    bool on_gpu_;
    float* h_data_;
    float* d_data_;

    void allocate_host();
    void allocate_device();
    void free_host();
    void free_device();
    void copy_to_host() const;
    void copy_to_device() const;

    static void check_gpu_memory(size_t required_bytes);
};

Matrix multiply(const Matrix& A, const Matrix& B);
Matrix transpose(const Matrix& A);
Matrix inverse(const Matrix& A);
std::pair<std::vector<float>, Matrix> eigenvalues(const Matrix& A, int max_iter = 1000, float tol = 1e-6);

}
