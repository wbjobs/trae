#pragma once

#include "astro_stack/types.h"
#include <vector>
#include <string>
#include <utility>

namespace astro_stack {

class Stacker {
public:
    Stacker() = default;
    explicit Stacker(const StackConfig& config) : config_(config) {}

    void setConfig(const StackConfig& config) { config_ = config; }
    const StackConfig& config() const { return config_; }

    Image stack(
        const std::vector<Image>& images,
        const std::vector<Offset>& offsets,
        ProgressCallback callback = nullptr);

    Image stackFromFiles(
        const std::vector<std::string>& filepaths,
        ProgressCallback callback = nullptr);

    static Image shiftImage(const Image& img, float dx, float dy);
    static float cubicConvolveInterp(const Image& img, float x, float y);

private:
    StackConfig config_;

    static std::pair<Image, Image> shiftImageWithMask(const Image& img, float dx, float dy);
    static float bilinearInterp(const Image& img, float x, float y);
    static float lanczosInterp(const Image& img, float x, float y, int a = 3);
};

} // namespace astro_stack
