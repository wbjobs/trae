#ifndef POSE_FUSION_ENGINE_H
#define POSE_FUSION_ENGINE_H

#include <vector>
#include <string>
#include <memory>
#include <Eigen/Dense>
#include "config_parser.h"

struct Keypoint2D {
    float x;
    float y;
    float score;
    bool visible;
};

struct Keypoint3D {
    float x;
    float y;
    float z;
    float score;
    int visible_cameras;
    bool valid;
};

struct CameraPoseResult {
    std::vector<Keypoint2D> keypoints;
    int camera_id;
    std::string camera_name;
    bool valid;
    double timestamp;
};

struct FusionResult {
    std::vector<Keypoint3D> keypoints_3d;
    std::vector<CameraPoseResult> camera_results;
    double timestamp;
    int num_visible_cameras;
    float overall_confidence;
    bool valid;
    
    float hip_height;
    float vertical_velocity;
    float horizontal_velocity;
    float body_aspect_ratio_3d;
};

class PoseFusionEngine {
public:
    PoseFusionEngine(const std::vector<CameraConfig>& camera_configs,
                     const FusionConfig& fusion_config);
    
    FusionResult fusePoses(const std::vector<CameraPoseResult>& camera_results);
    void resetHistory();
    
    static std::vector<float> createLSTMFeatures(const FusionResult& result,
                                                  int num_keypoints = 33);

private:
    std::vector<CameraConfig> camera_configs_;
    FusionConfig fusion_config_;
    
    std::vector<Eigen::Matrix3f> intrinsic_matrices_;
    std::vector<Eigen::Vector3f> camera_positions_;
    std::vector<Eigen::Matrix3f> camera_rotations_;
    std::vector<Eigen::Matrix4f> projection_matrices_;
    
    std::vector<Keypoint3D> previous_keypoints_3d_;
    double previous_timestamp_;
    bool has_previous_;
    
    void initializeCameraMatrices();
    Eigen::Vector3f triangulatePoint(const std::vector<Eigen::Vector2f>& points_2d,
                                      const std::vector<size_t>& camera_indices);
    bool isOutlier(const Eigen::Vector3f& point, 
                   const std::vector<Eigen::Vector2f>& points_2d,
                   const std::vector<size_t>& camera_indices);
    float computeReprojectionError(const Eigen::Vector3f& point_3d,
                                   const Eigen::Vector2f& point_2d,
                                   size_t camera_index);
    void temporalSmoothing(std::vector<Keypoint3D>& current_keypoints);
    float computeFusionQuality(const std::vector<CameraPoseResult>& camera_results);
    void extractKinematics(FusionResult& result);
};

#endif
