#include "document_detector.h"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <limits>

namespace doc_correction {

DocumentDetector::DocumentDetector()
    : initialized_(false), confidence_threshold_(0.3f) {}

DocumentDetector::~DocumentDetector() = default;

bool DocumentDetector::init(const std::string& model_dir, bool use_gpu) {
#ifdef WITH_FASTDEPLOY
    if (!model_dir.empty()) {
        try {
            std::string model_file = model_dir + "/inference.pdmodel";
            std::string params_file = model_dir + "/inference.pdiparams";

            fastdeploy::RuntimeOption option;
            if (use_gpu) {
                option.UseGpu();
            } else {
                option.UseCpu();
            }
            option.SetPaddleLiteBackend();

            detector_ = std::make_unique<fastdeploy::vision::ocr::DBDetector>(
                model_file, params_file, option);

            if (!detector_->Initialized()) {
                detector_.reset();
            } else {
                initialized_ = true;
                return true;
            }
        } catch (...) {
            detector_.reset();
        }
    }
#endif

    initialized_ = true;
    return true;
}

bool DocumentDetector::detect(const cv::Mat& image, Corners& corners, float& confidence) {
    if (image.empty()) {
        return false;
    }

#ifdef WITH_FASTDEPLOY
    if (initialized_ && detector_) {
        try {
            fastdeploy::vision::OCRResult result;
            if (detector_->Predict(image, &result) && !result.boxes.empty()) {
                float max_area = 0;
                int max_idx = -1;
                float max_score = 0;

                for (size_t i = 0; i < result.boxes.size(); i++) {
                    const auto& box = result.boxes[i];
                    if (box.size() != 4) continue;

                    std::vector<cv::Point2f> pts;
                    for (const auto& p : box) {
                        pts.emplace_back(p[0], p[1]);
                    }

                    float area = cv::contourArea(pts);
                    if (area > max_area) {
                        max_area = area;
                        max_idx = static_cast<int>(i);
                        max_score = result.score[i];
                    }
                }

                if (max_idx >= 0) {
                    const auto& box = result.boxes[max_idx];
                    std::vector<cv::Point2f> pts;
                    for (const auto& p : box) {
                        pts.emplace_back(p[0], p[1]);
                    }

                    if (sortCorners(pts, corners)) {
                        confidence = max_score;

                        if (confidence >= confidence_threshold_) {
                            return true;
                        }

                        if (confidence >= 0.15f && isPlausibleDocument(pts, image.size())) {
                            auto refined = refineCorners(image, pts);
                            if (sortCorners(refined, corners)) {
                                confidence = std::max(confidence, 0.4f);
                                return true;
                            }
                        }
                    }
                }
            }

            return detectTraditional(image, corners);
        } catch (...) {
            return detectTraditional(image, corners);
        }
    }
#endif

    return detectTraditional(image, corners);
}

void DocumentDetector::setConfidenceThreshold(float threshold) {
    confidence_threshold_ = threshold;
}

bool DocumentDetector::isInitialized() const {
    return initialized_;
}

cv::Mat DocumentDetector::enhanceContrast(const cv::Mat& gray) {
    cv::Mat enhanced;

    cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(3.0, cv::Size(8, 8));
    clahe->apply(gray, enhanced);

    double mean_val = cv::mean(enhanced)[0];
    double std_dev = 0;
    cv::Scalar mean_scalar, std_scalar;
    cv::meanStdDev(enhanced, mean_scalar, std_scalar);
    std_dev = std_scalar[0];

    if (std_dev < 30.0) {
        double alpha = 1.5 + (50.0 - std_dev) / 50.0;
        double beta = (128.0 - mean_val) * 0.5;
        enhanced.convertTo(enhanced, -1, alpha, beta);
    }

    cv::Mat gamma_corrected;
    double gamma = mean_val > 180.0 ? 0.7 : (mean_val < 80.0 ? 1.3 : 1.0);
    if (gamma != 1.0) {
        cv::Mat lut(1, 256, CV_8U);
        uchar* p = lut.ptr();
        for (int i = 0; i < 256; i++) {
            p[i] = cv::saturate_cast<uchar>(pow(i / 255.0, gamma) * 255.0);
        }
        cv::LUT(enhanced, lut, gamma_corrected);
        return gamma_corrected;
    }

    return enhanced;
}

cv::Mat DocumentDetector::multiChannelEdgeDetection(const cv::Mat& image) {
    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    cv::Mat enhanced = enhanceContrast(gray);

    cv::Mat edges_gray;
    double low, high;
    dynamicCannyThreshold(enhanced, low, high);
    cv::Canny(enhanced, edges_gray, low, high, 3);

    if (image.channels() == 3) {
        cv::Mat hsv;
        cv::cvtColor(image, hsv, cv::COLOR_BGR2HSV);

        std::vector<cv::Mat> hsv_channels;
        cv::split(hsv, hsv_channels);

        cv::Mat edges_s, edges_v;

        cv::Mat s_enhanced;
        cv::equalizeHist(hsv_channels[1], s_enhanced);
        double s_low, s_high;
        dynamicCannyThreshold(s_enhanced, s_low, s_high);
        cv::Canny(s_enhanced, edges_s, s_low * 0.6, s_high * 0.6, 3);

        cv::Mat v_enhanced = enhanceContrast(hsv_channels[2]);
        double v_low, v_high;
        dynamicCannyThreshold(v_enhanced, v_low, v_high);
        cv::Canny(v_enhanced, edges_v, v_low, v_high, 3);

        cv::Mat lab;
        cv::cvtColor(image, lab, cv::COLOR_BGR2Lab);
        std::vector<cv::Mat> lab_channels;
        cv::split(lab, lab_channels);

        cv::Mat edges_l;
        cv::Mat l_enhanced = enhanceContrast(lab_channels[0]);
        double l_low, l_high;
        dynamicCannyThreshold(l_enhanced, l_low, l_high);
        cv::Canny(l_enhanced, edges_l, l_low, l_high, 3);

        cv::Mat combined_edges = cv::Mat::zeros(edges_gray.size(), CV_8U);
        cv::bitwise_or(edges_gray, edges_s, combined_edges);
        cv::bitwise_or(combined_edges, edges_v, combined_edges);
        cv::bitwise_or(combined_edges, edges_l, combined_edges);

        int morph_size = 3;
        cv::Mat kernel = cv::getStructuringElement(
            cv::MORPH_RECT,
            cv::Size(2 * morph_size + 1, 2 * morph_size + 1),
            cv::Point(morph_size, morph_size));

        cv::Mat dilated;
        cv::dilate(combined_edges, dilated, kernel, cv::Point(-1, -1), 1);

        return dilated;
    }

    int morph_size = 2;
    cv::Mat kernel = cv::getStructuringElement(
        cv::MORPH_RECT,
        cv::Size(2 * morph_size + 1, 2 * morph_size + 1),
        cv::Point(morph_size, morph_size));

    cv::Mat dilated;
    cv::dilate(edges_gray, dilated, kernel, cv::Point(-1, -1), 1);

    return dilated;
}

void DocumentDetector::dynamicCannyThreshold(const cv::Mat& gray,
                                             double& low_threshold,
                                             double& high_threshold) {
    cv::Scalar mean_scalar, std_scalar;
    cv::meanStdDev(gray, mean_scalar, std_scalar);
    double mean_val = mean_scalar[0];
    double std_dev = std_scalar[0];

    double otsu_thresh = cv::threshold(gray, cv::Mat(), 0, 255, cv::THRESH_BINARY | cv::THRESH_OTSU);

    double contrast_factor = std_dev / 50.0;
    contrast_factor = std::max(0.3, std::min(2.0, contrast_factor));

    double brightness_factor;
    if (mean_val > 200) {
        brightness_factor = 0.4;
    } else if (mean_val < 60) {
        brightness_factor = 0.7;
    } else {
        brightness_factor = 1.0;
    }

    double base_low = otsu_thresh * 0.4 * brightness_factor / contrast_factor;
    double base_high = otsu_thresh * 1.2 * brightness_factor / contrast_factor;

    low_threshold = std::max(15.0, std::min(80.0, base_low));
    high_threshold = std::max(40.0, std::min(200.0, base_high));

    if (low_threshold * 2 > high_threshold) {
        high_threshold = low_threshold * 2;
    }
}

bool DocumentDetector::detectWithParams(
    const cv::Mat& image,
    int blur_ksize,
    double canny_low,
    double canny_high,
    int morph_ksize,
    std::vector<DetectionCandidate>& candidates) {

    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    cv::Mat enhanced = enhanceContrast(gray);

    cv::Mat blur;
    if (blur_ksize > 0) {
        cv::GaussianBlur(enhanced, blur, cv::Size(blur_ksize, blur_ksize), 0);
    } else {
        blur = enhanced.clone();
    }

    cv::Mat edges;
    if (canny_low > 0 && canny_high > 0) {
        cv::Canny(blur, edges, canny_low, canny_high, 3);
    } else {
        double low, high;
        dynamicCannyThreshold(blur, low, high);
        cv::Canny(blur, edges, low, high, 3);
    }

    if (morph_ksize > 0) {
        cv::Mat kernel = cv::getStructuringElement(
            cv::MORPH_RECT,
            cv::Size(morph_ksize, morph_ksize));
        cv::morphologyEx(edges, edges, cv::MORPH_CLOSE, kernel);
    }

    std::vector<std::vector<cv::Point>> contours;
    std::vector<cv::Vec4i> hierarchy;
    cv::findContours(edges.clone(), contours, hierarchy, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    if (contours.empty()) {
        return false;
    }

    double image_area = static_cast<double>(image.cols * image.rows);

    std::sort(contours.begin(), contours.end(),
              [](const std::vector<cv::Point>& a, const std::vector<cv::Point>& b) {
                  return cv::contourArea(a) > cv::contourArea(b);
              });

    int found = 0;
    for (size_t i = 0; i < contours.size() && i < 10; i++) {
        std::vector<cv::Point2f> corners;
        if (findQuadrilateralFromContour(contours[i], corners, image_area)) {
            DetectionCandidate candidate;
            candidate.points = corners;
            candidate.area_ratio = static_cast<float>(cv::contourArea(corners) / image_area);
            candidate.confidence = evaluateCandidate(image, corners);
            candidate.score = candidate.confidence * 0.6f + candidate.area_ratio * 0.4f;
            candidates.push_back(candidate);
            found++;
        }
    }

    return found > 0;
}

bool DocumentDetector::findQuadrilateralFromContour(
    const std::vector<cv::Point>& contour,
    std::vector<cv::Point2f>& corners,
    double image_area) {

    double area = cv::contourArea(contour);
    double area_ratio = area / image_area;

    if (area_ratio < 0.05 || area_ratio > 0.98) {
        return false;
    }

    double peri = cv::arcLength(contour, true);

    std::vector<cv::Point> approx;
    for (double epsilon_factor = 0.01; epsilon_factor <= 0.1; epsilon_factor += 0.005) {
        cv::approxPolyDP(contour, approx, epsilon_factor * peri, true);

        if (approx.size() == 4) {
            break;
        }
    }

    if (approx.size() != 4) {
        if (approx.size() > 4 && approx.size() <= 8) {
            cv::RotatedRect min_rect = cv::minAreaRect(contour);
            cv::Point2f rect_points[4];
            min_rect.points(rect_points);
            corners.clear();
            for (int i = 0; i < 4; i++) {
                corners.emplace_back(rect_points[i].x, rect_points[i].y);
            }

            double rect_area = min_rect.size.area();
            if (rect_area > 0 && std::abs(area - rect_area) / rect_area < 0.3) {
                return isPlausibleDocument(corners, cv::Size(0, 0));
            }
        }
        return false;
    }

    corners.clear();
    for (const auto& p : approx) {
        corners.emplace_back(static_cast<float>(p.x), static_cast<float>(p.y));
    }

    if (!isPlausibleDocument(corners, cv::Size(0, 0))) {
        return false;
    }

    return true;
}

float DocumentDetector::evaluateCandidate(
    const cv::Mat& image,
    const std::vector<cv::Point2f>& corners) {

    if (corners.size() != 4) return 0.0f;

    float score = 0.0f;

    double area = cv::contourArea(corners);
    double image_area = static_cast<double>(image.cols * image.rows);
    double area_ratio = area / image_area;

    if (area_ratio >= 0.15 && area_ratio <= 0.9) {
        score += 0.25f;
    } else if (area_ratio >= 0.1 && area_ratio <= 0.95) {
        score += 0.15f;
    }

    std::vector<double> lengths;
    for (int i = 0; i < 4; i++) {
        int j = (i + 1) % 4;
        double dx = corners[j].x - corners[i].x;
        double dy = corners[j].y - corners[i].y;
        lengths.push_back(std::sqrt(dx * dx + dy * dy));
    }

    double max_len = *std::max_element(lengths.begin(), lengths.end());
    double min_len = *std::min_element(lengths.begin(), lengths.end());

    if (max_len > 0) {
        double ratio = min_len / max_len;
        if (ratio >= 0.5) {
            score += 0.25f;
        } else if (ratio >= 0.3) {
            score += 0.15f;
        }
    }

    for (int i = 0; i < 4; i++) {
        int p_prev = (i + 3) % 4;
        int p_next = (i + 1) % 4;

        cv::Point2f v1 = corners[p_prev] - corners[i];
        cv::Point2f v2 = corners[p_next] - corners[i];

        double dot = v1.x * v2.x + v1.y * v2.y;
        double len1 = std::sqrt(v1.x * v1.x + v1.y * v1.y);
        double len2 = std::sqrt(v2.x * v2.x + v2.y * v2.y);

        if (len1 > 0 && len2 > 0) {
            double cos_angle = std::abs(dot / (len1 * len2));
            double angle = std::acos(std::min(1.0, std::max(-1.0, cos_angle))) * 180.0 / CV_PI;
            double angle_diff = std::abs(90.0 - angle);

            if (angle_diff < 15.0) {
                score += 0.1f;
            } else if (angle_diff < 30.0) {
                score += 0.05f;
            }
        }
    }

    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    cv::Rect bbox = cv::boundingRect(corners);
    bbox &= cv::Rect(0, 0, image.cols, image.rows);

    if (bbox.width > 10 && bbox.height > 10) {
        cv::Mat roi = gray(bbox);
        cv::Scalar mean_scalar, std_scalar;
        cv::meanStdDev(roi, mean_scalar, std_scalar);
        double std_dev = std_scalar[0];

        if (std_dev > 15.0) {
            score += 0.1f;
        }
    }

    return std::min(1.0f, score);
}

bool DocumentDetector::isPlausibleDocument(
    const std::vector<cv::Point2f>& corners,
    const cv::Size& image_size) {

    if (corners.size() != 4) return false;

    for (const auto& p : corners) {
        if (p.x < -50 || p.y < -50) return false;
        if (image_size.width > 0 && p.x > image_size.width + 50) return false;
        if (image_size.height > 0 && p.y > image_size.height + 50) return false;
    }

    double area = cv::contourArea(corners);
    if (area <= 0) return false;

    if (image_size.width > 0 && image_size.height > 0) {
        double image_area = static_cast<double>(image_size.width * image_size.height);
        double area_ratio = area / image_area;
        if (area_ratio < 0.05 || area_ratio > 0.98) return false;
    }

    std::vector<double> lengths;
    for (int i = 0; i < 4; i++) {
        int j = (i + 1) % 4;
        double dx = corners[j].x - corners[i].x;
        double dy = corners[j].y - corners[i].y;
        lengths.push_back(std::sqrt(dx * dx + dy * dy));
    }

    double max_len = *std::max_element(lengths.begin(), lengths.end());
    double min_len = *std::min_element(lengths.begin(), lengths.end());

    if (max_len > 0 && min_len / max_len < 0.2) return false;

    return true;
}

std::vector<cv::Point2f> DocumentDetector::refineCorners(
    const cv::Mat& image,
    const std::vector<cv::Point2f>& rough_corners) {

    if (rough_corners.size() != 4) {
        return rough_corners;
    }

    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    std::vector<cv::Point2f> refined = rough_corners;

    int win_size = 15;
    for (auto& corner : refined) {
        int x = static_cast<int>(corner.x);
        int y = static_cast<int>(corner.y);

        int x_start = std::max(0, x - win_size);
        int y_start = std::max(0, y - win_size);
        int x_end = std::min(gray.cols - 1, x + win_size);
        int y_end = std::min(gray.rows - 1, y + win_size);

        if (x_end <= x_start || y_end <= y_start) continue;

        cv::Mat roi = gray(cv::Rect(x_start, y_start, x_end - x_start, y_end - y_start));

        cv::Mat grad_x, grad_y;
        cv::Sobel(roi, grad_x, CV_32F, 1, 0, 3);
        cv::Sobel(roi, grad_y, CV_32F, 0, 1, 3);

        cv::Mat grad_mag;
        cv::magnitude(grad_x, grad_y, grad_mag);

        cv::Point minLoc, maxLoc;
        double minVal, maxVal;
        cv::minMaxLoc(grad_mag, &minVal, &maxVal, &minLoc, &maxLoc);

        if (maxVal > 50) {
            corner.x = static_cast<float>(x_start + maxLoc.x);
            corner.y = static_cast<float>(y_start + maxLoc.y);
        }
    }

    std::vector<cv::Point2f> subpixel_refined = refined;
    cv::cornerSubPix(
        gray,
        subpixel_refined,
        cv::Size(5, 5),
        cv::Size(-1, -1),
        cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::MAX_ITER, 30, 0.1));

    for (size_t i = 0; i < refined.size(); i++) {
        float dx = std::abs(subpixel_refined[i].x - refined[i].x);
        float dy = std::abs(subpixel_refined[i].y - refined[i].y);
        if (dx < 20 && dy < 20) {
            refined[i] = subpixel_refined[i];
        }
    }

    return refined;
}

std::vector<cv::Point2f> DocumentDetector::inferCornersFromEdges(
    const cv::Mat& edges,
    const cv::Size& image_size) {

    std::vector<cv::Point2f> corners(4);

    cv::Mat edges_float;
    edges.convertTo(edges_float, CV_32F);

    int margin = std::min(image_size.width, image_size.height) / 10;
    int search_width = image_size.width;
    int search_height = image_size.height;

    float max_score = 0;
    int best_x = 0, best_y = 0;

    for (int y = 0; y < margin; y++) {
        for (int x = 0; x < margin; x++) {
            float score = edges_float.at<float>(y, x);
            if (score > max_score) {
                max_score = score;
                best_x = x;
                best_y = y;
            }
        }
    }
    corners[0] = cv::Point2f(static_cast<float>(best_x), static_cast<float>(best_y));

    max_score = 0;
    for (int y = 0; y < margin; y++) {
        for (int x = search_width - margin; x < search_width; x++) {
            float score = edges_float.at<float>(y, x);
            if (score > max_score) {
                max_score = score;
                best_x = x;
                best_y = y;
            }
        }
    }
    corners[1] = cv::Point2f(static_cast<float>(best_x), static_cast<float>(best_y));

    max_score = 0;
    for (int y = search_height - margin; y < search_height; y++) {
        for (int x = search_width - margin; x < search_width; x++) {
            float score = edges_float.at<float>(y, x);
            if (score > max_score) {
                max_score = score;
                best_x = x;
                best_y = y;
            }
        }
    }
    corners[2] = cv::Point2f(static_cast<float>(best_x), static_cast<float>(best_y));

    max_score = 0;
    for (int y = search_height - margin; y < search_height; y++) {
        for (int x = 0; x < margin; x++) {
            float score = edges_float.at<float>(y, x);
            if (score > max_score) {
                max_score = score;
                best_x = x;
                best_y = y;
            }
        }
    }
    corners[3] = cv::Point2f(static_cast<float>(best_x), static_cast<float>(best_y));

    if (max_score < 10) {
        corners[0] = cv::Point2f(0, 0);
        corners[1] = cv::Point2f(static_cast<float>(image_size.width - 1), 0);
        corners[2] = cv::Point2f(static_cast<float>(image_size.width - 1),
                                 static_cast<float>(image_size.height - 1));
        corners[3] = cv::Point2f(0, static_cast<float>(image_size.height - 1));
    }

    return corners;
}

bool DocumentDetector::detectTraditional(const cv::Mat& image, Corners& corners) {
    try {
        std::vector<DetectionCandidate> all_candidates;

        detectWithParams(image, 3, 0, 0, 5, all_candidates);
        detectWithParams(image, 5, 0, 0, 5, all_candidates);
        detectWithParams(image, 5, 30, 90, 3, all_candidates);
        detectWithParams(image, 3, 50, 150, 5, all_candidates);

        cv::Mat multi_edges = multiChannelEdgeDetection(image);

        std::vector<std::vector<cv::Point>> contours;
        std::vector<cv::Vec4i> hierarchy;
        cv::findContours(multi_edges.clone(), contours, hierarchy, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

        double image_area = static_cast<double>(image.cols * image.rows);
        if (!contours.empty()) {
            std::sort(contours.begin(), contours.end(),
                      [](const std::vector<cv::Point>& a, const std::vector<cv::Point>& b) {
                          return cv::contourArea(a) > cv::contourArea(b);
                      });

            for (size_t i = 0; i < contours.size() && i < 5; i++) {
                std::vector<cv::Point2f> pts;
                if (findQuadrilateralFromContour(contours[i], pts, image_area)) {
                    DetectionCandidate candidate;
                    candidate.points = pts;
                    candidate.area_ratio = static_cast<float>(cv::contourArea(pts) / image_area);
                    candidate.confidence = evaluateCandidate(image, pts);
                    candidate.score = candidate.confidence * 0.6f + candidate.area_ratio * 0.4f;
                    all_candidates.push_back(candidate);
                }
            }
        }

        if (all_candidates.empty()) {
            auto inferred = inferCornersFromEdges(multi_edges, image.size());
            corners.top_left = Point2f(inferred[0].x, inferred[0].y);
            corners.top_right = Point2f(inferred[1].x, inferred[1].y);
            corners.bottom_right = Point2f(inferred[2].x, inferred[2].y);
            corners.bottom_left = Point2f(inferred[3].x, inferred[3].y);
            return true;
        }

        std::sort(all_candidates.begin(), all_candidates.end(),
                  [](const DetectionCandidate& a, const DetectionCandidate& b) {
                      return a.score > b.score;
                  });

        for (const auto& candidate : all_candidates) {
            if (candidate.score >= 0.3f && isPlausibleDocument(candidate.points, image.size())) {
                auto refined = refineCorners(image, candidate.points);
                if (sortCorners(refined, corners)) {
                    return true;
                }
            }
        }

        if (!all_candidates.empty()) {
            auto refined = refineCorners(image, all_candidates[0].points);
            if (sortCorners(refined, corners)) {
                return true;
            }
        }

        corners.top_left = Point2f(0, 0);
        corners.top_right = Point2f(static_cast<float>(image.cols - 1), 0);
        corners.bottom_right = Point2f(static_cast<float>(image.cols - 1),
                                     static_cast<float>(image.rows - 1));
        corners.bottom_left = Point2f(0, static_cast<float>(image.rows - 1));
        return true;

    } catch (...) {
        corners.top_left = Point2f(0, 0);
        corners.top_right = Point2f(static_cast<float>(image.cols - 1), 0);
        corners.bottom_right = Point2f(static_cast<float>(image.cols - 1),
                                     static_cast<float>(image.rows - 1));
        corners.bottom_left = Point2f(0, static_cast<float>(image.rows - 1));
        return true;
    }
}

bool DocumentDetector::sortCorners(const std::vector<cv::Point2f>& input, Corners& output) {
    if (input.size() != 4) {
        return false;
    }

    std::vector<cv::Point2f> pts = input;

    std::sort(pts.begin(), pts.end(),
              [](const cv::Point2f& a, const cv::Point2f& b) {
                  return a.x + a.y < b.x + b.y;
              });

    output.top_left = Point2f(pts[0].x, pts[0].y);
    output.bottom_right = Point2f(pts[3].x, pts[3].y);

    std::sort(pts.begin() + 1, pts.begin() + 3,
              [](const cv::Point2f& a, const cv::Point2f& b) {
                  return a.y - a.x < b.y - b.x;
              });

    output.top_right = Point2f(pts[2].x, pts[2].y);
    output.bottom_left = Point2f(pts[1].x, pts[1].y);

    return true;
}

}
