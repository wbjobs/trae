function createMatrix(N) {
    return new Float32Array(N * N);
}

function randomMatrix(mat, N) {
    for (let i = 0; i < N * N; i++) {
        mat[i] = Math.random();
    }
}

function zeroMatrix(mat, N) {
    mat.fill(0);
}

function matmulJS(A, B, C, N) {
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let sum = 0;
            for (let k = 0; k < N; k++) {
                sum += A[i * N + k] * B[k * N + j];
            }
            C[i * N + j] = sum;
        }
    }
}

function matmulJSOptimized(A, B, C, N) {
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) {
            const a = A[i * N + k];
            for (let j = 0; j < N; j++) {
                C[i * N + j] += a * B[k * N + j];
            }
        }
    }
}

function matmulJSTiled(A, B, C, N, blockSize) {
    for (let i = 0; i < N; i += blockSize) {
        for (let j = 0; j < N; j += blockSize) {
            for (let k = 0; k < N; k += blockSize) {
                const iMax = Math.min(i + blockSize, N);
                const jMax = Math.min(j + blockSize, N);
                const kMax = Math.min(k + blockSize, N);

                for (let ii = i; ii < iMax; ii++) {
                    for (let kk = k; kk < kMax; kk++) {
                        const a = A[ii * N + kk];
                        for (let jj = j; jj < jMax; jj++) {
                            C[ii * N + jj] += a * B[kk * N + jj];
                        }
                    }
                }
            }
        }
    }
}
