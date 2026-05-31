#include "mqtt_publisher.h"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <ctime>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

std::string FallAlarmMessage::toJson() const {
    json j;
    j["timestamp"] = timestamp;
    j["confidence"] = confidence;
    j["device_id"] = device_id;
    j["event_type"] = event_type;
    
    if (bbox_width > 0 && bbox_height > 0) {
        j["bbox"] = {
            {"x", bbox_x},
            {"y", bbox_y},
            {"width", bbox_width},
            {"height", bbox_height}
        };
    }
    
    if (total_cameras > 0) {
        j["multi_camera"] = {
            {"visible_cameras", num_visible_cameras},
            {"total_cameras", total_cameras},
            {"fusion_confidence", fusion_confidence}
        };
        
        j["3d_analysis"] = {
            {"hip_height", hip_height_3d},
            {"vertical_velocity", vertical_velocity},
            {"horizontal_velocity", horizontal_velocity},
            {"body_aspect_ratio", body_aspect_ratio_3d}
        };
    }
    
    return j.dump();
}

std::string RecoveryMessage::toJson() const {
    json j;
    j["timestamp"] = timestamp;
    j["device_id"] = device_id;
    j["event_type"] = event_type;
    return j.dump();
}

MQTTPublisher::MQTTPublisher(const MQTTConfig& config)
    : config_(config), connected_(false), initialized_(false) {}

MQTTPublisher::~MQTTPublisher() {
    shutdown();
}

std::string MQTTPublisher::generateTimestamp() {
    auto now = std::chrono::system_clock::now();
    std::time_t time = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::localtime(&time);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S")
        << '.' << std::setfill('0') << std::setw(3) << ms.count();
    return oss.str();
}

void MQTTPublisher::initialize() {
    if (initialized_) return;
    
    try {
        std::ostringstream address;
        address << "tcp://" << config_.broker << ":" << config_.port;
        
        client_ = std::make_unique<mqtt::async_client>(
            address.str(), config_.client_id
        );
        
        mqtt::connect_options conn_opts;
        conn_opts.set_keep_alive_interval(20);
        conn_opts.set_clean_session(true);
        
        if (!config_.username.empty()) {
            conn_opts.set_user_name(config_.username);
            conn_opts.set_password(config_.password);
        }
        
        try {
            client_->connect(conn_opts)->wait();
            connected_ = true;
            initialized_ = true;
            std::cout << "MQTT connected to " << config_.broker << ":" << config_.port << std::endl;
        } catch (const mqtt::exception& e) {
            std::cerr << "MQTT connection failed: " << e.what() << std::endl;
            connected_ = false;
            initialized_ = true;
        }
        
    } catch (const std::exception& e) {
        std::cerr << "MQTT initialization error: " << e.what() << std::endl;
        connected_ = false;
        initialized_ = true;
    }
}

void MQTTPublisher::shutdown() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (client_ && connected_) {
        try {
            client_->disconnect()->wait();
        } catch (...) {}
    }
    connected_ = false;
    client_.reset();
    initialized_ = false;
}

bool MQTTPublisher::publishAlarm(const FallAlarmMessage& message) {
    return publishJson(message.toJson(), config_.topic);
}

bool MQTTPublisher::publishRecovery(const RecoveryMessage& message) {
    return publishJson(message.toJson(), config_.topic);
}

bool MQTTPublisher::publishJson(const std::string& json_payload, const std::string& topic) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (!connected_ || !client_) {
        if (initialized_) {
            try {
                mqtt::connect_options conn_opts;
                conn_opts.set_keep_alive_interval(20);
                conn_opts.set_clean_session(true);
                
                if (!config_.username.empty()) {
                    conn_opts.set_user_name(config_.username);
                    conn_opts.set_password(config_.password);
                }
                
                client_->connect(conn_opts)->wait();
                connected_ = true;
            } catch (...) {
                return false;
            }
        } else {
            return false;
        }
    }
    
    try {
        mqtt::message_ptr pubmsg = mqtt::make_message(
            topic,
            json_payload,
            config_.qos,
            false
        );
        
        try {
            client_->publish(pubmsg)->wait();
            return true;
        } catch (const mqtt::exception& e) {
            connected_ = false;
            return false;
        }
        
    } catch (const std::exception& e) {
        return false;
    }
}

bool MQTTPublisher::isConnected() const {
    return connected_;
}
