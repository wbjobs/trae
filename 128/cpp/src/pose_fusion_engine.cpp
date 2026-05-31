#include "pose_fusion_engine.h"
#include <cmath>
#include <iostream>
#include <algorithm>
#include <limits>

PoseFusionEngine::PoseFusionEngine(const std::vector<CameraConfig>& camera_configs,
                                   const FusionConfig& fusion_config)
    : camera_configs_(camera_configs), fusion_config_(fusion_config),
      has_previous_(false), previous_timestamp_(0.0) {
    initializeCameraMatrices();
}

void PoseFusionEngine::initializeCameraMatrices() {
    intrinsic_matrices_.clear();
    camera_positions_.clear();
    camera_rotations_.clear();
    projection_matrices_.clear();
    
    for (const auto& cfg : camera_configs_) {
        Eigen::Matrix3f K;
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                K(i, j) = cfg.calibration.intrinsic_matrix[i][j];
            }
        }
        intrinsic_matrices_.push_back(K);
        
        Eigen::Vector3f t(cfg.calibration.position[0],
                          cfg.calibration.position[1],
                          cfg.calibration.position[2]);
        camera_positions_.push_back(t);
        
        Eigen::Matrix3f R = Eigen::Matrix3f::Identity();
        float rx = cfg.calibration.rotation[0];
        float ry = cfg.calibration.rotation[1];
        float rz = cfg.calibration.rotation[2];
        
        Eigen::AngleAxisf rotX(rx, Eigen::Vector3f::UnitX());
        Eigen::AngleAxisf rotY(ry, Eigen::Vector3f::UnitY());
        Eigen::AngleAxisf rotZ(rz, Eigen::Vector3f::UnitZ());
        R = (rotZ * rotY * rotX).matrix();
        camera_rotations_.push_back(R);
        
        Eigen::Matrix<float, 3, 4> RT;
        RT.block<3, 3>(0, 0) = R;
        RT.block<3, 1>(0, 3) = -R * t;
        Eigen::Matrix4f P = Eigen::Matrix4f::Zero();
        P.block<3, 4>(0, 0) = K * RT;
        projection_matrices_.push_back(P);
    }
}

Eigen::Vector3f PoseFusionEngine::triangulatePoint(
    const std::vector<Eigen::Vector2f>& points_2d,
    const std::vector<size_t>& camera_indices) {
    
    if (camera_indices.size() < 2) {
        return Eigen::Vector3f::Zero();
    }
    
    Eigen::MatrixXf A(camera_indices.size() * 2, 4);
    
    for (size_t i = 0; i < camera_indices.size(); ++i) {
        size_t cam_idx = camera_indices[i];
        const auto& P = projection_matrices_[cam_idx];
        const auto& pt = points_2d[i];
        
        A.row(i * 2) = pt.x() * P.row(2) - P.row(0);
        A.row(i * 2 + 1) = pt.y() * P.row(2) - P.row(1);
    }
    
    Eigen::JacobiSVD<Eigen::MatrixXf> svd(A, Eigen::ComputeFullV);
    Eigen::VectorXf V = svd.matrixV().col(3);
    
    if (V(3) == 0) return Eigen::Vector3f::Zero();
    
    Eigen::Vector3f point_3d = V.head<3>() / V(3);
    return point_3d;
}

float PoseFusionEngine::computeReprojectionError(
    const Eigen::Vector3f& point_3d,
    const Eigen::Vector2f& point_2d,
    size_t camera_index) {
    
    Eigen::Vector4f pt_hom(point_3d.x(), point_3d.y(), point_3d.z(), 1.0f);
    Eigen::Vector3f proj = projection_matrices_[camera_index] * pt_hom;
    
    if (proj.z() <= 0) return std::numeric_limits<float>::max();
    
    Eigen::Vector2f proj_2d = proj.head<2>() / proj.z();
    return (proj_2d - point_2d).norm();
}

bool PoseFusionEngine::isOutlier(
    const Eigen::Vector3f& point,
    const std::vector<Eigen::Vector2f>& points_2d,
    const std::vector<size_t>& camera_indices) {
    
    if (camera_indices.size() < 2) return false;
    
    float mean_error = 0.0f;
    std::vector<float> errors;
    
    for (size_t i = 0; i < camera_indices.size(); ++i) {
        float err = computeReprojectionError(point, points_2d[i], camera_indices[i]);
        errors.push_back(err);
        mean_error += err;
    }
    mean_error /= camera_indices.size();
    
    for (float err : errors) {
        if (err > fusion_config_.outlier_rejection_threshold) {
            return true;
        }
    }
    
    return false;
}

void PoseFusionEngine::temporalSmoothing(std::vector<Keypoint3D>& current_keypoints) {
    if (!has_previous_ || previous_keypoints_3d_.size() != current_keypoints.size()) {
        return;
    }
    
    float alpha = fusion_config_.temporal_smoothing;
    
    for (size_t i = 0; i < current_keypoints.size(); ++i) {
        if (current_keypoints[i].valid && previous_keypoints_3d_[i].valid) {
            current_keypoints[i].x = alpha * previous_keypoints_3d_[i].x + 
                                    (1 - alpha) * current_keypoints[i].x;
            current_keypoints[i].y = alpha * previous_keypoints_3d_[i].y + 
                                    (1 - alpha) * current_keypoints[i].y;
            current_keypoints[i].z = alpha * previous_keypoints_3d_[i].z + 
                                    (1 - alpha) * current_keypoints[i].z;
        }
    }
}

float PoseFusionEngine::computeFusionQuality(
    const std::vector<CameraPoseResult>& camera_results) {
    
    int valid_cameras = 0;
    float total_score = 0.0f;
    
    for (const auto& result : camera_results) {
        if (result.valid) {
            valid_cameras++;
            float cam_score = 0.0f;
            int visible_keypoints = 0;
            for (const auto& kp : result.keypoints) {
                if (kp.visible) {
                    cam_score += kp.score;
                    visible_keypoints++;
                }
            }
            if (visible_keypoints > 0) {
                total_score += cam_score / visible_keypoints;
            }
        }
    }
    
    if (valid_cameras == 0) return 0.0f;
    return total_score / valid_cameras * (valid_cameras / (float)camera_results.size());
}

void PoseFusionEngine::extractKinematics(FusionResult& result) {
    if (result.keypoints_3d.size() < 33) return;
    
    const int LEFT_HIP = 23;
    const int RIGHT_HIP = 24;
    const int NOSE = 0;
    const int LEFT_HEEL = 29;
    const int RIGHT_HEEL = 30;
    
    if (result.keypoints_3d[LEFT_HIP].valid && result.keypoints_3d[RIGHT_HIP].valid) {
        result.hip_height = (result.keypoints_3d[LEFT_HIP].y + 
                            result.keypoints_3d[RIGHT_HIP].y) / 2.0f;
    }
    
    if (result.keypoints_3d[NOSE].valid && 
        result.keypoints_3d[LEFT_HEEL].valid && 
        result.keypoints_3d[RIGHT_HEEL].valid) {
        float head_y = result.keypoints_3d[NOSE].y;
        float feet_y = (result.keypoints_3d[LEFT_HEEL].y + 
                       result.keypoints_3d[RIGHT_HEEL].y) / 2.0f;
        float head_xz = sqrt(pow(result.keypoints_3d[NOSE].x, 2) + 
                            pow(result.keypoints_3d[NOSE].z, 2));
        float feet_xz = sqrt(pow((result.keypoints_3d[LEFT_HEEL].x + 
                                  result.keypoints_3d[RIGHT_HEEL].x) / 2, 2) + 
                            pow((result.keypoints_3d[LEFT_HEEL].z + 
                                  result.keypoints_3d[RIGHT_HEEL].z) / 2, 2));
        
        float body_height = abs(head_y - feet_y);
        float body_width = abs(head_xz - feet_xz);
        if (body_width > 0.01f) {
            result.body_aspect_ratio_3d = body_height / body_width;
        }
    }
    
    if (has_previous_ && previous_keypoints_3d_.size() >= 33 &&
        result.timestamp > previous_timestamp_) {
        float dt = result.timestamp - previous_timestamp_;
        
        if (result.keypoints_3d[LEFT_HIP].valid && 
            previous_keypoints_3d_[LEFT_HIP].valid) {
            float prev_y = previous_keypoints_3d_[LEFT_HIP].y;
            result.vertical_velocity = (result.keypoints_3d[LEFT_HIP].y - prev_y) / dt;
            
            float prev_xz = sqrt(pow(previous_keypoints_3d_[LEFT_HIP].x, 2) + 
                                pow(previous_keypoints_3d_[LEFT_HIP].z, 2));
            float curr_xz = sqrt(pow(result.keypoints_3d[LEFT_HIP].x, 2) + 
                                pow(result.keypoints_3d[LEFT_HIP].z, 2));
            result.horizontal_velocity = abs(curr_xz - prev_xz) / dt;
        }
    }
}

FusionResult PoseFusionEngine::fusePoses(
    const std::vector<CameraPoseResult>& camera_results) {
    
    FusionResult result;
    result.camera_results = camera_results;
    result.timestamp = 0;
    result.num_visible_cameras = 0;
    result.valid = false;
    result.hip_height = 0.0f;
    result.vertical_velocity = 0.0f;
    result.horizontal_velocity = 0.0f;
    result.body_aspect_ratio_3d = 1.0f;
    
    int valid_cameras = 0;
    for (const auto& r : camera_results) {
        if (r.valid) {
            valid_cameras++;
            result.timestamp = std::max(result.timestamp, r.timestamp);
        }
    }
    result.num_visible_cameras = valid_cameras;
    
    if (valid_cameras < fusion_config_.min_visible_cameras) {
        return result;
    }
    
    result.keypoints_3d.resize(33);
    for (size_t kp_idx = 0; kp_idx < 33; ++kp_idx) {
        std::vector<Eigen::Vector2f> points_2d;
        std::vector<size_t> visible_cameras;
        std::vector<float> scores;
        
        for (size_t cam_idx = 0; cam_idx < camera_results.size(); ++cam_idx) {
            const auto& cam_result = camera_results[cam_idx];
            if (!cam_result.valid || kp_idx >= cam_result.keypoints.size()) continue;
            
            const auto& kp = cam_result.keypoints[kp_idx];
            if (kp.visible && kp.score > 0.3f) {
                points_2d.emplace_back(kp.x, kp.y);
                visible_cameras.push_back(cam_idx);
                scores.push_back(kp.score);
            }
        }
        
        if (visible_cameras.size() < (size_t)fusion_config_.min_visible_cameras) {
            result.keypoints_3d[kp_idx].valid = false;
            result.keypoints_3d[kp_idx].visible_cameras = visible_cameras.size();
            continue;
        }
        
        Eigen::Vector3f point_3d;
        float total_score = 0.0f;
        
        if (fusion_config_.use_triangulation && visible_cameras.size() >= 2) {
            point_3d = triangulatePoint(points_2d, visible_cameras);
            
            if (isOutlier(point_3d, points_2d, visible_cameras)) {
                if (has_previous_ && previous_keypoints_3d_.size() > kp_idx) {
                    point_3d << previous_keypoints_3d_[kp_idx].x,
                               previous_keypoints_3d_[kp_idx].y,
                               previous_keypoints_3d_[kp_idx].z;
                }
            }
            
            for (float s : scores) total_score += s;
            total_score /= scores.size();
        } else {
            point_3d << points_2d[0].x(), points_2d[0].y(), 0.0f;
            total_score = scores[0];
        }
        
        result.keypoints_3d[kp_idx].x = point_3d.x();
        result.keypoints_3d[kp_idx].y = point_3d.y();
        result.keypoints_3d[kp_idx].z = point_3d.z();
        result.keypoints_3d[kp_idx].score = total_score;
        result.keypoints_3d[kp_idx].visible_cameras = visible_cameras.size();
        result.keypoints_3d[kp_idx].valid = true;
    }
    
    temporalSmoothing(result.keypoints_3d);
    
    extractKinematics(result);
    
    result.overall_confidence = computeFusionQuality(camera_results);
    result.valid = true;
    
    previous_keypoints_3d_ = result.keypoints_3d;
    previous_timestamp_ = result.timestamp;
    has_previous_ = true;
    
    return result;
}

void PoseFusionEngine::resetHistory() {
    has_previous_ = false;
    previous_timestamp_ = 0;
    previous_keypoints_3d_.clear();
}

std::vector<float> PoseFusionEngine::createLSTMFeatures(
    const FusionResult& result, int num_keypoints) {
    
    std::vector<float> features;
    features.reserve(num_keypoints * 6);
    
    int NOSE = 0;
    int LEFT_HIP = 23;
    int RIGHT_HIP = 24;
    
    float ref_x = 0.0f, ref_y = 0.0f, ref_z = 0.0f;
    bool has_ref = false;
    if (result.keypoints_3d.size() > (size_t)LEFT_HIP && 
        result.keypoints_3d[LEFT_HIP].valid &&
        result.keypoints_3d.size() > (size_t)RIGHT_HIP && 
        result.keypoints_3d[RIGHT_HIP].valid) {
        ref_x = (result.keypoints_3d[LEFT_HIP].x + result.keypoints_3d[RIGHT_HIP].x) / 2.0f;
        ref_y = (result.keypoints_3d[LEFT_HIP].y + result.keypoints_3d[RIGHT_HIP].y) / 2.0f;
        ref_z = (result.keypoints_3d[LEFT_HIP].z + result.keypoints_3d[RIGHT_HIP].z) / 2.0f;
        has_ref = true;
    } else if (result.keypoints_3d.size() > (size_t)NOSE && 
               result.keypoints_3d[NOSE].valid) {
        ref_x = result.keypoints_3d[NOSE].x;
        ref_y = result.keypoints_3d[NOSE].y;
        ref_z = result.keypoints_3d[NOSE].z;
        has_ref = true;
    }
    
    for (int i = 0; i < num_keypoints; ++i) {
        if (i < (int)result.keypoints_3d.size() && result.keypoints_3d[i].valid) {
            const auto& kp = result.keypoints_3d[i];
            features.push_back(has_ref ? (kp.x - ref_x) : kp.x);
            features.push_back(has_ref ? (kp.y - ref_y) : kp.y);
            features.push_back(has_ref ? (kp.z - ref_z) : kp.z);
            features.push_back(kp.score);
            features.push_back((float)kp.visible_cameras / 4.0f);
            features.push_back(1.0f);
        } else {
            features.push_back(0.0f);
            features.push_back(0.0f);
            features.push_back(0.0f);
            features.push_back(0.0f);
            features.push_back(0.0f);
            features.push_back(0.0f);
        }
    }
    
    return features;
}
