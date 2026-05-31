#ifndef MQTT_PUBLISHER_H
#define MQTT_PUBLISHER_H

#include <string>
#include <memory>
#include <mutex>
#include <mqtt/async_client.h>
#include "config_parser.h"

struct RecoveryMessage {
    double timestamp;
    std::string device_id;
    std::string event_type;
    
    RecoveryMessage() : timestamp(0), event_type("recovery_detected") {}
    
    std::string toJson() const;
};

struct FallAlarmMessage {
    double timestamp;
    float confidence;
    std::string device_id;
    float bbox_x;
    float bbox_y;
    float bbox_width;
    float bbox_height;
    
    int num_visible_cameras;
    int total_cameras;
    float hip_height_3d;
    float vertical_velocity;
    float horizontal_velocity;
    float body_aspect_ratio_3d;
    float fusion_confidence;
    
    std::string event_type;
    
    FallAlarmMessage() : timestamp(0), confidence(0), 
                        bbox_x(0), bbox_y(0), bbox_width(0), bbox_height(0),
                        num_visible_cameras(0), total_cameras(0),
                        hip_height_3d(0), vertical_velocity(0), horizontal_velocity(0),
                        body_aspect_ratio_3d(0), fusion_confidence(0),
                        event_type("fall_detected") {}
    
    std::string toJson() const;
};

class MQTTPublisher {
public:
    explicit MQTTPublisher(const MQTTConfig& config);
    ~MQTTPublisher();
    
    void initialize();
    void shutdown();
    bool publishAlarm(const FallAlarmMessage& message);
    bool publishRecovery(const RecoveryMessage& message);
    bool isConnected() const;

private:
    MQTTConfig config_;
    std::unique_ptr<mqtt::async_client> client_;
    std::mutex mutex_;
    bool connected_;
    bool initialized_;
    
    bool publishJson(const std::string& json_payload, const std::string& topic);
    std::string generateTimestamp();
};

#endif
