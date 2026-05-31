#ifndef CONFIG_PARSER_H
#define CONFIG_PARSER_H

#include <string>
#include <vector>
#include <yaml-cpp/yaml.h>

struct CameraCalibration {
    std::array<std::array<float, 3>, 3> intrinsic_matrix;
    std::array<float, 5> distortion_coeffs;
    std::array<float, 3> position;
    std::array<float, 3> rotation;
};

struct CameraConfig {
    int id;
    std::string name;
    int width;
    int height;
    int fps;
    CameraCalibration calibration;
};

struct SystemConfig {
    bool use_multi_camera;
    int num_cameras;
    bool enable_3d_fusion;
};

struct FusionConfig {
    int min_visible_cameras;
    bool confidence_weighted;
    float temporal_smoothing;
    float outlier_rejection_threshold;
    bool use_triangulation;
    float occlusion_penalty;
};

struct MediaPipeConfig {
    std::string model_path;
    int num_poses;
    float min_pose_detection_confidence;
    float min_pose_presence_confidence;
    float min_tracking_confidence;
};

struct LSTMConfig {
    std::string model_path;
    int sequence_length;
    int num_keypoints;
    int num_features;
    float threshold;
    bool use_3d_features;
};

struct MQTTConfig {
    std::string broker;
    int port;
    std::string topic;
    std::string client_id;
    std::string username;
    std::string password;
    int qos;
};

struct FallDetectionConfig {
    int cooldown_seconds;
    float min_fall_confidence;
    int recovery_frames;
    float standing_aspect_ratio_threshold;
    bool reset_sequence_on_alarm;
    float min_3d_height_change;
    float max_3d_horizontal_speed;
};

class ConfigParser {
public:
    explicit ConfigParser(const std::string& config_path);
    
    SystemConfig getSystemConfig() const;
    std::vector<CameraConfig> getCameraConfigs() const;
    FusionConfig getFusionConfig() const;
    MediaPipeConfig getMediaPipeConfig() const;
    LSTMConfig getLSTMConfig() const;
    MQTTConfig getMQTTConfig() const;
    FallDetectionConfig getFallDetectionConfig() const;

private:
    YAML::Node config_;
};

#endif
