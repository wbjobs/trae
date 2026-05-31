#include "thermostat.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <ctime>
#include <filesystem>
#include <numeric>

namespace fs = std::filesystem;

namespace slint::generated {
struct AppWindow;
}
using AppWindow = slint::generated::AppWindow;

namespace {

constexpr float kHeatingCoeff = 0.08f;
constexpr float kMinDeltaC = 0.5f;

float estimate_energy_kwh(float indoor, float outdoor, float target) {
    if (indoor >= target - 0.1f) return 0.0f;
    float delta_target = target - indoor;
    float delta_outdoor = indoor - outdoor;
    float effective_delta = std::max(kMinDeltaC, delta_target + delta_outdoor * 0.5f);
    return kHeatingCoeff * effective_delta;
}

int current_hour() {
    std::time_t now = std::time(nullptr);
    std::tm tm_buf{};
#if defined(_WIN32)
    localtime_s(&tm_buf, &now);
#else
    localtime_r(&now, &tm_buf);
#endif
    return tm_buf.tm_hour;
}

}

Thermostat::Thermostat() {
    fs::path db_path = fs::path("/var/lib/thermostat");
    std::error_code ec;
    fs::create_directories(db_path, ec);
    db_path /= "thermostat.db";

    try {
        db_ = std::make_unique<Database>(db_path.string());
        db_->init();
    } catch (const std::exception& e) {
        std::fprintf(stderr, "Database init failed: %s\nUsing in-memory defaults.\n", e.what());
    }

    if (db_) {
        target_temp_ = db_->load_target_temperature(22.0f);
        pending_target_ = target_temp_;
        schedule_ = db_->load_week_schedule();
    }

    last_target_write_ = std::chrono::steady_clock::now();
    last_hourly_store_ = std::chrono::steady_clock::now();

    MqttClient::Options opts;
    mqtt_ = std::make_unique<MqttClient>(
        opts,
        [this](float t) { update_indoor_temperature(t); },
        [this](float t) { update_outdoor_temperature(t); });
}

Thermostat::~Thermostat() {
    if (mqtt_) mqtt_->stop();
    flush_pending_target();
    compute_and_store_hourly();
}

int Thermostat::run(int /*argc*/, char** /*argv*/) {
    auto ui = AppWindow::create();
    auto self = this;

    auto build_grid = [self]() {
        auto sched = self->get_schedule();
        slint::SharedVector<slint::SharedVector<int>> g;
        g.resize(7);
        for (int d = 0; d < 7; ++d) {
            slint::SharedVector<int> row;
            row.resize(24);
            for (int h = 0; h < 24 && h < static_cast<int>(sched[d].size()); ++h) {
                row[h] = sched[d][h];
            }
            g[d] = row;
        }
        return g;
    };

    {
        auto gl = ui->global<ThermostatLogic>();

        gl.on_target_changed([self](float t) { self->set_target_temperature(t); });

        gl.on_save_schedule(
            [self](const slint::SharedVector<slint::SharedVector<int>>& grid, int day) {
                IntGrid out(7, std::vector<int>(24));
                for (int d = 0; d < 7 && d < static_cast<int>(grid.size()); ++d) {
                    for (int h = 0; h < 24 && h < static_cast<int>(grid[d].size()); ++h) {
                        out[d][h] = grid[d][h];
                    }
                }
                self->save_schedule(out, day);
            });

        gl.on_get_schedule([build_grid]() { return build_grid(); });

        gl.on_load_schedule([self](int day) -> slint::SharedVector<int> {
            auto sched = self->get_schedule();
            slint::SharedVector<int> row;
            if (day >= 0 && day < 7 && day < static_cast<int>(sched.size())) {
                row.resize(24);
                for (int h = 0; h < 24 && h < static_cast<int>(sched[day].size()); ++h) {
                    row[h] = sched[day][h];
                }
            }
            return row;
        });

        gl.on_get_energy_24h([self]() -> slint::SharedVector<float> {
            auto arr = self->get_energy_24h();
            slint::SharedVector<float> out;
            out.resize(24);
            for (int i = 0; i < 24; ++i) out[i] = arr[i];
            return out;
        });

        gl.on_get_total_energy_24h([self]() -> float { return self->get_total_energy_24h(); });

        gl.on_get_outdoor_temp([self]() -> float { return self->get_current_outdoor_temp(); });

        gl.on_get_current_hour([]() -> int { return current_hour(); });

        gl.on_switch_page([self](int page) { self->switch_page(page); });
    }

    ui->invoke_on_timer(
        std::chrono::milliseconds(250),
        slint::TimerMode::Repeated,
        [weak = ui.as_weak(), self]() {
            if (auto u = weak.lock()) {
                auto gl = u->global<ThermostatLogic>();

                float indoor = self->indoor_temp_.load(std::memory_order_relaxed);
                float outdoor = self->outdoor_temp_.load(std::memory_order_relaxed);

                float target;
                bool connected;
                int page;
                {
                    std::lock_guard<std::mutex> lk(self->mtx_);
                    target = self->target_temp_;
                    connected = self->mqtt_ && self->mqtt_->is_connected();
                    page = self->page_;
                }

                gl.set_current_temperature(indoor);
                gl.set_target_temperature(target);
                gl.set_outdoor_temperature(outdoor);
                gl.set_status_text(
                    slint::SharedString(connected ? "MQTT 已连接" : "MQTT 模拟模式"));
                u->set_page(page);

                {
                    std::lock_guard<std::mutex> lk(self->mtx_);
                    self->hourly_indoor_sum_ += indoor;
                    self->hourly_outdoor_sum_ += outdoor;
                    self->hourly_target_sum_ += target;
                    self->hourly_sample_count_++;
                }

                self->flush_pending_target();
                self->compute_and_store_hourly();
            }
        });

    mqtt_->start();
    int rc = ui->run();
    mqtt_->stop();
    return rc;
}

void Thermostat::update_indoor_temperature(float t) {
    indoor_temp_.store(t, std::memory_order_relaxed);
}

void Thermostat::update_outdoor_temperature(float t) {
    outdoor_temp_.store(t, std::memory_order_relaxed);
}

void Thermostat::set_target_temperature(float t) {
    {
        std::lock_guard<std::mutex> lk(mtx_);
        target_temp_ = t;
        pending_target_ = t;
        target_dirty_ = true;
    }
    flush_pending_target();
}

void Thermostat::flush_pending_target() {
    if (!db_) return;

    std::lock_guard<std::mutex> lk(mtx_);
    if (!target_dirty_) return;

    auto now = std::chrono::steady_clock::now();
    constexpr auto kMinInterval = std::chrono::milliseconds(500);
    if (now - last_target_write_ < kMinInterval) return;

    db_->save_target_temperature(pending_target_);
    target_dirty_ = false;
    last_target_write_ = now;
}

void Thermostat::compute_and_store_hourly() {
    if (!db_) return;

    auto now = std::chrono::steady_clock::now();
    constexpr auto kStoreInterval = std::chrono::seconds(60);
    if (now - last_hourly_store_ < kStoreInterval) return;

    std::lock_guard<std::mutex> lk(mtx_);
    if (hourly_sample_count_ == 0) return;

    float avg_indoor = hourly_indoor_sum_ / hourly_sample_count_;
    float avg_outdoor = hourly_outdoor_sum_ / hourly_sample_count_;
    float avg_target = hourly_target_sum_ / hourly_sample_count_;
    float energy = estimate_energy_kwh(avg_indoor, avg_outdoor, avg_target);

    int h = current_hour();
    db_->save_hourly_stat(h, avg_indoor, avg_outdoor, avg_target, energy);

    hourly_indoor_sum_ = 0.0f;
    hourly_outdoor_sum_ = 0.0f;
    hourly_target_sum_ = 0.0f;
    hourly_sample_count_ = 0;
    last_hourly_store_ = now;
}

void Thermostat::save_schedule(const IntGrid& grid, int day) {
    if (grid.size() < 7) return;
    std::lock_guard<std::mutex> lk(mtx_);
    schedule_[day] = grid_row_to_day(grid, day);
    if (db_) db_->save_schedule(day, schedule_[day]);
}

Thermostat::IntGrid Thermostat::get_schedule() {
    std::lock_guard<std::mutex> lk(mtx_);
    return week_to_grid(schedule_);
}

Thermostat::EnergyArray Thermostat::get_energy_24h() {
    if (!db_) {
        EnergyArray empty{};
        empty.fill(0.0f);
        return empty;
    }
    return db_->load_energy_24h();
}

float Thermostat::get_total_energy_24h() {
    auto arr = get_energy_24h();
    return std::accumulate(arr.begin(), arr.end(), 0.0f);
}

float Thermostat::get_current_outdoor_temp() {
    return outdoor_temp_.load(std::memory_order_relaxed);
}

void Thermostat::switch_page(int page) {
    std::lock_guard<std::mutex> lk(mtx_);
    page_ = page;
}

Thermostat::IntGrid Thermostat::week_to_grid(const Database::WeekSchedule& ws) {
    IntGrid out(7, std::vector<int>(24));
    for (int d = 0; d < 7; ++d)
        for (int h = 0; h < 24; ++h) out[d][h] = ws[d][h];
    return out;
}

Database::DaySchedule Thermostat::grid_row_to_day(const IntGrid& grid, int row) {
    Database::DaySchedule d{};
    if (row < 0 || row >= 7) return d;
    for (int h = 0; h < 24 && h < static_cast<int>(grid[row].size()); ++h) {
        d[h] = grid[row][h];
    }
    return d;
}
