#pragma once

#include "astro_stack/types.h"
#include <vector>

namespace astro_stack {

struct CrossCorrelationResult {
    int peak_x;
    int peak_y;
    float subpixel_dx;
    float subpixel_dy;
    float peak_value;
};

class CrossCorrelator {
public:
    virtual ~CrossCorrelator() = default;

    virtual CrossCorrelationResult compute(
        const float* ref, int ref_w, int ref_h,
        const float* target, int target_w, int target_h) = 0;

    virtual std::vector<Offset> computeBatch(
        const Image& reference,
        const std::vector<Image>& targets,
        ProgressCallback callback = nullptr) = 0;
};

class CpuCrossCorrelator : public CrossCorrelator {
public:
    CrossCorrelationResult compute(
        const float* ref, int ref_w, int ref_h,
        const float* target, int target_w, int target_h) override;

    std::vector<Offset> computeBatch(
        const Image& reference,
        const std::vector<Image>& targets,
        ProgressCallback callback = nullptr) override;
};

#ifdef USE_CUDA
class CudaCrossCorrelator : public CrossCorrelator {
public:
    CudaCrossCorrelator();
    ~CudaCrossCorrelator() override;

    CrossCorrelationResult compute(
        const float* ref, int ref_w, int ref_h,
        const float* target, int target_w, int target_h) override;

    std::vector<Offset> computeBatch(
        const Image& reference,
        const std::vector<Image>& targets,
        ProgressCallback callback = nullptr) override;

    std::vector<Offset> computeBatchParallel(
        const Image& reference,
        const std::vector<Image>& targets,
        int max_batch_size = 32,
        ProgressCallback callback = nullptr);

private:
    struct Impl;
    Impl* impl_;
};
#endif

} // namespace astro_stack
