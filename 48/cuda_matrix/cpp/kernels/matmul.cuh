#pragma once

__global__ void matmul_kernel(const float* A, const float* B, float* C, size_t M, size_t N, size_t K);
__global__ void matmul_tiled_kernel(const float* A, const float* B, float* C, size_t M, size_t N, size_t K);
