#include "sparse.cuh"

__global__ void spmv_csr_kernel(
    const int* row_ptr, const int* col_idx, const float* values,
    const float* x, float* y, int num_rows) {
    int row = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < num_rows) {
        float sum = 0.0f;
        int row_start = row_ptr[row];
        int row_end = row_ptr[row + 1];

        for (int j = row_start; j < row_end; j++) {
            sum += values[j] * x[col_idx[j]];
        }
        y[row] = sum;
    }
}

__global__ void spmm_csr_kernel(
    const int* row_ptr, const int* col_idx, const float* values,
    const float* B, float* C, int num_rows, int num_cols, int k) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < num_rows && col < num_cols) {
        float sum = 0.0f;
        int row_start = row_ptr[row];
        int row_end = row_ptr[row + 1];

        for (int j = row_start; j < row_end; j++) {
            sum += values[j] * B[col_idx[j] * num_cols + col];
        }
        C[row * num_cols + col] = sum;
    }
}

__global__ void sparse_transpose_csr_kernel(
    const int* src_row_ptr, const int* src_col_idx, const float* src_values,
    int* dst_row_ptr, int* dst_col_idx, float* dst_values,
    int num_rows, int num_cols, int nnz) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (idx < nnz) {
        int src_row = 0;
        for (int i = 0; i <= num_rows; i++) {
            if (idx < src_row_ptr[i]) {
                src_row = i - 1;
                break;
            }
        }
        int src_col = src_col_idx[idx];
        float val = src_values[idx];

        int pos = atomicAdd(&dst_row_ptr[src_col + 1], 1);
        dst_col_idx[pos] = src_row;
        dst_values[pos] = val;
    }
}
