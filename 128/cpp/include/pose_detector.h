#ifndef POSE_DETECTOR_H
#define POSE_DETECTOR_H

#include <string>
#include <vector>
#include <memory>
#include <opencv2/opencv.hpp>
#include "mediapipe/tasks/cc/vision/pose_landmarker/pose_landmarker.h"
#include "config_parser.h"
#include "pose_fusion_engine.h"

struct Keypoint {
    float x;
    float y;
    float z;
    float visibility;
};

struct PoseData {
    std::vector<Keypoint> keypoints;
    float confidence;
    bool detected;
};

class PoseDetector {
public:
    explicit PoseDetector(const MediaPipeConfig& config);
    ~PoseDetector();
    
    bool initialize();
    PoseData detect(const cv::Mat& frame);
    CameraPoseResult detectForCamera(const cv::Mat& frame, 
                                      int camera_id,
                                      const std::string& camera_name);
    void drawPose(cv::Mat& frame, const PoseData& pose_data);
    void drawPose2D(cv::Mat& frame, const CameraPoseResult& result);
    void drawFusion3D(cv::Mat& frame, const FusionResult& result);
    
    static std::vector<float> normalizeKeypoints(const PoseData& pose_data);

private:
    MediaPipeConfig config_;
    std::unique_ptr<mediapipe::tasks::vision::pose_landmarker::PoseLandmarker> landmarker_;
    bool initialized_;
    
    static const std::vector<std::pair<int, int>>& getPoseConnections();
};

#endif
