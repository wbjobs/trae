#pragma once

#include "astro_stack/types.h"
#include <cuda_runtime.h>
#include <cufft.h>
#include <vector>
#include <memory>

namespace astro_stack {

struct CudaCrossCorrelator::Impl {
    int fft_size;
    int batch_size;

    cufftHandle fwd_plan_ref;
    cufftHandle fwd_plan_batch;
    cufftHandle inv_plan_batch;

    float* d_ref;
    cufftComplex* d_ref_fft;

    float* d_tgt_batch;
    cufftComplex* d_tgt_fft_batch;
    cufftComplex* d_cross_batch;
    float* d_corr_batch;

    float* d_peaks;
    float* h_peaks;

    float* d_ref_src;
    float* d_tgt_src;

    Impl()
        : fft_size(0)
        , batch_size(0)
        , fwd_plan_ref(nullptr)
        , fwd_plan_batch(nullptr)
        , inv_plan_batch(nullptr)
        , d_ref(nullptr)
        , d_ref_fft(nullptr)
        , d_tgt_batch(nullptr)
        , d_tgt_fft_batch(nullptr)
        , d_cross_batch(nullptr)
        , d_corr_batch(nullptr)
        , d_peaks(nullptr)
        , h_peaks(nullptr)
        , d_ref_src(nullptr)
        , d_tgt_src(nullptr)
    {}

    ~Impl() { cleanup(); }

    void init(int size, int batch = 1) {
        cleanup();
        fft_size = size;
        batch_size = batch;

        size_t elem = static_cast<size_t>(fft_size) * fft_size;
        size_t complex_elem = static_cast<size_t>(fft_size) * (fft_size / 2 + 1);
        size_t batch_elem = elem * batch_size;
        size_t batch_complex_elem = complex_elem * batch_size;

        cudaMalloc(&d_ref, elem * sizeof(float));
        cudaMalloc(&d_ref_fft, complex_elem * sizeof(cufftComplex));

        cudaMalloc(&d_tgt_batch, batch_elem * sizeof(float));
        cudaMalloc(&d_tgt_fft_batch, batch_complex_elem * sizeof(cufftComplex));
        cudaMalloc(&d_cross_batch, batch_complex_elem * sizeof(cufftComplex));
        cudaMalloc(&d_corr_batch, batch_elem * sizeof(float));

        cudaMalloc(&d_peaks, static_cast<size_t>(batch_size) * 5 * sizeof(float));
        h_peaks = new float[batch_size * 5];

        cudaMalloc(&d_ref_src, elem * sizeof(float));
        cudaMalloc(&d_tgt_src, elem * sizeof(float));

        int n[] = {fft_size, fft_size};
        cufftPlanMany(&fwd_plan_ref, 2, n, nullptr, 1, elem, nullptr, 1, complex_elem, CUFFT_R2C, 1);
        cufftPlanMany(&fwd_plan_batch, 2, n, nullptr, 1, elem, nullptr, 1, complex_elem, CUFFT_R2C, batch_size);
        cufftPlanMany(&inv_plan_batch, 2, n, nullptr, 1, complex_elem, nullptr, 1, elem, CUFFT_C2R, batch_size);
    }

    void cleanup() {
        if (fwd_plan_ref) { cufftDestroy(fwd_plan_ref); fwd_plan_ref = nullptr; }
        if (fwd_plan_batch) { cufftDestroy(fwd_plan_batch); fwd_plan_batch = nullptr; }
        if (inv_plan_batch) { cufftDestroy(inv_plan_batch); inv_plan_batch = nullptr; }
        if (d_ref) { cudaFree(d_ref); d_ref = nullptr; }
        if (d_ref_fft) { cudaFree(d_ref_fft); d_ref_fft = nullptr; }
        if (d_tgt_batch) { cudaFree(d_tgt_batch); d_tgt_batch = nullptr; }
        if (d_tgt_fft_batch) { cudaFree(d_tgt_fft_batch); d_tgt_fft_batch = nullptr; }
        if (d_cross_batch) { cudaFree(d_cross_batch); d_cross_batch = nullptr; }
        if (d_corr_batch) { cudaFree(d_corr_batch); d_corr_batch = nullptr; }
        if (d_peaks) { cudaFree(d_peaks); d_peaks = nullptr; }
        if (d_ref_src) { cudaFree(d_ref_src); d_ref_src = nullptr; }
        if (d_tgt_src) { cudaFree(d_tgt_src); d_tgt_src = nullptr; }
        delete[] h_peaks;
        h_peaks = nullptr;
        fft_size = 0;
        batch_size = 0;
    }
};

} // namespace astro_stack
