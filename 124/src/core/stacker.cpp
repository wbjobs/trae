#include "astro_stack/stacker.h"
#include "astro_stack/fits_reader.h"
#include "astro_stack/cross_correlation.h"

#include <cmath>
#include <algorithm>
#include <vector>
#include <numeric>
#include <stdexcept>
#include <iostream>

namespace astro_stack {

namespace {

inline float cubicKernel(float s) {
    float a = std::abs(s);
    if (a <= 1.0f) {
        return 1.5f * a * a * a - 2.5f * a * a + 1.0f;
    } else if (a <= 2.0f) {
        return -0.5f * a * a * a + 2.5f * a * a - 4.0f * a + 2.0f;
    }
    return 0.0f;
}

inline int clampIdx(int v, int lo, int hi) {
    return std::clamp(v, lo, hi);
}

} // anonymous namespace

float Stacker::bilinearInterp(const Image& img, float x, float y) {
    int x0 = static_cast<int>(std::floor(x));
    int y0 = static_cast<int>(std::floor(y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;

    x0 = std::clamp(x0, 0, img.width - 1);
    y0 = std::clamp(y0, 0, img.height - 1);
    x1 = std::clamp(x1, 0, img.width - 1);
    y1 = std::clamp(y1, 0, img.height - 1);

    float sx = x - std::floor(x);
    float sy = y - std::floor(y);

    float v00 = img.at(x0, y0);
    float v10 = img.at(x1, y0);
    float v01 = img.at(x0, y1);
    float v11 = img.at(x1, y1);

    float v0 = v00 * (1.0f - sx) + v10 * sx;
    float v1 = v01 * (1.0f - sx) + v11 * sx;
    return v0 * (1.0f - sy) + v1 * sy;
}

float Stacker::cubicConvolveInterp(const Image& img, float x, float y) {
    int xi = static_cast<int>(std::floor(x));
    int yi = static_cast<int>(std::floor(y));
    float dx = x - static_cast<float>(xi);
    float dy = y - static_cast<float>(yi);

    float wx[4], wy[4];
    for (int i = 0; i < 4; ++i) {
        wx[i] = cubicKernel(static_cast<float>(i) - 1.0f - dx);
        wy[i] = cubicKernel(static_cast<float>(i) - 1.0f - dy);
    }

    float sum = 0.0f;
    for (int j = 0; j < 4; ++j) {
        int py = clampIdx(yi + j - 1, 0, img.height - 1);
        float row_sum = 0.0f;
        for (int i = 0; i < 4; ++i) {
            int px = clampIdx(xi + i - 1, 0, img.width - 1);
            row_sum += img.at(px, py) * wx[i];
        }
        sum += row_sum * wy[j];
    }

    return sum;
}

float Stacker::lanczosInterp(const Image& img, float x, float y, int a) {
    (void)a;
    return cubicConvolveInterp(img, x, y);
}

Image Stacker::shiftImage(const Image& img, float dx, float dy) {
    Image shifted(img.width, img.height);

    for (int y = 0; y < img.height; ++y) {
        for (int x = 0; x < img.width; ++x) {
            float src_x = static_cast<float>(x) + dx;
            float src_y = static_cast<float>(y) + dy;

            shifted.at(x, y) = cubicConvolveInterp(img, src_x, src_y);
        }
    }

    return shifted;
}

std::pair<Image, Image> Stacker::shiftImageWithMask(const Image& img, float dx, float dy) {
    Image shifted(img.width, img.height);
    Image mask(img.width, img.height);

    int w = img.width;
    int h = img.height;

    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            float src_x = static_cast<float>(x) + dx;
            float src_y = static_cast<float>(y) + dy;

            shifted.at(x, y) = cubicConvolveInterp(img, src_x, src_y);

            bool valid = (src_x >= 1.0f && src_x <= static_cast<float>(w) - 2.0f &&
                          src_y >= 1.0f && src_y <= static_cast<float>(h) - 2.0f);
            mask.at(x, y) = valid ? 1.0f : 0.0f;
        }
    }

    return {shifted, mask};
}

Image Stacker::stack(
    const std::vector<Image>& images,
    const std::vector<Offset>& offsets,
    ProgressCallback callback) {

    if (images.empty()) {
        throw std::runtime_error("No images to stack");
    }
    if (images.size() != offsets.size()) {
        throw std::runtime_error("Image count must match offset count");
    }

    int ref_idx = config_.reference_index;
    if (ref_idx < 0 || ref_idx >= static_cast<int>(images.size())) {
        ref_idx = 0;
    }

    int width = images[ref_idx].width;
    int height = images[ref_idx].height;
    int n_images = static_cast<int>(images.size());

    Image accumulator(width, height);
    std::vector<int> count(width * height, 0);

    int total_steps = n_images * 2;
    for (int i = 0; i < n_images; ++i) {
        const auto& img = images[i];
        const auto& off = offsets[i];

        auto [shifted, mask] = shiftImageWithMask(img, off.dx, off.dy);

        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                int idx = y * width + x;
                if (mask.at(x, y) > 0.5f) {
                    accumulator.data[idx] += shifted.at(x, y);
                    count[idx]++;
                }
            }
        }

        if (callback) {
            callback(i + 1, total_steps, "Stacking images");
        }
    }

    for (int i = 0; i < width * height; ++i) {
        if (count[i] > 0) {
            accumulator.data[i] /= static_cast<float>(count[i]);
        }
    }

    if (config_.method == StackMethod::SIGMA_CLIP || config_.method == StackMethod::MEDIAN) {
        std::vector<std::vector<float>> pixel_stack(static_cast<size_t>(width) * height);
        for (int idx = 0; idx < width * height; ++idx) {
            pixel_stack[idx].reserve(n_images);
        }

        for (int i = 0; i < n_images; ++i) {
            const auto& img = images[i];
            const auto& off = offsets[i];
            auto [shifted, mask] = shiftImageWithMask(img, off.dx, off.dy);

            for (int y = 0; y < height; ++y) {
                for (int x = 0; x < width; ++x) {
                    if (mask.at(x, y) > 0.5f) {
                        pixel_stack[y * width + x].push_back(shifted.at(x, y));
                    }
                }
            }

            if (callback) {
                callback(n_images + i + 1, total_steps,
                         config_.method == StackMethod::SIGMA_CLIP ? "Sigma clipping" : "Computing median");
            }
        }

        for (int idx = 0; idx < width * height; ++idx) {
            auto& values = pixel_stack[idx];
            if (values.empty()) {
                accumulator.data[idx] = 0.0f;
                continue;
            }

            if (config_.method == StackMethod::MEDIAN) {
                std::sort(values.begin(), values.end());
                size_t mid = values.size() / 2;
                if (values.size() % 2 == 0) {
                    accumulator.data[idx] = (values[mid - 1] + values[mid]) * 0.5f;
                } else {
                    accumulator.data[idx] = values[mid];
                }
            } else {
                for (int iter = 0; iter < config_.max_iterations; ++iter) {
                    float mean = 0.0f;
                    for (float v : values) mean += v;
                    mean /= static_cast<float>(values.size());

                    float var = 0.0f;
                    for (float v : values) var += (v - mean) * (v - mean);
                    var /= static_cast<float>(values.size());
                    float stddev = std::sqrt(var);

                    float lo = mean - config_.sigma_lo * stddev;
                    float hi = mean + config_.sigma_hi * stddev;

                    std::vector<float> clipped;
                    clipped.reserve(values.size());
                    for (float v : values) {
                        if (v >= lo && v <= hi) {
                            clipped.push_back(v);
                        }
                    }

                    if (clipped.size() == values.size() || clipped.size() < 3) {
                        values = clipped;
                        break;
                    }
                    values = clipped;
                }

                float mean = 0.0f;
                for (float v : values) mean += v;
                accumulator.data[idx] = mean / static_cast<float>(values.size());
            }
        }
    }

    return accumulator;
}

Image Stacker::stackFromFiles(
    const std::vector<std::string>& filepaths,
    ProgressCallback callback) {

    if (filepaths.empty()) {
        throw std::runtime_error("No files provided");
    }

    int n = static_cast<int>(filepaths.size());

    if (callback) {
        callback(0, n + 2, "Reading files");
    }

    std::vector<Image> images;
    images.reserve(n);
    for (int i = 0; i < n; ++i) {
        images.push_back(FitsReader::read(filepaths[i]));
        if (callback) {
            callback(i + 1, n + 2, "Reading files");
        }
    }

    int ref_idx = config_.reference_index;
    if (ref_idx < 0 || ref_idx >= n) ref_idx = 0;

    std::unique_ptr<CrossCorrelator> correlator;
    if (config_.use_cuda) {
#ifdef USE_CUDA
        correlator = std::make_unique<CudaCrossCorrelator>();
#else
        correlator = std::make_unique<CpuCrossCorrelator>();
#endif
    } else {
        correlator = std::make_unique<CpuCrossCorrelator>();
    }

    if (callback) {
        callback(n + 1, n + 2, "Computing offsets");
    }

    std::vector<Offset> offsets;
    offsets.reserve(n);

    const Image& reference = images[ref_idx];
    for (int i = 0; i < n; ++i) {
        if (i == ref_idx) {
            offsets.emplace_back(0.0f, 0.0f, 1.0f);
        } else {
            auto result = correlator->compute(
                reference.data.data(), reference.width, reference.height,
                images[i].data.data(), images[i].width, images[i].height);
            offsets.emplace_back(result.subpixel_dx, result.subpixel_dy, result.peak_value);
        }

        if (callback) {
            callback(n + 1, n + 2,
                     "Computing offset for image " + std::to_string(i + 1) + "/" + std::to_string(n));
        }
    }

    if (callback) {
        callback(n + 2, n + 2, "Stacking images");
    }

    return stack(images, offsets, callback);
}

} // namespace astro_stack
