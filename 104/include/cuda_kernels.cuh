#pragma once

#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <thrust/device_vector.h>
#include <thrust/fill.h>
#include "csr_matrix.hpp"

namespace cuda_kernels {

__global__ void csr_spmv_kernel(
    const int* __restrict__ row_ptr,
    const int* __restrict__ col_idx,
    const float* __restrict__ values,
    const float* __restrict__ x,
    float* __restrict__ y,
    int rows)
{
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < rows) {
        float sum = 0.0f;
        int start = row_ptr[row];
        int end = row_ptr[row + 1];
        for (int i = start; i < end; ++i) {
            sum += values[i] * x[col_idx[i]];
        }
        y[row] = sum;
    }
}

__global__ void csr_spmv_transpose_kernel(
    const int* __restrict__ row_ptr,
    const int* __restrict__ col_idx,
    const float* __restrict__ values,
    const float* __restrict__ x,
    float* __restrict__ y,
    int rows)
{
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < rows) {
        float x_val = x[row];
        int start = row_ptr[row];
        int end = row_ptr[row + 1];
        for (int i = start; i < end; ++i) {
            int j = col_idx[i];
            atomicAdd(&y[j], values[i] * x_val);
        }
    }
}

__global__ void csr_spmv_fp16_kernel(
    const int* __restrict__ row_ptr,
    const int* __restrict__ col_idx,
    const __half* __restrict__ half_values,
    const float* __restrict__ x,
    float* __restrict__ y,
    int rows)
{
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < rows) {
        float sum = 0.0f;
        int start = row_ptr[row];
        int end = row_ptr[row + 1];
        for (int i = start; i < end; ++i) {
            __half v = half_values[i];
            float xv = x[col_idx[i]];
            __half xh = __float2half(xv);
            __half prod = __hmul(v, xh);
            sum += __half2float(prod);
        }
        y[row] = sum;
    }
}

__global__ void csr_spmv_transpose_fp16_kernel(
    const int* __restrict__ row_ptr,
    const int* __restrict__ col_idx,
    const __half* __restrict__ half_values,
    const float* __restrict__ x,
    float* __restrict__ y,
    int rows)
{
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < rows) {
        float xv = x[row];
        __half xh = __float2half(xv);
        int start = row_ptr[row];
        int end = row_ptr[row + 1];
        for (int i = start; i < end; ++i) {
            __half v = half_values[i];
            __half prod = __hmul(v, xh);
            atomicAdd(&y[col_idx[i]], __half2float(prod));
        }
    }
}

__global__ void vector_scale_kernel(float* v, float alpha, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        v[idx] *= alpha;
    }
}

__global__ void vector_axpy_kernel(float* y, const float* x, float alpha, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        y[idx] += alpha * x[idx];
    }
}

__global__ void vector_copy_kernel(float* dst, const float* src, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        dst[idx] = src[idx];
    }
}

__global__ void vector_set_kernel(float* v, float val, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        v[idx] = val;
    }
}

inline void csr_spmv(const CSRMatrix& A,
                 const thrust::device_vector<float>& x,
                 thrust::device_vector<float>& y,
                 bool transpose = false)
{
    int threads = 256;
    if (!transpose) {
        int blocks = (A.rows + threads - 1) / threads;
        csr_spmv_kernel<<<blocks, threads>>>(
            A.row_ptr_ptr(), A.col_idx_ptr(), A.values_ptr(),
            thrust::raw_pointer_cast(x.data()),
            thrust::raw_pointer_cast(y.data()),
            A.rows);
    } else {
        thrust::fill(y.begin(), y.end(), 0.0f);
        int blocks = (A.rows + threads - 1) / threads;
        csr_spmv_transpose_kernel<<<blocks, threads>>>(
            A.row_ptr_ptr(), A.col_idx_ptr(), A.values_ptr(),
            thrust::raw_pointer_cast(x.data()),
            thrust::raw_pointer_cast(y.data()),
            A.rows);
    }
}

inline void csr_spmv_fp16(const CSRMatrix& A,
                      const thrust::device_vector<float>& x,
                      thrust::device_vector<float>& y,
                      bool transpose = false)
{
    int threads = 256;
    if (!transpose) {
        int blocks = (A.rows + threads - 1) / threads;
        csr_spmv_fp16_kernel<<<blocks, threads>>>(
            A.row_ptr_ptr(), A.col_idx_ptr(), A.half_values_ptr(),
            thrust::raw_pointer_cast(x.data()),
            thrust::raw_pointer_cast(y.data()),
            A.rows);
    } else {
        thrust::fill(y.begin(), y.end(), 0.0f);
        int blocks = (A.rows + threads - 1) / threads;
        csr_spmv_transpose_fp16_kernel<<<blocks, threads>>>(
            A.row_ptr_ptr(), A.col_idx_ptr(), A.half_values_ptr(),
            thrust::raw_pointer_cast(x.data()),
            thrust::raw_pointer_cast(y.data()),
            A.rows);
    }
}

inline void vector_scale(thrust::device_vector<float>& v, float alpha) {
    int n = v.size();
    int threads = 256;
    int blocks = (n + threads - 1) / threads;
    vector_scale_kernel<<<blocks, threads>>>(thrust::raw_pointer_cast(v.data()), alpha, n);
}

inline void vector_axpy(thrust::device_vector<float>& y,
                       const thrust::device_vector<float>& x, float alpha) {
    int n = y.size();
    int threads = 256;
    int blocks = (n + threads - 1) / threads;
    vector_axpy_kernel<<<blocks, threads>>>(
        thrust::raw_pointer_cast(y.data()),
        thrust::raw_pointer_cast(x.data()), alpha, n);
}

inline void vector_copy(thrust::device_vector<float>& dst,
                      const thrust::device_vector<float>& src) {
    int n = dst.size();
    int threads = 256;
    int blocks = (n + threads - 1) / threads;
    vector_copy_kernel<<<blocks, threads>>>(
        thrust::raw_pointer_cast(dst.data()),
        thrust::raw_pointer_cast(src.data()), n);
}

inline void vector_set(thrust::device_vector<float>& v, float val) {
    int n = v.size();
    int threads = 256;
    int blocks = (n + threads - 1) / threads;
    vector_set_kernel<<<blocks, threads>>>(thrust::raw_pointer_cast(v.data()), val, n);
}

} // namespace cuda_kernels
