#include "mqtt_client.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <random>

#ifdef USE_REAL_MQTT
#include <mqtt/async_client.h>
#endif

MqttClient::MqttClient(Options opts, TemperatureCallback on_indoor, TemperatureCallback on_outdoor)
    : opts_(std::move(opts))
    , indoor_cb_(std::move(on_indoor))
    , outdoor_cb_(std::move(on_outdoor)) {}

MqttClient::~MqttClient() {
    stop();
}

void MqttClient::start() {
    if (running_.exchange(true)) return;
#ifdef USE_REAL_MQTT
    worker_ = std::thread(&MqttClient::real_loop, this);
#else
    worker_ = std::thread(&MqttClient::sim_loop, this);
#endif
}

void MqttClient::stop() {
    if (!running_.exchange(false)) return;
    if (worker_.joinable()) worker_.join();
}

void MqttClient::sim_loop() {
    connected_.store(true);
    std::mt19937 rng(std::random_device{}());
    std::normal_distribution<float> noise(0.0f, 0.2f);

    float indoor_t = 21.0f;
    float outdoor_t = 5.0f;
    float indoor_phase = 0.0f;
    float outdoor_phase = 0.0f;

    const int interval_ms = std::max(50, opts_.sim_interval_ms);

    while (running_.load()) {
        indoor_phase += 0.02f;
        outdoor_phase += 0.008f;

        indoor_t = 21.0f + 1.5f * std::sin(indoor_phase) + noise(rng);
        outdoor_t = 8.0f + 10.0f * std::sin(outdoor_phase) + noise(rng) * 0.5f;

        if (indoor_cb_) indoor_cb_(indoor_t);
        if (outdoor_cb_) outdoor_cb_(outdoor_t);

        std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
    }
    connected_.store(false);
}

void MqttClient::real_loop() {
#ifdef USE_REAL_MQTT
    try {
        mqtt::async_client cli(opts_.broker, opts_.client_id);
        mqtt::connect_options conn_opts;
        conn_opts.set_keep_alive_interval(30);
        conn_opts.set_clean_session(true);
        if (!opts_.user.empty()) conn_opts.set_user_name(opts_.user);
        if (!opts_.password.empty()) conn_opts.set_password(opts_.password);

        cli.set_message_callback([this](mqtt::const_message_ptr msg) {
            std::string topic(msg->get_topic());
            std::string payload(msg->get_payload_str());
            try {
                float v = std::stof(payload);
                if (topic == opts_.indoor_topic && indoor_cb_) indoor_cb_(v);
                else if (topic == opts_.outdoor_topic && outdoor_cb_) outdoor_cb_(v);
            } catch (...) {
                std::fprintf(stderr, "MQTT: bad payload '%s' on '%s'\n", payload.c_str(), topic.c_str());
            }
        });

        cli.connect(conn_opts)->wait();
        connected_.store(true);
        cli.subscribe(opts_.indoor_topic, 1)->wait();
        cli.subscribe(opts_.outdoor_topic, 1)->wait();

        while (running_.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }

        cli.disconnect()->wait();
        connected_.store(false);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "MQTT error: %s\n", e.what());
        connected_.store(false);
    }
#else
    std::fprintf(stderr, "USE_REAL_MQTT not enabled; falling back to simulated loop\n");
    sim_loop();
#endif
}
