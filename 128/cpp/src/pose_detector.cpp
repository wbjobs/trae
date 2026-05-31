#include "pose_detector.h"
#include <stdexcept>
#include <algorithm>
#include "mediapipe/tasks/cc/vision/core/running_mode.h"

PoseDetector::PoseDetector(const MediaPipeConfig& config)
    : config_(config), initialized_(false) {}

PoseDetector::~PoseDetector() {}

bool PoseDetector::initialize() {
    try {
        auto options = std::make_unique<mediapipe::tasks::vision::pose_landmarker::PoseLandmarkerOptions>();
        options->base_options.model_asset_path = config_.model_path;
        options->running_mode = mediapipe::tasks::vision::core::RunningMode::IMAGE;
        options->num_poses = config_.num_poses;
        options->min_pose_detection_confidence = config_.min_pose_detection_confidence;
        options->min_pose_presence_confidence = config_.min_pose_presence_confidence;
        options->min_tracking_confidence = config_.min_tracking_confidence;

        auto status_or_landmarker = mediapipe::tasks::vision::pose_landmarker::PoseLandmarker::Create(std::move(options));
        if (!status_or_landmarker.ok()) {
            throw std::runtime_error("Failed to create PoseLandmarker: " + status_or_landmarker.status().message());
        }
        
        landmarker_ = std::move(status_or_landmarker.value());
        initialized_ = true;
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

PoseData PoseDetector::detect(const cv::Mat& frame) {
    PoseData result;
    result.detected = false;
    
    if (!initialized_ || !landmarker_) {
        return result;
    }
    
    try {
        auto mp_frame = mediapipe::Image(
            mediapipe::ImageFormat::SRGB,
            frame.cols, frame.rows,
            mediapipe::PixelWriteMode::kRowWise,
            frame.data
        );
        
        auto status_or_result = landmarker_->Detect(mp_frame);
        if (!status_or_result.ok()) {
            return result;
        }
        
        const auto& landmarks_result = status_or_result.value();
        if (landmarks_result.pose_landmarks.empty()) {
            return result;
        }
        
        const auto& landmarks = landmarks_result.pose_landmarks[0];
        result.keypoints.reserve(landmarks.size());
        
        float max_visibility = 0.0f;
        for (const auto& landmark : landmarks) {
            Keypoint kp;
            kp.x = landmark.x;
            kp.y = landmark.y;
            kp.z = landmark.z;
            kp.visibility = landmark.visibility.value_or(0.0f);
            result.keypoints.push_back(kp);
            max_visibility = std::max(max_visibility, kp.visibility);
        }
        
        result.confidence = max_visibility;
        result.detected = true;
        
    } catch (const std::exception& e) {
        result.detected = false;
    }
    
    return result;
}

CameraPoseResult PoseDetector::detectForCamera(const cv::Mat& frame,
                                                 int camera_id,
                                                 const std::string& camera_name) {
    CameraPoseResult result;
    result.camera_id = camera_id;
    result.camera_name = camera_name;
    result.valid = false;
    result.timestamp = std::chrono::duration<double>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    if (!initialized_ || !landmarker_) {
        return result;
    }
    
    try {
        cv::Mat rgb_frame;
        if (frame.channels() == 4) {
            cv::cvtColor(frame, rgb_frame, cv::COLOR_BGRA2RGB);
        } else if (frame.channels() == 1) {
            cv::cvtColor(frame, rgb_frame, cv::COLOR_GRAY2RGB);
        } else {
            cv::cvtColor(frame, rgb_frame, cv::COLOR_BGR2RGB);
        }
        
        auto mp_frame = mediapipe::Image(
            mediapipe::ImageFormat::SRGB,
            rgb_frame.cols, rgb_frame.rows,
            mediapipe::PixelWriteMode::kRowWise,
            rgb_frame.data
        );
        
        auto status_or_result = landmarker_->Detect(mp_frame);
        if (!status_or_result.ok()) {
            return result;
        }
        
        const auto& landmarks_result = status_or_result.value();
        if (landmarks_result.pose_landmarks.empty()) {
            return result;
        }
        
        const auto& landmarks = landmarks_result.pose_landmarks[0];
        result.keypoints.reserve(landmarks.size());
        
        for (const auto& landmark : landmarks) {
            Keypoint2D kp;
            kp.x = landmark.x;
            kp.y = landmark.y;
            kp.score = landmark.visibility.value_or(0.0f);
            kp.visible = kp.score > 0.3f;
            result.keypoints.push_back(kp);
        }
        
        result.valid = true;
        
    } catch (const std::exception& e) {
        result.valid = false;
    }
    
    return result;
}

const std::vector<std::pair<int, int>>& PoseDetector::getPoseConnections() {
    static const std::vector<std::pair<int, int>> connections = {
        {0, 1}, {1, 2}, {2, 3}, {3, 7},
        {0, 4}, {4, 5}, {5, 6}, {6, 8},
        {9, 10}, {11, 12}, {11, 13}, {13, 15},
        {15, 17}, {15, 19}, {15, 21}, {17, 19},
        {12, 14}, {14, 16}, {16, 18}, {16, 20},
        {16, 22}, {18, 20}, {11, 23}, {12, 24},
        {23, 24}, {23, 25}, {24, 26}, {25, 27},
        {26, 28}, {27, 29}, {28, 30}, {29, 31},
        {30, 32}, {27, 31}, {28, 32}
    };
    return connections;
}

void PoseDetector::drawPose(cv::Mat& frame, const PoseData& pose_data) {
    if (!pose_data.detected) return;
    
    int width = frame.cols;
    int height = frame.rows;
    
    const auto& connections = getPoseConnections();
    for (const auto& conn : connections) {
        if (conn.first < pose_data.keypoints.size() && conn.second < pose_data.keypoints.size()) {
            const auto& kp1 = pose_data.keypoints[conn.first];
            const auto& kp2 = pose_data.keypoints[conn.second];
            
            if (kp1.visibility > 0.5f && kp2.visibility > 0.5f) {
                cv::Point p1(kp1.x * width, kp1.y * height);
                cv::Point p2(kp2.x * width, kp2.y * height);
                cv::line(frame, p1, p2, cv::Scalar(0, 255, 0), 2);
            }
        }
    }
    
    for (const auto& kp : pose_data.keypoints) {
        if (kp.visibility > 0.5f) {
            cv::Point p(kp.x * width, kp.y * height);
            cv::circle(frame, p, 4, cv::Scalar(0, 0, 255), -1);
        }
    }
}

void PoseDetector::drawPose2D(cv::Mat& frame, const CameraPoseResult& result) {
    if (!result.valid) return;
    
    int width = frame.cols;
    int height = frame.rows;
    
    const auto& connections = getPoseConnections();
    for (const auto& conn : connections) {
        if (conn.first < result.keypoints.size() && conn.second < result.keypoints.size()) {
            const auto& kp1 = result.keypoints[conn.first];
            const auto& kp2 = result.keypoints[conn.second];
            
            if (kp1.visible && kp2.visible) {
                cv::Point p1(kp1.x * width, kp1.y * height);
                cv::Point p2(kp2.x * width, kp2.y * height);
                cv::line(frame, p1, p2, cv::Scalar(0, 255, 0), 2);
            }
        }
    }
    
    for (const auto& kp : result.keypoints) {
        if (kp.visible) {
            cv::Point p(kp.x * width, kp.y * height);
            cv::circle(frame, p, 3, cv::Scalar(0, 0, 255), -1);
        }
    }
}

void PoseDetector::drawFusion3D(cv::Mat& frame, const FusionResult& result) {
    if (!result.valid) return;
    
    cv::putText(frame, "3D Fusion", cv::Point(10, 60),
               cv::FONT_HERSHEY_SIMPLEX, 0.6, cv::Scalar(255, 255, 0), 2);
    
    std::string cam_info = "Cameras: " + std::to_string(result.num_visible_cameras) + "/4";
    cv::putText(frame, cam_info, cv::Point(10, 85),
               cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(255, 255, 0), 1);
    
    std::string conf_info = "Confidence: " + std::to_string(
        static_cast<int>(result.overall_confidence * 100)) + "%";
    cv::putText(frame, conf_info, cv::Point(10, 105),
               cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(255, 255, 0), 1);
    
    if (result.hip_height > 0.01f) {
        std::string height_info = "Hip Y: " + std::to_string(result.hip_height).substr(0, 5);
        cv::putText(frame, height_info, cv::Point(10, 125),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(255, 255, 0), 1);
    }
    
    if (fabs(result.vertical_velocity) > 0.01f) {
        std::string vel_info = "VVel: " + std::to_string(result.vertical_velocity).substr(0, 6) + " m/s";
        cv::putText(frame, vel_info, cv::Point(10, 145),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, 
                   result.vertical_velocity < 0 ? cv::Scalar(0, 0, 255) : cv::Scalar(255, 255, 0), 1);
    }
    
    if (result.body_aspect_ratio_3d > 0.01f) {
        cv::Scalar color = result.body_aspect_ratio_3d < 0.8 ? 
            cv::Scalar(0, 0, 255) : cv::Scalar(0, 255, 255);
        std::string ratio_info = "3D Aspect: " + std::to_string(result.body_aspect_ratio_3d).substr(0, 4);
        cv::putText(frame, ratio_info, cv::Point(10, 165),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, color, 1);
    }
    
    int valid_keypoints = 0;
    for (const auto& kp : result.keypoints_3d) {
        if (kp.valid) valid_keypoints++;
    }
    std::string kp_info = "3D Keypoints: " + std::to_string(valid_keypoints) + "/33";
    cv::putText(frame, kp_info, cv::Point(10, 185),
               cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(255, 255, 0), 1);
}

std::vector<float> PoseDetector::normalizeKeypoints(const PoseData& pose_data) {
    std::vector<float> features;
    features.reserve(33 * 4);
    
    if (!pose_data.detected || pose_data.keypoints.size() < 33) {
        for (int i = 0; i < 33 * 4; ++i) {
            features.push_back(0.0f);
        }
        return features;
    }
    
    float hip_x = (pose_data.keypoints[23].x + pose_data.keypoints[24].x) / 2.0f;
    float hip_y = (pose_data.keypoints[23].y + pose_data.keypoints[24].y) / 2.0f;
    
    float shoulder_dist = std::sqrt(
        std::pow(pose_data.keypoints[11].x - pose_data.keypoints[12].x, 2) +
        std::pow(pose_data.keypoints[11].y - pose_data.keypoints[12].y, 2)
    );
    if (shoulder_dist < 0.001f) shoulder_dist = 1.0f;
    
    for (const auto& kp : pose_data.keypoints) {
        features.push_back((kp.x - hip_x) / shoulder_dist);
        features.push_back((kp.y - hip_y) / shoulder_dist);
        features.push_back(kp.z / shoulder_dist);
        features.push_back(kp.visibility);
    }
    
    return features;
}
