#include <emscripten.h>
#include <vector>
#include <cstdlib>
#include <ctime>
#include <cstring>

using namespace std;

extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void matmul(const float* A, const float* B, float* C, int N) {
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                float sum = 0.0f;
                for (int k = 0; k < N; k++) {
                    sum += A[i * N + k] * B[k * N + j];
                }
                C[i * N + j] = sum;
            }
        }
    }

    EMSCRIPTEN_KEEPALIVE
    void matmul_optimized(const float* A, const float* B, float* C, int N) {
        for (int i = 0; i < N; i++) {
            for (int k = 0; k < N; k++) {
                float a = A[i * N + k];
                for (int j = 0; j < N; j++) {
                    C[i * N + j] += a * B[k * N + j];
                }
            }
        }
    }

    EMSCRIPTEN_KEEPALIVE
    void matmul_tiled(const float* A, const float* B, float* C, int N, int block_size) {
        for (int i = 0; i < N; i += block_size) {
            for (int j = 0; j < N; j += block_size) {
                for (int k = 0; k < N; k += block_size) {
                    int i_max = (i + block_size < N) ? i + block_size : N;
                    int j_max = (j + block_size < N) ? j + block_size : N;
                    int k_max = (k + block_size < N) ? k + block_size : N;

                    for (int ii = i; ii < i_max; ii++) {
                        for (int kk = k; kk < k_max; kk++) {
                            float a = A[ii * N + kk];
                            for (int jj = j; jj < j_max; jj++) {
                                C[ii * N + jj] += a * B[kk * N + jj];
                            }
                        }
                    }
                }
            }
        }
    }

    EMSCRIPTEN_KEEPALIVE
    float* create_matrix(int N) {
        float* mat = (float*)malloc(N * N * sizeof(float));
        return mat;
    }

    EMSCRIPTEN_KEEPALIVE
    void free_matrix(float* mat) {
        free(mat);
    }

    EMSCRIPTEN_KEEPALIVE
    void random_matrix(float* mat, int N) {
        srand(time(NULL));
        for (int i = 0; i < N * N; i++) {
            mat[i] = (float)rand() / RAND_MAX;
        }
    }

    EMSCRIPTEN_KEEPALIVE
    void zero_matrix(float* mat, int N) {
        memset(mat, 0, N * N * sizeof(float));
    }
}
