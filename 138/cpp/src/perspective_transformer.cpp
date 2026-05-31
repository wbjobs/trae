#include "perspective_transformer.h"
#include <cmath>
#include <algorithm>

namespace doc_correction {

PerspectiveTransformer::PerspectiveTransformer() = default;
PerspectiveTransformer::~PerspectiveTransformer() = default;

cv::Mat PerspectiveTransformer::transform(const cv::Mat& image, const Corners& corners,
                                          const CorrectionOptions& options) {
    if (image.empty()) {
        return cv::Mat();
    }

    int target_width, target_height;
    calculateTargetSize(corners, options, target_width, target_height);

    cv::Mat dst_pts = getTargetPoints(target_width, target_height, options.padding);

    std::vector<cv::Point2f> src_pts;
    src_pts.emplace_back(corners.top_left.x, corners.top_left.y);
    src_pts.emplace_back(corners.top_right.x, corners.top_right.y);
    src_pts.emplace_back(corners.bottom_right.x, corners.bottom_right.y);
    src_pts.emplace_back(corners.bottom_left.x, corners.bottom_left.y);

    cv::Mat M = cv::getPerspectiveTransform(src_pts, dst_pts);

    int output_width = target_width + 2 * options.padding;
    int output_height = target_height + 2 * options.padding;

    cv::Mat warped;
    cv::warpPerspective(image, warped, M, cv::Size(output_width, output_height),
                        cv::INTER_CUBIC, cv::BORDER_CONSTANT, cv::Scalar(255, 255, 255));

    return warped;
}

cv::Mat PerspectiveTransformer::getTargetPoints(int width, int height, int padding) {
    cv::Mat pts(4, 1, CV_32FC2);

    pts.at<cv::Point2f>(0) = cv::Point2f(static_cast<float>(padding), static_cast<float>(padding));
    pts.at<cv::Point2f>(1) = cv::Point2f(static_cast<float>(width + padding), static_cast<float>(padding));
    pts.at<cv::Point2f>(2) = cv::Point2f(static_cast<float>(width + padding), static_cast<float>(height + padding));
    pts.at<cv::Point2f>(3) = cv::Point2f(static_cast<float>(padding), static_cast<float>(height + padding));

    return pts;
}

cv::Mat PerspectiveTransformer::getPerspectiveMatrix(const Corners& src,
                                                     const std::vector<cv::Point2f>& dst) {
    std::vector<cv::Point2f> src_pts;
    src_pts.emplace_back(src.top_left.x, src.top_left.y);
    src_pts.emplace_back(src.top_right.x, src.top_right.y);
    src_pts.emplace_back(src.bottom_right.x, src.bottom_right.y);
    src_pts.emplace_back(src.bottom_left.x, src.bottom_left.y);

    return cv::getPerspectiveTransform(src_pts, dst);
}

int PerspectiveTransformer::calculateTargetSize(const Corners& corners,
                                                const CorrectionOptions& options,
                                                int& out_width, int& out_height) {
    double width_top = distance(corners.top_left, corners.top_right);
    double width_bottom = distance(corners.bottom_left, corners.bottom_right);
    double height_left = distance(corners.top_left, corners.bottom_left);
    double height_right = distance(corners.top_right, corners.bottom_right);

    double max_width = std::max(width_top, width_bottom);
    double max_height = std::max(height_left, height_right);

    if (options.keep_aspect_ratio && options.target_width > 0 && options.target_height > 0) {
        double target_ratio = static_cast<double>(options.target_width) / options.target_height;
        double input_ratio = max_width / max_height;

        if (input_ratio > target_ratio) {
            out_width = options.target_width;
            out_height = static_cast<int>(options.target_width / input_ratio);
        } else {
            out_height = options.target_height;
            out_width = static_cast<int>(options.target_height * input_ratio);
        }
    } else {
        out_width = static_cast<int>(max_width);
        out_height = static_cast<int>(max_height);
    }

    out_width = std::max(out_width, 100);
    out_height = std::max(out_height, 100);

    return 0;
}

double PerspectiveTransformer::distance(const Point2f& p1, const Point2f& p2) {
    double dx = p2.x - p1.x;
    double dy = p2.y - p1.y;
    return std::sqrt(dx * dx + dy * dy);
}

}
