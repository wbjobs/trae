#include "config_parser.h"
#include <stdexcept>

ConfigParser::ConfigParser(const std::string& config_path) {
    try {
        config_ = YAML::LoadFile(config_path);
    } catch (const YAML::Exception& e) {
        throw std::runtime_error("Failed to load config file: " + std::string(e.what()));
    }
}

SystemConfig ConfigParser::getSystemConfig() const {
    SystemConfig cfg;
    cfg.use_multi_camera = config_["system"]["use_multi_camera"].as<bool>(false);
    cfg.num_cameras = config_["system"]["num_cameras"].as<int>(1);
    cfg.enable_3d_fusion = config_["system"]["enable_3d_fusion"].as<bool>(false);
    return cfg;
}

std::vector<CameraConfig> ConfigParser::getCameraConfigs() const {
    std::vector<CameraConfig> configs;
    
    if (config_["cameras"] && config_["cameras"].IsSequence()) {
        for (const auto& cam_node : config_["cameras"]) {
            CameraConfig cfg;
            cfg.id = cam_node["id"].as<int>(0);
            cfg.name = cam_node["name"].as<std::string>("camera");
            cfg.width = cam_node["width"].as<int>(640);
            cfg.height = cam_node["height"].as<int>(480);
            cfg.fps = cam_node["fps"].as<int>(30);
            
            if (cam_node["intrinsic_matrix"] && cam_node["intrinsic_matrix"].IsSequence()) {
                for (int i = 0; i < 3 && i < (int)cam_node["intrinsic_matrix"].size(); ++i) {
                    const auto& row = cam_node["intrinsic_matrix"][i];
                    for (int j = 0; j < 3 && j < (int)row.size(); ++j) {
                        cfg.calibration.intrinsic_matrix[i][j] = row[j].as<float>(0.0f);
                    }
                }
            }
            
            if (cam_node["distortion_coeffs"] && cam_node["distortion_coeffs"].IsSequence()) {
                for (int i = 0; i < 5 && i < (int)cam_node["distortion_coeffs"].size(); ++i) {
                    cfg.calibration.distortion_coeffs[i] = cam_node["distortion_coeffs"][i].as<float>(0.0f);
                }
            }
            
            if (cam_node["position"] && cam_node["position"].IsSequence()) {
                for (int i = 0; i < 3 && i < (int)cam_node["position"].size(); ++i) {
                    cfg.calibration.position[i] = cam_node["position"][i].as<float>(0.0f);
                }
            }
            
            if (cam_node["rotation"] && cam_node["rotation"].IsSequence()) {
                for (int i = 0; i < 3 && i < (int)cam_node["rotation"].size(); ++i) {
                    cfg.calibration.rotation[i] = cam_node["rotation"][i].as<float>(0.0f);
                }
            }
            
            configs.push_back(cfg);
        }
    }
    
    if (configs.empty()) {
        CameraConfig cfg;
        cfg.id = config_["camera"]["device_id"].as<int>(0);
        cfg.name = "camera_0";
        cfg.width = config_["camera"]["width"].as<int>(640);
        cfg.height = config_["camera"]["height"].as<int>(480);
        cfg.fps = config_["camera"]["fps"].as<int>(30);
        configs.push_back(cfg);
    }
    
    return configs;
}

FusionConfig ConfigParser::getFusionConfig() const {
    FusionConfig cfg;
    cfg.min_visible_cameras = config_["fusion"]["min_visible_cameras"].as<int>(2);
    cfg.confidence_weighted = config_["fusion"]["confidence_weighted"].as<bool>(true);
    cfg.temporal_smoothing = config_["fusion"]["temporal_smoothing"].as<float>(0.8f);
    cfg.outlier_rejection_threshold = config_["fusion"]["outlier_rejection_threshold"].as<float>(0.3f);
    cfg.use_triangulation = config_["fusion"]["use_triangulation"].as<bool>(true);
    cfg.occlusion_penalty = config_["fusion"]["occlusion_penalty"].as<float>(0.5f);
    return cfg;
}

MediaPipeConfig ConfigParser::getMediaPipeConfig() const {
    MediaPipeConfig cfg;
    cfg.model_path = config_["mediapipe"]["model_path"].as<std::string>();
    cfg.num_poses = config_["mediapipe"]["num_poses"].as<int>(1);
    cfg.min_pose_detection_confidence = config_["mediapipe"]["min_pose_detection_confidence"].as<float>(0.5f);
    cfg.min_pose_presence_confidence = config_["mediapipe"]["min_pose_presence_confidence"].as<float>(0.5f);
    cfg.min_tracking_confidence = config_["mediapipe"]["min_tracking_confidence"].as<float>(0.5f);
    return cfg;
}

LSTMConfig ConfigParser::getLSTMConfig() const {
    LSTMConfig cfg;
    cfg.model_path = config_["lstm"]["model_path"].as<std::string>();
    cfg.sequence_length = config_["lstm"]["sequence_length"].as<int>(5);
    cfg.num_keypoints = config_["lstm"]["num_keypoints"].as<int>(33);
    cfg.num_features = config_["lstm"]["num_features"].as<int>(4);
    cfg.threshold = config_["lstm"]["threshold"].as<float>(0.8f);
    cfg.use_3d_features = config_["lstm"]["use_3d_features"].as<bool>(false);
    return cfg;
}

MQTTConfig ConfigParser::getMQTTConfig() const {
    MQTTConfig cfg;
    cfg.broker = config_["mqtt"]["broker"].as<std::string>("localhost");
    cfg.port = config_["mqtt"]["port"].as<int>(1883);
    cfg.topic = config_["mqtt"]["topic"].as<std::string>("fall_detection/alarm");
    cfg.client_id = config_["mqtt"]["client_id"].as<std::string>("fall_detector_edge");
    cfg.username = config_["mqtt"]["username"].as<std::string>("");
    cfg.password = config_["mqtt"]["password"].as<std::string>("");
    cfg.qos = config_["mqtt"]["qos"].as<int>(1);
    return cfg;
}

FallDetectionConfig ConfigParser::getFallDetectionConfig() const {
    FallDetectionConfig cfg;
    cfg.cooldown_seconds = config_["fall_detection"]["cooldown_seconds"].as<int>(10);
    cfg.min_fall_confidence = config_["fall_detection"]["min_fall_confidence"].as<float>(0.85f);
    cfg.recovery_frames = config_["fall_detection"]["recovery_frames"].as<int>(30);
    cfg.standing_aspect_ratio_threshold = config_["fall_detection"]["standing_aspect_ratio_threshold"].as<float>(1.2f);
    cfg.reset_sequence_on_alarm = config_["fall_detection"]["reset_sequence_on_alarm"].as<bool>(true);
    cfg.min_3d_height_change = config_["fall_detection"]["min_3d_height_change"].as<float>(-0.3f);
    cfg.max_3d_horizontal_speed = config_["fall_detection"]["max_3d_horizontal_speed"].as<float>(2.0f);
    return cfg;
}
