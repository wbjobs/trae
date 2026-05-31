#ifndef FALL_DETECTOR_H
#define FALL_DETECTOR_H

#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <atomic>
#include <thread>
#include "config_parser.h"
#include "pose_detector.h"
#include "lstm_classifier.h"
#include "mqtt_publisher.h"
#include "multi_camera_capture.h"
#include "pose_fusion_engine.h"

enum class DetectionState {
    NORMAL,
    FALL_ALARMED,
    WAITING_FOR_RECOVERY
};

enum class DetectionMode {
    SINGLE_CAMERA,
    MULTI_CAMERA_3D
};

class FallDetector {
public:
    explicit FallDetector(const std::string& config_path);
    ~FallDetector();
    
    bool initialize();
    void run();
    void stop();
    bool isRunning() const;

private:
    ConfigParser config_parser_;
    std::unique_ptr<PoseDetector> pose_detector_;
    std::unique_ptr<LSTMClassifier> lstm_classifier_;
    std::unique_ptr<MQTTPublisher> mqtt_publisher_;
    std::unique_ptr<MultiCameraCapture> multi_cam_capture_;
    std::unique_ptr<PoseFusionEngine> fusion_engine_;
    
    SystemConfig system_config_;
    CameraConfig camera_config_;
    FallDetectionConfig fall_config_;
    LSTMConfig lstm_config_;
    FusionConfig fusion_config_;
    std::vector<CameraConfig> camera_configs_;
    
    DetectionMode mode_;
    std::atomic<bool> running_;
    std::chrono::system_clock::time_point last_alarm_time_;
    
    DetectionState state_;
    int consecutive_standing_frames_;
    
    float current_fall_confidence_;
    float current_hip_height_;
    float current_vertical_velocity_;
    int current_visible_cameras_;
    
    bool canSendAlarm();
    bool isStandingPosture(const PoseData& pose);
    bool isStandingPosture3D(const FusionResult& result);
    void processFrame(const cv::Mat& frame);
    void processMultiCamFrames(const std::vector<CameraFrame>& frames);
    void handleFallDetected(float confidence, const PoseData& pose);
    void handleFallDetected3D(float confidence, const FusionResult& result);
    void handleRecoveryCheck(const PoseData& pose);
    void handleRecoveryCheck3D(const FusionResult& result);
    FallAlarmMessage createAlarmMessage(float confidence, const PoseData& pose);
    FallAlarmMessage createAlarmMessage3D(float confidence, const FusionResult& result);
    cv::Mat createMultiCamDisplay(const std::vector<CameraFrame>& frames,
                                    const std::vector<CameraPoseResult>& pose_results,
                                    const FusionResult& fusion_result);
};

#endif
