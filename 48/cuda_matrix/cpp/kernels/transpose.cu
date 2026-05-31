#include "transpose.cuh"

__global__ void transpose_kernel(const float* A, float* B, size_t rows, size_t cols) {
    size_t row = blockIdx.y * blockDim.y + threadIdx.y;
    size_t col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < rows && col < cols) {
        B[col * rows + row] = A[row * cols + col];
    }
}

__global__ void transpose_shared_kernel(const float* A, float* B, size_t rows, size_t cols) {
    const int BLOCK_SIZE = 16;
    __shared__ float block[BLOCK_SIZE][BLOCK_SIZE + 1];

    size_t x = blockIdx.x * BLOCK_SIZE + threadIdx.x;
    size_t y = blockIdx.y * BLOCK_SIZE + threadIdx.y;

    if (x < cols && y < rows) {
        block[threadIdx.y][threadIdx.x] = A[y * cols + x];
    }
    __syncthreads();

    x = blockIdx.y * BLOCK_SIZE + threadIdx.x;
    y = blockIdx.x * BLOCK_SIZE + threadIdx.y;

    if (x < rows && y < cols) {
        B[y * rows + x] = block[threadIdx.x][threadIdx.y];
    }
}
