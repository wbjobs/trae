#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <thread>

class MqttClient {
public:
    using TemperatureCallback = std::function<void(float)>;

    struct Options {
        std::string broker = "tcp://localhost:1883";
        std::string client_id = "thermostat-ui";
        std::string indoor_topic = "home/living/temperature";
        std::string outdoor_topic = "home/outdoor/temperature";
        std::string user;
        std::string password;
        int sim_interval_ms = 1000;
    };

    MqttClient(Options opts, TemperatureCallback on_indoor, TemperatureCallback on_outdoor);
    ~MqttClient();

    MqttClient(const MqttClient&) = delete;
    MqttClient& operator=(const MqttClient&) = delete;

    void start();
    void stop();

    bool is_connected() const { return connected_.load(); }

private:
    void sim_loop();
    void real_loop();

    Options opts_;
    TemperatureCallback indoor_cb_;
    TemperatureCallback outdoor_cb_;
    std::atomic<bool> running_{false};
    std::atomic<bool> connected_{false};
    std::thread worker_;
};
