#include "matmul.cuh"

__global__ void matmul_kernel(const float* A, const float* B, float* C, size_t M, size_t N, size_t K) {
    size_t row = blockIdx.y * blockDim.y + threadIdx.y;
    size_t col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < M && col < N) {
        float sum = 0.0f;
        for (size_t k = 0; k < K; k++) {
            sum += A[row * K + k] * B[k * N + col];
        }
        C[row * N + col] = sum;
    }
}

__global__ void matmul_tiled_kernel(const float* A, const float* B, float* C, size_t M, size_t N, size_t K) {
    const int BLOCK_SIZE = 16;
    __shared__ float shared_A[BLOCK_SIZE][BLOCK_SIZE];
    __shared__ float shared_B[BLOCK_SIZE][BLOCK_SIZE];

    size_t block_row = blockIdx.y;
    size_t block_col = blockIdx.x;
    size_t thread_row = threadIdx.y;
    size_t thread_col = threadIdx.x;

    size_t row = block_row * BLOCK_SIZE + thread_row;
    size_t col = block_col * BLOCK_SIZE + thread_col;

    float sum = 0.0f;

    size_t num_phases = (K + BLOCK_SIZE - 1) / BLOCK_SIZE;

    for (size_t phase = 0; phase < num_phases; phase++) {
        size_t a_col = phase * BLOCK_SIZE + thread_col;
        size_t b_row = phase * BLOCK_SIZE + thread_row;

        if (row < M && a_col < K) {
            shared_A[thread_row][thread_col] = A[row * K + a_col];
        } else {
            shared_A[thread_row][thread_col] = 0.0f;
        }

        if (b_row < K && col < N) {
            shared_B[thread_row][thread_col] = B[b_row * N + col];
        } else {
            shared_B[thread_row][thread_col] = 0.0f;
        }

        __syncthreads();

        for (int k = 0; k < BLOCK_SIZE; k++) {
            sum += shared_A[thread_row][k] * shared_B[k][thread_col];
        }

        __syncthreads();
    }

    if (row < M && col < N) {
        C[row * N + col] = sum;
    }
}
