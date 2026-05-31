#ifndef DOCUMENT_CORRECTION_COMMON_H
#define DOCUMENT_CORRECTION_COMMON_H

#include <vector>
#include <string>
#include <opencv2/opencv.hpp>

namespace doc_correction {

enum class ShadowRemovalType {
    NONE = 0,
    FAST_SSR = 1,
    SIMPLE_MSR = 2,
    ADAPTIVE = 3
};

struct Point2f {
    float x;
    float y;
    Point2f() : x(0.0f), y(0.0f) {}
    Point2f(float x, float y) : x(x), y(y) {}
};

struct Corners {
    Point2f top_left;
    Point2f top_right;
    Point2f bottom_right;
    Point2f bottom_left;

    std::vector<Point2f> toVector() const {
        return {top_left, top_right, bottom_right, bottom_left};
    }

    bool isValid() const {
        return top_left.x >= 0 && top_left.y >= 0 &&
               top_right.x >= 0 && top_right.y >= 0 &&
               bottom_right.x >= 0 && bottom_right.y >= 0 &&
               bottom_left.x >= 0 && bottom_left.y >= 0;
    }
};

struct CorrectionResult {
    cv::Mat corrected_image;
    Corners corners;
    bool success;
    std::string error_message;

    CorrectionResult() : success(false) {}
};

struct ShadowRemovalOptions {
    ShadowRemovalType type;
    float sigma;
    float gain;
    float offset;
    bool preserve_color;
    int thread_count;

    ShadowRemovalOptions()
        : type(ShadowRemovalType::NONE),
          sigma(80.0f),
          gain(1.0f),
          offset(0.0f),
          preserve_color(true),
          thread_count(2) {}
};

struct CorrectionOptions {
    int target_width;
    int target_height;
    bool keep_aspect_ratio;
    int padding;
    float confidence_threshold;
    bool use_gpu;
    ShadowRemovalOptions shadow_removal;

    CorrectionOptions()
        : target_width(1080),
          target_height(1920),
          keep_aspect_ratio(true),
          padding(20),
          confidence_threshold(0.3f),
          use_gpu(false),
          shadow_removal() {}
};

}

#endif
