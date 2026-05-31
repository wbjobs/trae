#pragma once

__global__ void transpose_kernel(const float* A, float* B, size_t rows, size_t cols);
__global__ void transpose_shared_kernel(const float* A, float* B, size_t rows, size_t cols);
