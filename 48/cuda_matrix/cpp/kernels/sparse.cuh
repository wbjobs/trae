#pragma once

__global__ void spmv_csr_kernel(
    const int* row_ptr, const int* col_idx, const float* values,
    const float* x, float* y, int num_rows);

__global__ void spmm_csr_kernel(
    const int* row_ptr, const int* col_idx, const float* values,
    const float* B, float* C, int num_rows, int num_cols, int k);

__global__ void sparse_transpose_csr_kernel(
    const int* src_row_ptr, const int* src_col_idx, const float* src_values,
    int* dst_row_ptr, int* dst_col_idx, float* dst_values,
    int num_rows, int num_cols, int nnz);
