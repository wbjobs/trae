#pragma once

#include <array>
#include <string>
#include <vector>

struct sqlite3;

class Database {
public:
    using DaySchedule = std::array<int, 24>;
    using WeekSchedule = std::array<DaySchedule, 7>;
    using EnergyArray = std::array<float, 24>;

    struct HourlyStat {
        int hour;
        float indoor_temp;
        float outdoor_temp;
        float target_temp;
        float energy_kwh;
    };

    explicit Database(const std::string& path);
    ~Database();

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    bool init();

    bool save_target_temperature(float t);
    float load_target_temperature(float default_t = 22.0f);

    bool save_schedule(int day, const DaySchedule& sched);
    DaySchedule load_schedule(int day);
    WeekSchedule load_week_schedule();

    bool save_hourly_stat(int hour, float indoor, float outdoor, float target, float energy);
    std::vector<HourlyStat> load_hourly_stats(int limit = 24);
    EnergyArray load_energy_24h();

private:
    sqlite3* db_;
    std::string path_;
};
