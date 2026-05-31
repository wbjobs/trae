#include "astro_stack/cross_correlation.h"

#include <cmath>
#include <complex>
#include <vector>
#include <algorithm>
#include <stdexcept>
#include <iostream>

namespace astro_stack {

namespace {

using Complex = std::complex<float>;

void fft2(std::vector<Complex>& data, int width, int height, bool inverse) {
    int n = std::max(width, height);
    int pow2 = 1;
    while (pow2 < n) pow2 <<= 1;

    std::vector<Complex> padded(pow2 * pow2, Complex(0, 0));
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            padded[y * pow2 + x] = data[y * width + x];
        }
    }

    auto fft1d = [](std::vector<Complex>& arr, int n, bool inv) {
        for (int i = 1, j = 0; i < n; ++i) {
            int bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) std::swap(arr[i], arr[j]);
        }
        float sign = inv ? 1.0f : -1.0f;
        for (int len = 2; len <= n; len <<= 1) {
            float angle = sign * 2.0f * static_cast<float>(M_PI) / len;
            Complex wlen(cos(angle), sin(angle));
            for (int i = 0; i < n; i += len) {
                Complex w(1, 0);
                int half = len >> 1;
                for (int j = 0; j < half; ++j) {
                    Complex u = arr[i + j];
                    Complex v = arr[i + j + half] * w;
                    arr[i + j] = u + v;
                    arr[i + j + half] = u - v;
                    w *= wlen;
                }
            }
        }
        if (inv) {
            float inv_n = 1.0f / n;
            for (int i = 0; i < n; ++i) arr[i] *= inv_n;
        }
    };

    for (int y = 0; y < pow2; ++y) {
        std::vector<Complex> row(pow2);
        for (int x = 0; x < pow2; ++x) row[x] = padded[y * pow2 + x];
        fft1d(row, pow2, inverse);
        for (int x = 0; x < pow2; ++x) padded[y * pow2 + x] = row[x];
    }

    for (int x = 0; x < pow2; ++x) {
        std::vector<Complex> col(pow2);
        for (int y = 0; y < pow2; ++y) col[y] = padded[y * pow2 + x];
        fft1d(col, pow2, inverse);
        for (int y = 0; y < pow2; ++y) padded[y * pow2 + x] = col[y];
    }

    data.resize(pow2 * pow2);
    for (int i = 0; i < pow2 * pow2; ++i) data[i] = padded[i];
}

CrossCorrelationResult findPeakWithSubpixel(
    const std::vector<float>& corr, int width, int height, float orig_ref_sum, float orig_tgt_sum) {

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
        if (std::abs(denom) > 1e-10f) {
            dx = static_cast<float>(peak_x) + 0.5f * (v_l - v_r) / denom;
        }
    }

    if (peak_y > 0 && peak_y < height - 1) {
        float v_u = corr[(peak_y - 1) * width + peak_x];
        float v_c = corr[peak_y * width + peak_x];
        float v_d = corr[(peak_y + 1) * width + peak_x];
        float denom = v_u - 2.0f * v_c + v_d;
        if (std::abs(denom) > 1e-10f) {
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

CrossCorrelationResult CpuCrossCorrelator::compute(
    const float* ref, int ref_w, int ref_h,
    const float* target, int target_w, int target_h) {

    int n = std::max(ref_w, ref_h);
    int pow2 = 1;
    while (pow2 < n) pow2 <<= 1;

    int full_w = pow2;
    int full_h = pow2;

    auto to_complex = [](const float* src, int w, int h, int pad) -> std::vector<Complex> {
        std::vector<Complex> dst(static_cast<size_t>(pad) * pad, Complex(0, 0));
        for (int y = 0; y < h; ++y) {
            for (int x = 0; x < w; ++x) {
                dst[y * pad + x] = Complex(src[y * w + x], 0.0f);
            }
        }
        return dst;
    };

    std::vector<Complex> ref_fft = to_complex(ref, ref_w, ref_h, pow2);
    std::vector<Complex> tgt_fft = to_complex(target, target_w, target_h, pow2);

    fft2(ref_fft, pow2, pow2, false);
    fft2(tgt_fft, pow2, pow2, false);

    std::vector<Complex> cross(static_cast<size_t>(pow2) * pow2);
    for (int i = 0; i < pow2 * pow2; ++i) {
        cross[i] = ref_fft[i] * std::conj(tgt_fft[i]);
    }

    fft2(cross, pow2, pow2, true);

    std::vector<float> corr(static_cast<size_t>(pow2) * pow2);
    for (int i = 0; i < pow2 * pow2; ++i) {
        corr[i] = cross[i].real();
    }

    return findPeakWithSubpixel(corr, pow2, pow2, 0.0f, 0.0f);
}

std::vector<Offset> CpuCrossCorrelator::computeBatch(
    const Image& reference,
    const std::vector<Image>& targets,
    ProgressCallback callback) {

    std::vector<Offset> offsets;
    offsets.reserve(targets.size());

    int total = static_cast<int>(targets.size());
    for (int i = 0; i < total; ++i) {
        auto result = compute(
            reference.data.data(), reference.width, reference.height,
            targets[i].data.data(), targets[i].width, targets[i].height);

        float confidence = result.peak_value;
        offsets.emplace_back(result.subpixel_dx, result.subpixel_dy, confidence);

        if (callback) {
            callback(i + 1, total, "Computing cross-correlation (CPU)");
        }
    }
    return offsets;
}

} // namespace astro_stack
