#pragma once

#include "db.h"
#include "mqtt_client.h"

#include <slint.h>

#include <array>
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>

class Thermostat {
public:
    using IntGrid = std::vector<std::vector<int>>;
    using EnergyArray = Database::EnergyArray;

    Thermostat();
    ~Thermostat();

    int run(int argc, char** argv);

private:
    void update_indoor_temperature(float t);
    void update_outdoor_temperature(float t);
    void set_target_temperature(float t);
    void save_schedule(const IntGrid& grid, int day);
    IntGrid get_schedule();
    EnergyArray get_energy_24h();
    float get_total_energy_24h();
    float get_current_outdoor_temp();
    void switch_page(int page);

    static IntGrid week_to_grid(const Database::WeekSchedule& ws);
    static Database::DaySchedule grid_row_to_day(const IntGrid& grid, int row);

    void flush_pending_target();
    void compute_and_store_hourly();

    std::unique_ptr<Database> db_;
    std::unique_ptr<MqttClient> mqtt_;

    std::mutex mtx_;
    Database::WeekSchedule schedule_;
    std::atomic<float> indoor_temp_{21.0f};
    std::atomic<float> outdoor_temp_{5.0f};
    float target_temp_ = 22.0f;
    int page_ = 0;

    bool target_dirty_ = false;
    float pending_target_ = 22.0f;
    std::chrono::steady_clock::time_point last_target_write_{};
    std::chrono::steady_clock::time_point last_hourly_store_{};

    float hourly_indoor_sum_ = 0.0f;
    float hourly_outdoor_sum_ = 0.0f;
    float hourly_target_sum_ = 0.0f;
    int hourly_sample_count_ = 0;
};
