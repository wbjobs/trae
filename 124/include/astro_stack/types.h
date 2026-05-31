#pragma once

#include <cstdint>
#include <vector>
#include <string>

namespace astro_stack {

struct Image {
    int width;
    int height;
    std::vector<float> data;

    Image() : width(0), height(0) {}
    Image(int w, int h) : width(w), height(h), data(w * h, 0.0f) {}

    float at(int x, int y) const { return data[y * width + x]; }
    float& at(int x, int y) { return data[y * width + x]; }

    bool empty() const { return data.empty(); }
    size_t numel() const { return static_cast<size_t>(width) * height; }
};

struct Offset {
    float dx;
    float dy;
    float confidence;

    Offset() : dx(0.0f), dy(0.0f), confidence(0.0f) {}
    Offset(float x, float y, float c = 0.0f) : dx(x), dy(y), confidence(c) {}
};

enum class StackMethod {
    MEAN,
    MEDIAN,
    SIGMA_CLIP
};

struct StackConfig {
    StackMethod method = StackMethod::SIGMA_CLIP;
    float sigma_lo = 3.0f;
    float sigma_hi = 3.0f;
    int max_iterations = 5;
    int reference_index = 0;
    bool use_cuda = true;
    int tile_size = 4096;
};

using ProgressCallback = std::function<void(int current, int total, const std::string& stage)>;

} // namespace astro_stack
