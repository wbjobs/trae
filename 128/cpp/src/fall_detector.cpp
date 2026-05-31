#include "fall_detector.h"
#include <iostream>
#include <opencv2/opencv.hpp>

FallDetector::FallDetector(const std::string& config_path)
    : config_parser_(config_path),
      running_(false),
      state_(DetectionState::NORMAL),
      consecutive_standing_frames_(0),
      current_fall_confidence_(0.0f),
      current_hip_height_(0.0f),
      current_vertical_velocity_(0.0f),
      current_visible_cameras_(0) {
    last_alarm_time_ = std::chrono::system_clock::now() - std::chrono::seconds(100);
}

FallDetector::~FallDetector() {
    stop();
}

bool FallDetector::initialize() {
    try {
        system_config_ = config_parser_.getSystemConfig();
        fall_config_ = config_parser_.getFallDetectionConfig();
        lstm_config_ = config_parser_.getLSTMConfig();
        fusion_config_ = config_parser_.getFusionConfig();
        camera_configs_ = config_parser_.getCameraConfigs();
        
        if (!camera_configs_.empty()) {
            camera_config_ = camera_configs_[0];
        }
        
        mode_ = system_config_.use_multi_camera && system_config_.enable_3d_fusion 
                    ? DetectionMode::MULTI_CAMERA_3D 
                    : DetectionMode::SINGLE_CAMERA;
        
        std::cout << "Detection mode: " 
                  << (mode_ == DetectionMode::MULTI_CAMERA_3D ? "Multi-Camera 3D" : "Single Camera")
                  << std::endl;
        
        auto mp_config = config_parser_.getMediaPipeConfig();
        pose_detector_ = std::make_unique<PoseDetector>(mp_config);
        if (!pose_detector_->initialize()) {
            std::cerr << "Failed to initialize pose detector" << std::endl;
            return false;
        }
        
        lstm_classifier_ = std::make_unique<LSTMClassifier>(lstm_config_);
        if (!lstm_classifier_->initialize()) {
            std::cerr << "Failed to initialize LSTM classifier" << std::endl;
            return false;
        }
        
        auto mqtt_config = config_parser_.getMQTTConfig();
        mqtt_publisher_ = std::make_unique<MQTTPublisher>(mqtt_config);
        mqtt_publisher_->initialize();
        
        if (mode_ == DetectionMode::MULTI_CAMERA_3D) {
            multi_cam_capture_ = std::make_unique<MultiCameraCapture>(camera_configs_);
            if (!multi_cam_capture_->initialize()) {
                std::cerr << "Failed to initialize multi-camera capture" << std::endl;
                return false;
            }
            
            fusion_engine_ = std::make_unique<PoseFusionEngine>(camera_configs_, fusion_config_);
            
            std::cout << "Initialized " << camera_configs_.size() << " cameras" << std::endl;
        }
        
        return true;
    } catch (const std::exception& e) {
        std::cerr << "Initialization error: " << e.what() << std::endl;
        return false;
    }
}

void FallDetector::run() {
    running_ = true;
    
    if (mode_ == DetectionMode::MULTI_CAMERA_3D) {
        multi_cam_capture_->start();
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        
        while (running_) {
            auto frames = multi_cam_capture_->getSynchronizedFrames(100);
            if (frames.empty()) continue;
            
            processMultiCamFrames(frames);
            
            if (cv::waitKey(1) == 27) break;
        }
        
        multi_cam_capture_->stop();
    } else {
        cv::VideoCapture cap(camera_config_.id);
        if (!cap.isOpened()) {
            std::cerr << "Failed to open camera " << camera_config_.id << std::endl;
            return;
        }
        
        cap.set(cv::CAP_PROP_FRAME_WIDTH, camera_config_.width);
        cap.set(cv::CAP_PROP_FRAME_HEIGHT, camera_config_.height);
        cap.set(cv::CAP_PROP_FPS, camera_config_.fps);
        
        while (running_) {
            cv::Mat frame;
            cap >> frame;
            
            if (frame.empty()) continue;
            
            processFrame(frame);
            
            if (cv::waitKey(1) == 27) break;
        }
        
        cap.release();
    }
    
    cv::destroyAllWindows();
}

void FallDetector::stop() {
    running_ = false;
    if (mqtt_publisher_) {
        mqtt_publisher_->shutdown();
    }
}

bool FallDetector::isRunning() const {
    return running_;
}

bool FallDetector::canSendAlarm() {
    auto now = std::chrono::system_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - last_alarm_time_).count();
    return elapsed >= fall_config_.cooldown_seconds;
}

bool FallDetector::isStandingPosture(const PoseData& pose) {
    if (!pose.detected || pose.keypoints.size() < 33) return false;
    
    const auto& nose = pose.keypoints[0];
    const auto& left_heel = pose.keypoints[29];
    const auto& right_heel = pose.keypoints[30];
    const auto& left_shoulder = pose.keypoints[11];
    const auto& right_shoulder = pose.keypoints[12];
    
    float body_height = std::abs(nose.y - (left_heel.y + right_heel.y) / 2.0f);
    float shoulder_width = std::abs(left_shoulder.x - right_shoulder.x);
    
    if (shoulder_width < 0.01f) shoulder_width = 0.01f;
    float aspect_ratio = body_height / shoulder_width;
    
    return aspect_ratio >= fall_config_.standing_aspect_ratio_threshold;
}

bool FallDetector::isStandingPosture3D(const FusionResult& result) {
    if (!result.valid || result.keypoints_3d.size() < 33) return false;
    return result.body_aspect_ratio_3d >= fall_config_.standing_aspect_ratio_threshold;
}

void FallDetector::processFrame(const cv::Mat& frame) {
    PoseData pose_data = pose_detector_->detect(frame);
    
    if (state_ == DetectionState::WAITING_FOR_RECOVERY) {
        handleRecoveryCheck(pose_data);
        
        cv::Mat display = frame.clone();
        pose_detector_->drawPose(display, pose_data);
        cv::putText(display, "RECOVERING...", cv::Point(10, 30),
                   cv::FONT_HERSHEY_SIMPLEX, 1, cv::Scalar(0, 255, 255), 2);
        cv::putText(display, "Standing: " + std::to_string(consecutive_standing_frames_) + "/" + 
                   std::to_string(fall_config_.recovery_frames),
                   cv::Point(10, 60), cv::FONT_HERSHEY_SIMPLEX, 0.6, cv::Scalar(0, 255, 255), 1);
        cv::imshow("Fall Detection", display);
        return;
    }
    
    if (pose_data.detected) {
        auto features = PoseDetector::normalizeKeypoints(pose_data);
        lstm_classifier_->addKeypointSequence(features);
        
        if (lstm_classifier_->isReady()) {
            auto lstm_result = lstm_classifier_->predict();
            current_fall_confidence_ = lstm_result.fall_probability;
            
            if (lstm_result.is_fall && canSendAlarm()) {
                handleFallDetected(lstm_result.fall_probability, pose_data);
            }
        }
    }
    
    cv::Mat display = frame.clone();
    pose_detector_->drawPose(display, pose_data);
    
    if (current_fall_confidence_ > 0.5f) {
        cv::Scalar color = current_fall_confidence_ > 0.8f ? 
            cv::Scalar(0, 0, 255) : cv::Scalar(0, 255, 255);
        cv::putText(display, "Fall Prob: " + std::to_string(
            static_cast<int>(current_fall_confidence_ * 100)) + "%",
            cv::Point(10, 30), cv::FONT_HERSHEY_SIMPLEX, 0.7, color, 2);
    }
    
    cv::imshow("Fall Detection", display);
}

void FallDetector::processMultiCamFrames(const std::vector<CameraFrame>& frames) {
    std::vector<CameraPoseResult> pose_results;
    
    for (size_t i = 0; i < frames.size(); ++i) {
        if (frames[i].valid) {
            auto pose_result = pose_detector_->detectForCamera(
                frames[i].frame, frames[i].camera_id, frames[i].camera_name);
            pose_results.push_back(pose_result);
        } else {
            CameraPoseResult empty_result;
            empty_result.camera_id = i;
            empty_result.valid = false;
            pose_results.push_back(empty_result);
        }
    }
    
    FusionResult fusion_result = fusion_engine_->fusePoses(pose_results);
    
    current_visible_cameras_ = fusion_result.num_visible_cameras;
    current_hip_height_ = fusion_result.hip_height;
    current_vertical_velocity_ = fusion_result.vertical_velocity;
    
    if (state_ == DetectionState::WAITING_FOR_RECOVERY) {
        handleRecoveryCheck3D(fusion_result);
        
        cv::Mat display = createMultiCamDisplay(frames, pose_results, fusion_result);
        cv::putText(display, "RECOVERING...", cv::Point(10, 30),
                   cv::FONT_HERSHEY_SIMPLEX, 1, cv::Scalar(0, 255, 255), 2);
        cv::putText(display, "Standing: " + std::to_string(consecutive_standing_frames_) + "/" + 
                   std::to_string(fall_config_.recovery_frames),
                   cv::Point(10, 60), cv::FONT_HERSHEY_SIMPLEX, 0.6, cv::Scalar(0, 255, 255), 1);
        cv::imshow("Multi-Camera Fall Detection", display);
        return;
    }
    
    if (fusion_result.valid) {
        int valid_cam_count = fusion_result.num_visible_cameras;
        float occlusion_penalty = 1.0f;
        
        if (valid_cam_count < (int)camera_configs_.size()) {
            float occlusion_ratio = 1.0f - (float)valid_cam_count / camera_configs_.size();
            occlusion_penalty = 1.0f - occlusion_ratio * fusion_config_.occlusion_penalty;
        }
        
        auto features = PoseFusionEngine::createLSTMFeatures(
            fusion_result, lstm_config_.num_keypoints);
        lstm_classifier_->addKeypointSequence(features);
        
        if (lstm_classifier_->isReady()) {
            auto lstm_result = lstm_classifier_->predict();
            
            float adjusted_confidence = lstm_result.fall_probability * occlusion_penalty;
            current_fall_confidence_ = adjusted_confidence;
            
            bool height_check = fusion_result.vertical_velocity < fall_config_.min_3d_height_change;
            bool speed_check = fusion_result.horizontal_velocity < fall_config_.max_3d_horizontal_speed;
            bool aspect_check = fusion_result.body_aspect_ratio_3d < 0.8f;
            
            bool is_fall = adjusted_confidence >= lstm_config_.threshold &&
                          (height_check || aspect_check) && speed_check;
            
            if (is_fall && canSendAlarm()) {
                handleFallDetected3D(adjusted_confidence, fusion_result);
            }
        }
    }
    
    cv::Mat display = createMultiCamDisplay(frames, pose_results, fusion_result);
    
    if (current_fall_confidence_ > 0.5f) {
        cv::Scalar color = current_fall_confidence_ > 0.8f ? 
            cv::Scalar(0, 0, 255) : cv::Scalar(0, 255, 255);
        cv::putText(display, "Fall Prob: " + std::to_string(
            static_cast<int>(current_fall_confidence_ * 100)) + "%",
            cv::Point(10, 30), cv::FONT_HERSHEY_SIMPLEX, 0.7, color, 2);
    }
    
    cv::imshow("Multi-Camera Fall Detection", display);
}

void FallDetector::handleFallDetected(float confidence, const PoseData& pose) {
    state_ = DetectionState::WAITING_FOR_RECOVERY;
    consecutive_standing_frames_ = 0;
    last_alarm_time_ = std::chrono::system_clock::now();
    
    if (fall_config_.reset_sequence_on_alarm) {
        lstm_classifier_->reset();
    }
    
    auto alarm_msg = createAlarmMessage(confidence, pose);
    mqtt_publisher_->publishAlarm(alarm_msg);
    
    std::cout << "FALL DETECTED! Confidence: " << confidence << std::endl;
}

void FallDetector::handleFallDetected3D(float confidence, const FusionResult& result) {
    state_ = DetectionState::WAITING_FOR_RECOVERY;
    consecutive_standing_frames_ = 0;
    last_alarm_time_ = std::chrono::system_clock::now();
    
    if (fall_config_.reset_sequence_on_alarm) {
        lstm_classifier_->reset();
        fusion_engine_->resetHistory();
    }
    
    auto alarm_msg = createAlarmMessage3D(confidence, result);
    mqtt_publisher_->publishAlarm(alarm_msg);
    
    std::cout << "FALL DETECTED (3D)! Confidence: " << confidence 
              << ", Cameras: " << result.num_visible_cameras << "/" << camera_configs_.size()
              << ", Hip Height: " << result.hip_height
              << ", Vertical Vel: " << result.vertical_velocity << " m/s"
              << std::endl;
}

void FallDetector::handleRecoveryCheck(const PoseData& pose) {
    if (isStandingPosture(pose)) {
        consecutive_standing_frames_++;
    } else {
        consecutive_standing_frames_ = 0;
    }
    
    if (consecutive_standing_frames_ >= fall_config_.recovery_frames) {
        state_ = DetectionState::NORMAL;
        consecutive_standing_frames_ = 0;
        
        if (fall_config_.reset_sequence_on_alarm) {
            lstm_classifier_->reset();
        }
        
        std::cout << "Recovery complete, resuming detection" << std::endl;
        
        RecoveryMessage recovery_msg;
        recovery_msg.timestamp = std::chrono::duration<double>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        recovery_msg.device_id = "camera_" + std::to_string(camera_config_.id);
        mqtt_publisher_->publishRecovery(recovery_msg);
    }
}

void FallDetector::handleRecoveryCheck3D(const FusionResult& result) {
    if (isStandingPosture3D(result)) {
        consecutive_standing_frames_++;
    } else {
        consecutive_standing_frames_ = 0;
    }
    
    if (consecutive_standing_frames_ >= fall_config_.recovery_frames) {
        state_ = DetectionState::NORMAL;
        consecutive_standing_frames_ = 0;
        
        if (fall_config_.reset_sequence_on_alarm) {
            lstm_classifier_->reset();
            fusion_engine_->resetHistory();
        }
        
        std::cout << "Recovery complete (3D), resuming detection" << std::endl;
        
        RecoveryMessage recovery_msg;
        recovery_msg.timestamp = std::chrono::duration<double>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        recovery_msg.device_id = "multi_cam_system";
        mqtt_publisher_->publishRecovery(recovery_msg);
    }
}

FallAlarmMessage FallDetector::createAlarmMessage(float confidence, const PoseData& pose) {
    FallAlarmMessage msg;
    msg.timestamp = std::chrono::duration<double>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    msg.confidence = confidence;
    msg.device_id = "camera_" + std::to_string(camera_config_.id);
    
    if (pose.detected && pose.keypoints.size() >= 33) {
        float min_x = 1.0f, min_y = 1.0f, max_x = 0.0f, max_y = 0.0f;
        for (const auto& kp : pose.keypoints) {
            if (kp.visibility > 0.5f) {
                min_x = std::min(min_x, kp.x);
                min_y = std::min(min_y, kp.y);
                max_x = std::max(max_x, kp.x);
                max_y = std::max(max_y, kp.y);
            }
        }
        msg.bbox_x = min_x;
        msg.bbox_y = min_y;
        msg.bbox_width = max_x - min_x;
        msg.bbox_height = max_y - min_y;
    }
    
    msg.event_type = "fall_detected";
    return msg;
}

FallAlarmMessage FallDetector::createAlarmMessage3D(float confidence, const FusionResult& result) {
    FallAlarmMessage msg;
    msg.timestamp = std::chrono::duration<double>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    msg.confidence = confidence;
    msg.device_id = "multi_cam_system";
    msg.event_type = "fall_detected";
    msg.num_visible_cameras = result.num_visible_cameras;
    msg.total_cameras = (int)camera_configs_.size();
    msg.hip_height_3d = result.hip_height;
    msg.vertical_velocity = result.vertical_velocity;
    msg.horizontal_velocity = result.horizontal_velocity;
    msg.body_aspect_ratio_3d = result.body_aspect_ratio_3d;
    msg.fusion_confidence = result.overall_confidence;
    return msg;
}

cv::Mat FallDetector::createMultiCamDisplay(const std::vector<CameraFrame>& frames,
                                              const std::vector<CameraPoseResult>& pose_results,
                                              const FusionResult& fusion_result) {
    if (frames.empty()) {
        return cv::Mat::zeros(480, 640, CV_8UC3);
    }
    
    int num_frames = frames.size();
    int cols = std::min(2, num_frames);
    int rows = (num_frames + cols - 1) / cols;
    
    int frame_width = camera_configs_[0].width;
    int frame_height = camera_configs_[0].height;
    
    cv::Mat mosaic = cv::Mat::zeros(rows * frame_height, cols * frame_width, CV_8UC3);
    
    for (int i = 0; i < num_frames && i < (int)frames.size(); ++i) {
        int row = i / cols;
        int col = i % cols;
        
        cv::Rect roi(col * frame_width, row * frame_height, frame_width, frame_height);
        cv::Mat target_roi = mosaic(roi);
        
        if (frames[i].valid && !frames[i].frame.empty()) {
            cv::Mat display_frame;
            if (frames[i].frame.channels() == 1) {
                cv::cvtColor(frames[i].frame, display_frame, cv::COLOR_GRAY2BGR);
            } else {
                display_frame = frames[i].frame.clone();
            }
            
            if (i < (int)pose_results.size() && pose_results[i].valid) {
                pose_detector_->drawPose2D(display_frame, pose_results[i]);
            }
            
            cv::Scalar status_color = pose_results[i].valid ? 
                cv::Scalar(0, 255, 0) : cv::Scalar(0, 0, 255);
            cv::putText(display_frame, frames[i].camera_name + 
                       (pose_results[i].valid ? " [OK]" : " [NO POSE]"),
                       cv::Point(10, 30), cv::FONT_HERSHEY_SIMPLEX,
                       0.6, status_color, 2);
            
            display_frame.copyTo(target_roi);
        }
    }
    
    if (fusion_result.valid) {
        int overlay_x = 10;
        int overlay_y = rows * frame_height - 180;
        if (overlay_y < 10) overlay_y = 10;
        
        cv::Mat overlay_area = mosaic(cv::Rect(overlay_x, overlay_y, 350, 170));
        cv::addWeighted(overlay_area, 0.7, 
                       cv::Mat(170, 350, CV_8UC3, cv::Scalar(0, 0, 0)), 0.3, 0, overlay_area);
        
        pose_detector_->drawFusion3D(mosaic, fusion_result);
        
        std::string state_text = "State: ";
        cv::Scalar state_color;
        if (state_ == DetectionState::NORMAL) {
            state_text += "NORMAL";
            state_color = cv::Scalar(0, 255, 0);
        } else if (state_ == DetectionState::WAITING_FOR_RECOVERY) {
            state_text += "RECOVERING";
            state_color = cv::Scalar(0, 255, 255);
        }
        cv::putText(mosaic, state_text, cv::Point(10, 20),
                   cv::FONT_HERSHEY_SIMPLEX, 0.6, state_color, 2);
    }
    
    return mosaic;
}
