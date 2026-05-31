#include "astro_stack/cross_correlation.h"
#include "cuda_cross_correlation_impl.h"

#include <cuda_runtime.h>
#include <cufft.h>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <algorithm>

namespace astro_stack {

namespace {

__global__ void padImageKernel(
    const float* __restrict__ src,
    float* __restrict__ dst,
    int src_w, int src_h,
    int pad)
{
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x < pad && y < pad) {
        if (x < src_w && y < src_h) {
            dst[y * pad + x] = src[y * src_w + x];
        } else {
            dst[y * pad + x] = 0.0f;
        }
    }
}

__global__ void batchPadImagesKernel(
    const float* const* __restrict__ src_ptrs,
    float* __restrict__ dst_batch,
    const int* src_ws, const int* src_hs,
    int pad, int batch_size)
{
    int img_idx = blockIdx.z;
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (img_idx >= batch_size || x >= pad || y >= pad) return;

    int src_w = src_ws[img_idx];
    int src_h = src_hs[img_idx];
    const float* src = src_ptrs[img_idx];

    size_t offset = static_cast<size_t>(img_idx) * pad * pad;

    if (x < src_w && y < src_h) {
        dst_batch[offset + y * pad + x] = src[y * src_w + x];
    } else {
        dst_batch[offset + y * pad + x] = 0.0f;
    }
}

__global__ void batchMultiplyConjugateKernel(
    const cufftComplex* __restrict__ ref_fft,
    const cufftComplex* __restrict__ tgt_fft_batch,
    cufftComplex* __restrict__ cross_batch,
    int complex_N, int batch_size)
{
    int img_idx = blockIdx.z;
    int elem_idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (img_idx >= batch_size || elem_idx >= complex_N) return;

    size_t offset = static_cast<size_t>(img_idx) * complex_N;

    const cufftComplex& r = ref_fft[elem_idx];
    const cufftComplex& t = tgt_fft_batch[offset + elem_idx];

    cross_batch[offset + elem_idx].x = r.x * t.x + r.y * t.y;
    cross_batch[offset + elem_idx].y = r.y * t.x - r.x * t.y;
}

__global__ void batchNormalizeKernel(
    float* __restrict__ corr_batch,
    int N_sq, int batch_size, float inv_N_sq)
{
    int img_idx = blockIdx.z;
    int elem_idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (img_idx >= batch_size || elem_idx >= N_sq) return;

    size_t offset = static_cast<size_t>(img_idx) * N_sq;
    corr_batch[offset + elem_idx] *= inv_N_sq;
}

__global__ void batchFindPeakKernel(
    const float* __restrict__ corr_batch,
    float* __restrict__ peaks,
    int N, int batch_size)
{
    int img_idx = blockIdx.x;
    if (img_idx >= batch_size) return;

    size_t offset = static_cast<size_t>(img_idx) * N * N;

    extern __shared__ float smem[];
    float* s_vals = smem;
    int* s_idxs = reinterpret_cast<int*>(smem + blockDim.x);

    float local_max = -1e30f;
    int local_idx = 0;

    for (int i = threadIdx.x; i < N * N; i += blockDim.x) {
        float v = corr_batch[offset + i];
        if (v > local_max) {
            local_max = v;
            local_idx = i;
        }
    }

    s_vals[threadIdx.x] = local_max;
    s_idxs[threadIdx.x] = local_idx;
    __syncthreads();

    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (threadIdx.x < s) {
            if (s_vals[threadIdx.x + s] > s_vals[threadIdx.x]) {
                s_vals[threadIdx.x] = s_vals[threadIdx.x + s];
                s_idxs[threadIdx.x] = s_idxs[threadIdx.x + s];
            }
        }
        __syncthreads();
    }

    if (threadIdx.x == 0) {
        int peak_idx = s_idxs[0];
        int peak_x = peak_idx % N;
        int peak_y = peak_idx / N;

        float peak_val = s_vals[0];

        float dx = static_cast<float>(peak_x);
        float dy = static_cast<float>(peak_y);

        if (peak_x > 0 && peak_x < N - 1) {
            float v_l = corr_batch[offset + peak_y * N + (peak_x - 1)];
            float v_c = peak_val;
            float v_r = corr_batch[offset + peak_y * N + (peak_x + 1)];
            float denom = v_l - 2.0f * v_c + v_r;
            if (fabsf(denom) > 1e-10f) {
                dx = static_cast<float>(peak_x) + 0.5f * (v_l - v_r) / denom;
            }
        }
        if (peak_y > 0 && peak_y < N - 1) {
            float v_u = corr_batch[offset + (peak_y - 1) * N + peak_x];
            float v_c = peak_val;
            float v_d = corr_batch[offset + (peak_y + 1) * N + peak_x];
            float denom = v_u - 2.0f * v_c + v_d;
            if (fabsf(denom) > 1e-10f) {
                dy = static_cast<float>(peak_y) + 0.5f * (v_u - v_d) / denom;
            }
        }

        float sub_dx = dx - static_cast<float>(N) * 0.5f;
        float sub_dy = dy - static_cast<float>(N) * 0.5f;

        peaks[img_idx * 5 + 0] = static_cast<float>(peak_x);
        peaks[img_idx * 5 + 1] = static_cast<float>(peak_y);
        peaks[img_idx * 5 + 2] = sub_dx;
        peaks[img_idx * 5 + 3] = sub_dy;
        peaks[img_idx * 5 + 4] = peak_val;
    }
}

CrossCorrelationResult findPeakCpu(const float* corr, int width, int height) {
    float max_val = -1e30f;
    int peak_x = 0, peak_y = 0;

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            float val = corr[y * width + x];
            if (val > max_val) {
                max_val = val;
                peak_x = x;
                peak_y = y;
            }
        }
    }

    float dx = static_cast<float>(peak_x);
    float dy = static_cast<float>(peak_y);

    if (peak_x > 0 && peak_x < width - 1) {
        float v_l = corr[peak_y * width + (peak_x - 1)];
        float v_c = corr[peak_y * width + peak_x];
        float v_r = corr[peak_y * width + (peak_x + 1)];
        float denom = v_l - 2.0f * v_c + v_r;
        if (fabsf(denom) > 1e-10f) {
            dx = static_cast<float>(peak_x) + 0.5f * (v_l - v_r) / denom;
        }
    }
    if (peak_y > 0 && peak_y < height - 1) {
        float v_u = corr[(peak_y - 1) * width + peak_x];
        float v_c = corr[peak_y * width + peak_x];
        float v_d = corr[(peak_y + 1) * width + peak_x];
        float denom = v_u - 2.0f * v_c + v_d;
        if (fabsf(denom) > 1e-10f) {
            dy = static_cast<float>(peak_y) + 0.5f * (v_u - v_d) / denom;
        }
    }

    CrossCorrelationResult result;
    result.peak_x = peak_x;
    result.peak_y = peak_y;
    result.subpixel_dx = dx - static_cast<float>(width) / 2.0f;
    result.subpixel_dy = dy - static_cast<float>(height) / 2.0f;
    result.peak_value = max_val;
    return result;
}

} // anonymous namespace

CudaCrossCorrelator::CudaCrossCorrelator() : impl_(new Impl()) {}

CudaCrossCorrelator::~CudaCrossCorrelator() {
    delete impl_;
}

CrossCorrelationResult CudaCrossCorrelator::compute(
    const float* ref, int ref_w, int ref_h,
    const float* target, int target_w, int target_h) {

    int max_dim = std::max({ref_w, ref_h, target_w, target_h});
    int pow2 = 1;
    while (pow2 < max_dim) pow2 <<= 1;

    if (impl_->fft_size != pow2) {
        impl_->init(pow2, 1);
    }

    int N = pow2;
    int complex_N = N * (N / 2 + 1);

    dim3 block2d(16, 16);
    dim3 grid2d((N + 15) / 16, (N + 15) / 16);

    size_t elem = static_cast<size_t>(ref_w) * ref_h;
    size_t tgt_elem = static_cast<size_t>(target_w) * target_h;

    cudaMemcpy(impl_->d_ref_src, ref, elem * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemcpy(impl_->d_tgt_src, target, tgt_elem * sizeof(float), cudaMemcpyHostToDevice);

    padImageKernel<<<grid2d, block2d>>>(impl_->d_ref_src, impl_->d_ref, ref_w, ref_h, N);
    padImageKernel<<<grid2d, block2d>>>(impl_->d_tgt_src, impl_->d_tgt_batch, target_w, target_h, N);

    cufftExecR2C(impl_->fwd_plan_ref, impl_->d_ref, impl_->d_ref_fft);
    cufftExecR2C(impl_->fwd_plan_batch, impl_->d_tgt_batch, impl_->d_tgt_fft_batch);

    int threads = 256;
    int blocks = (complex_N + threads - 1) / threads;
    batchMultiplyConjugateKernel<<<dim3(blocks, 1, 1), threads>>>(
        impl_->d_ref_fft, impl_->d_tgt_fft_batch, impl_->d_cross_batch, complex_N, 1);

    cufftExecC2R(impl_->inv_plan_batch, impl_->d_cross_batch, impl_->d_corr_batch);

    float inv_N_sq = 1.0f / static_cast<float>(N * N);
    int full_elem = N * N;
    blocks = (full_elem + threads - 1) / threads;
    batchNormalizeKernel<<<dim3(blocks, 1, 1), threads>>>(
        impl_->d_corr_batch, full_elem, 1, inv_N_sq);

    int peak_threads = 1024;
    int peak_smem = peak_threads * (sizeof(float) + sizeof(int));
    batchFindPeakKernel<<<1, peak_threads, peak_smem>>>(
        impl_->d_corr_batch, impl_->d_peaks, N, 1);

    cudaMemcpy(impl_->h_peaks, impl_->d_peaks, 5 * sizeof(float), cudaMemcpyDeviceToHost);

    CrossCorrelationResult result;
    result.peak_x = static_cast<int>(impl_->h_peaks[0]);
    result.peak_y = static_cast<int>(impl_->h_peaks[1]);
    result.subpixel_dx = impl_->h_peaks[2];
    result.subpixel_dy = impl_->h_peaks[3];
    result.peak_value = impl_->h_peaks[4];

    return result;
}

std::vector<Offset> CudaCrossCorrelator::computeBatch(
    const Image& reference,
    const std::vector<Image>& targets,
    ProgressCallback callback) {

    std::vector<Offset> offsets;
    offsets.reserve(targets.size());

    int max_dim = std::max(reference.width, reference.height);
    for (const auto& t : targets) {
        max_dim = std::max({max_dim, t.width, t.height});
    }
    int pow2 = 1;
    while (pow2 < max_dim) pow2 <<= 1;

    int N = pow2;
    int complex_N = N * (N / 2 + 1);
    int N_sq = N * N;
    size_t elem = static_cast<size_t>(N) * N;

    size_t free_mem, total_mem;
    cudaMemGetInfo(&free_mem, &total_mem);

    size_t per_img_bytes = elem * sizeof(float) * 2 +
                           static_cast<size_t>(complex_N) * sizeof(cufftComplex) * 2;
    size_t ref_bytes = elem * sizeof(float) + static_cast<size_t>(complex_N) * sizeof(cufftComplex);
    size_t available = free_mem > 2ULL * 1024 * 1024 * 1024
                       ? free_mem - 512ULL * 1024 * 1024
                       : free_mem / 2;

    int max_chunk = static_cast<int>((available - ref_bytes) / per_img_bytes);
    max_chunk = std::max(1, std::min(max_chunk, 32));

    int n_targets = static_cast<int>(targets.size());
    int chunk_size = std::min(max_chunk, n_targets);

    impl_->init(pow2, chunk_size);

    dim3 block2d(16, 16);
    dim3 grid2d((N + 15) / 16, (N + 15) / 16);

    cudaMemcpy(impl_->d_ref_src, reference.data.data(),
               static_cast<size_t>(reference.width) * reference.height * sizeof(float),
               cudaMemcpyHostToDevice);
    padImageKernel<<<grid2d, block2d>>>(
        impl_->d_ref_src, impl_->d_ref, reference.width, reference.height, N);
    cufftExecR2C(impl_->fwd_plan_ref, impl_->d_ref, impl_->d_ref_fft);

    int threads = 256;
    float inv_N_sq = 1.0f / static_cast<float>(N * N);

    std::vector<const float*> h_src_ptrs(chunk_size);
    std::vector<int> h_src_ws(chunk_size);
    std::vector<int> h_src_hs(chunk_size);

    int* d_src_ws;
    int* d_src_hs;
    cudaMalloc(&d_src_ws, chunk_size * sizeof(int));
    cudaMalloc(&d_src_hs, chunk_size * sizeof(int));

    const float** d_src_ptrs;
    cudaMalloc(&d_src_ptrs, chunk_size * sizeof(float*));

    int peak_threads = 1024;
    int peak_smem = peak_threads * (sizeof(float) + sizeof(int));

    int total_done = 0;

    for (int start = 0; start < n_targets; start += chunk_size) {
        int cur_chunk = std::min(chunk_size, n_targets - start);

        for (int i = 0; i < cur_chunk; ++i) {
            h_src_ptrs[i] = targets[start + i].data.data();
            h_src_ws[i] = targets[start + i].width;
            h_src_hs[i] = targets[start + i].height;
        }
        for (int i = cur_chunk; i < chunk_size; ++i) {
            h_src_ptrs[i] = nullptr;
            h_src_ws[i] = 0;
            h_src_hs[i] = 0;
        }

        cudaMemcpy(d_src_ptrs, h_src_ptrs.data(), chunk_size * sizeof(float*), cudaMemcpyHostToDevice);
        cudaMemcpy(d_src_ws, h_src_ws.data(), chunk_size * sizeof(int), cudaMemcpyHostToDevice);
        cudaMemcpy(d_src_hs, h_src_hs.data(), chunk_size * sizeof(int), cudaMemcpyHostToDevice);

        dim3 padGrid((N + 15) / 16, (N + 15) / 16, chunk_size);
        batchPadImagesKernel<<<padGrid, block2d>>>(
            d_src_ptrs, impl_->d_tgt_batch, d_src_ws, d_src_hs, N, cur_chunk);

        cufftExecR2C(impl_->fwd_plan_batch, impl_->d_tgt_batch, impl_->d_tgt_fft_batch);

        int mc_blocks = (complex_N + threads - 1) / threads;
        batchMultiplyConjugateKernel<<<dim3(mc_blocks, 1, chunk_size), threads>>>(
            impl_->d_ref_fft, impl_->d_tgt_fft_batch, impl_->d_cross_batch, complex_N, cur_chunk);

        cufftExecC2R(impl_->inv_plan_batch, impl_->d_cross_batch, impl_->d_corr_batch);

        int norm_blocks = (N_sq + threads - 1) / threads;
        batchNormalizeKernel<<<dim3(norm_blocks, 1, chunk_size), threads>>>(
            impl_->d_corr_batch, N_sq, cur_chunk, inv_N_sq);

        batchFindPeakKernel<<<cur_chunk, peak_threads, peak_smem>>>(
            impl_->d_corr_batch, impl_->d_peaks, N, cur_chunk);

        size_t peak_bytes = static_cast<size_t>(cur_chunk) * 5 * sizeof(float);
        cudaMemcpy(impl_->h_peaks, impl_->d_peaks, peak_bytes, cudaMemcpyDeviceToHost);

        for (int i = 0; i < cur_chunk; ++i) {
            float* p = impl_->h_peaks + i * 5;
            offsets.emplace_back(p[2], p[3], p[4]);
        }

        total_done += cur_chunk;
        if (callback) {
            callback(total_done, n_targets, "Computing cross-correlation (CUDA batch parallel)");
        }
    }

    cudaFree(d_src_ptrs);
    cudaFree(d_src_ws);
    cudaFree(d_src_hs);

    return offsets;
}

std::vector<Offset> CudaCrossCorrelator::computeBatchParallel(
    const Image& reference,
    const std::vector<Image>& targets,
    int max_batch_size,
    ProgressCallback callback) {

    std::vector<Offset> offsets;
    offsets.reserve(targets.size());

    int max_dim = std::max(reference.width, reference.height);
    for (const auto& t : targets) {
        max_dim = std::max({max_dim, t.width, t.height});
    }
    int pow2 = 1;
    while (pow2 < max_dim) pow2 <<= 1;

    int N = pow2;
    int complex_N = N * (N / 2 + 1);
    int N_sq = N * N;
    size_t elem = static_cast<size_t>(N) * N;

    size_t free_mem, total_mem;
    cudaMemGetInfo(&free_mem, &total_mem);

    size_t per_img_bytes = elem * sizeof(float) * 2 +
                           static_cast<size_t>(complex_N) * sizeof(cufftComplex) * 2;
    size_t ref_bytes = elem * sizeof(float) + static_cast<size_t>(complex_N) * sizeof(cufftComplex);
    size_t available = free_mem > 2ULL * 1024 * 1024 * 1024
                       ? free_mem - 512ULL * 1024 * 1024
                       : free_mem / 2;

    int max_chunk = static_cast<int>((available - ref_bytes) / per_img_bytes);
    max_chunk = std::max(1, std::min({max_chunk, max_batch_size, 64}));

    int n_targets = static_cast<int>(targets.size());
    int chunk_size = std::min(max_chunk, n_targets);

    impl_->init(pow2, chunk_size);

    dim3 block2d(16, 16);
    dim3 grid2d((N + 15) / 16, (N + 15) / 16);

    cudaMemcpy(impl_->d_ref_src, reference.data.data(),
               static_cast<size_t>(reference.width) * reference.height * sizeof(float),
               cudaMemcpyHostToDevice);
    padImageKernel<<<grid2d, block2d>>>(
        impl_->d_ref_src, impl_->d_ref, reference.width, reference.height, N);
    cufftExecR2C(impl_->fwd_plan_ref, impl_->d_ref, impl_->d_ref_fft);

    int threads = 256;
    float inv_N_sq = 1.0f / static_cast<float>(N * N);

    std::vector<const float*> h_src_ptrs(chunk_size);
    std::vector<int> h_src_ws(chunk_size);
    std::vector<int> h_src_hs(chunk_size);

    int* d_src_ws;
    int* d_src_hs;
    cudaMalloc(&d_src_ws, chunk_size * sizeof(int));
    cudaMalloc(&d_src_hs, chunk_size * sizeof(int));

    const float** d_src_ptrs;
    cudaMalloc(&d_src_ptrs, chunk_size * sizeof(float*));

    int peak_threads = 1024;
    int peak_smem = peak_threads * (sizeof(float) + sizeof(int));

    int total_done = 0;
    cudaStream_t streams[2];
    cudaStreamCreate(&streams[0]);
    cudaStreamCreate(&streams[1]);

    for (int start = 0; start < n_targets; start += chunk_size) {
        int cur_chunk = std::min(chunk_size, n_targets - start);

        for (int i = 0; i < cur_chunk; ++i) {
            h_src_ptrs[i] = targets[start + i].data.data();
            h_src_ws[i] = targets[start + i].width;
            h_src_hs[i] = targets[start + i].height;
        }
        for (int i = cur_chunk; i < chunk_size; ++i) {
            h_src_ptrs[i] = nullptr;
            h_src_ws[i] = 0;
            h_src_hs[i] = 0;
        }

        cudaMemcpy(d_src_ptrs, h_src_ptrs.data(), chunk_size * sizeof(float*), cudaMemcpyHostToDevice);
        cudaMemcpy(d_src_ws, h_src_ws.data(), chunk_size * sizeof(int), cudaMemcpyHostToDevice);
        cudaMemcpy(d_src_hs, h_src_hs.data(), chunk_size * sizeof(int), cudaMemcpyHostToDevice);

        dim3 padGrid((N + 15) / 16, (N + 15) / 16, chunk_size);
        batchPadImagesKernel<<<padGrid, block2d>>>(
            d_src_ptrs, impl_->d_tgt_batch, d_src_ws, d_src_hs, N, cur_chunk);

        cufftExecR2C(impl_->fwd_plan_batch, impl_->d_tgt_batch, impl_->d_tgt_fft_batch);

        int mc_blocks = (complex_N + threads - 1) / threads;
        batchMultiplyConjugateKernel<<<dim3(mc_blocks, 1, chunk_size), threads>>>(
            impl_->d_ref_fft, impl_->d_tgt_fft_batch, impl_->d_cross_batch, complex_N, cur_chunk);

        cufftExecC2R(impl_->inv_plan_batch, impl_->d_cross_batch, impl_->d_corr_batch);

        int norm_blocks = (N_sq + threads - 1) / threads;
        batchNormalizeKernel<<<dim3(norm_blocks, 1, chunk_size), threads>>>(
            impl_->d_corr_batch, N_sq, cur_chunk, inv_N_sq);

        batchFindPeakKernel<<<cur_chunk, peak_threads, peak_smem>>>(
            impl_->d_corr_batch, impl_->d_peaks, N, cur_chunk);

        size_t peak_bytes = static_cast<size_t>(cur_chunk) * 5 * sizeof(float);
        cudaMemcpy(impl_->h_peaks, impl_->d_peaks, peak_bytes, cudaMemcpyDeviceToHost);

        for (int i = 0; i < cur_chunk; ++i) {
            float* p = impl_->h_peaks + i * 5;
            offsets.emplace_back(p[2], p[3], p[4]);
        }

        total_done += cur_chunk;
        if (callback) {
            callback(total_done, n_targets, "Computing cross-correlation (CUDA parallel batch)");
        }
    }

    cudaStreamDestroy(streams[0]);
    cudaStreamDestroy(streams[1]);
    cudaFree(d_src_ptrs);
    cudaFree(d_src_ws);
    cudaFree(d_src_hs);

    return offsets;
}

} // namespace astro_stack
