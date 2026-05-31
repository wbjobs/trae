#pragma once

#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <thrust/device_vector.h>
#include <vector>
#include <stdexcept>
#include <cstring>

struct CSRMatrix {
    int rows;
    int cols;
    int nnz;
    thrust::device_vector<int> row_ptr;
    thrust::device_vector<int> col_idx;
    thrust::device_vector<float> values;
    __half* d_half_values;

    CSRMatrix() : rows(0), cols(0), nnz(0), d_half_values(nullptr) {}

    CSRMatrix(int r, int c, int n,
              const std::vector<int>& h_row_ptr,
              const std::vector<int>& h_col_idx,
              const std::vector<float>& h_values)
        : rows(r), cols(c), nnz(n),
          row_ptr(h_row_ptr.begin(), h_row_ptr.end()),
          col_idx(h_col_idx.begin(), h_col_idx.end()),
          values(h_values.begin(), h_values.end()),
          d_half_values(nullptr)
    {
        if (nnz > 0) {
            cudaMalloc(&d_half_values, nnz * sizeof(__half));
            std::vector<unsigned short> h_half_bits(nnz);
            for (int i = 0; i < nnz; ++i) {
                __half hv = __float2half_rn(h_values[i]);
                h_half_bits[i] = *reinterpret_cast<unsigned short*>(&hv);
            }
            cudaMemcpy(d_half_values, h_half_bits.data(),
                       nnz * sizeof(__half), cudaMemcpyHostToDevice);
        }
    }

    ~CSRMatrix() {
        if (d_half_values) {
            cudaFree(d_half_values);
            d_half_values = nullptr;
        }
    }

    CSRMatrix(const CSRMatrix&) = delete;
    CSRMatrix& operator=(const CSRMatrix&) = delete;

    CSRMatrix(CSRMatrix&& other) noexcept
        : rows(other.rows), cols(other.cols), nnz(other.nnz),
          row_ptr(std::move(other.row_ptr)),
          col_idx(std::move(other.col_idx)),
          values(std::move(other.values)),
          d_half_values(other.d_half_values)
    {
        other.d_half_values = nullptr;
    }

    int* row_ptr_ptr() { return thrust::raw_pointer_cast(row_ptr.data()); }
    int* col_idx_ptr() { return thrust::raw_pointer_cast(col_idx.data()); }
    float* values_ptr() { return thrust::raw_pointer_cast(values.data()); }
    __half* half_values_ptr() { return d_half_values; }
    const int* row_ptr_ptr() const { return thrust::raw_pointer_cast(row_ptr.data()); }
    const int* col_idx_ptr() const { return thrust::raw_pointer_cast(col_idx.data()); }
    const float* values_ptr() const { return thrust::raw_pointer_cast(values.data()); }
    const __half* half_values_ptr() const { return d_half_values; }
};
