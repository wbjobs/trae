#ifndef DOCUMENT_CORRECTION_DETECTOR_H
#define DOCUMENT_CORRECTION_DETECTOR_H

#include "common.h"
#include <memory>
#include <string>
#include <vector>

#ifdef WITH_FASTDEPLOY
#include "fastdeploy/vision.h"
#endif

namespace doc_correction {

struct DetectionCandidate {
    std::vector<cv::Point2f> points;
    float score;
    float area_ratio;
    float confidence;

    DetectionCandidate() : score(0.0f), area_ratio(0.0f), confidence(0.0f) {}
};

class DocumentDetector {
public:
    DocumentDetector();
    ~DocumentDetector();

    bool init(const std::string& model_dir, bool use_gpu = false);

    bool detect(const cv::Mat& image, Corners& corners, float& confidence);

    void setConfidenceThreshold(float threshold);

    bool isInitialized() const;

private:
    bool initialized_;
    float confidence_threshold_;

#ifdef WITH_FASTDEPLOY
    std::unique_ptr<fastdeploy::vision::ocr::DBDetector> detector_;
#endif

    bool detectTraditional(const cv::Mat& image, Corners& corners);

    static bool sortCorners(const std::vector<cv::Point2f>& input, Corners& output);

    static cv::Mat enhanceContrast(const cv::Mat& gray);

    static cv::Mat multiChannelEdgeDetection(const cv::Mat& image);

    static void dynamicCannyThreshold(const cv::Mat& gray,
                                      double& low_threshold,
                                      double& high_threshold);

    static std::vector<cv::Point2f> refineCorners(
        const cv::Mat& image,
        const std::vector<cv::Point2f>& rough_corners);

    static bool detectWithParams(
        const cv::Mat& image,
        int blur_ksize,
        double canny_low,
        double canny_high,
        int morph_ksize,
        std::vector<DetectionCandidate>& candidates);

    static float evaluateCandidate(
        const cv::Mat& image,
        const std::vector<cv::Point2f>& corners);

    static bool findQuadrilateralFromContour(
        const std::vector<cv::Point>& contour,
        std::vector<cv::Point2f>& corners,
        double image_area);

    static std::vector<cv::Point2f> inferCornersFromEdges(
        const cv::Mat& edges,
        const cv::Size& image_size);

    static bool isPlausibleDocument(
        const std::vector<cv::Point2f>& corners,
        const cv::Size& image_size);
};

}

#endif
