#include "db.h"

#include <sqlite3.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <stdexcept>

namespace {
const char* kCreateSchema = R"(
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule (
    day    INTEGER NOT NULL,
    hour   INTEGER NOT NULL,
    temp   INTEGER NOT NULL,
    PRIMARY KEY (day, hour)
);
CREATE TABLE IF NOT EXISTS hourly_stats (
    ts          INTEGER NOT NULL,
    hour        INTEGER NOT NULL,
    indoor_temp REAL NOT NULL,
    outdoor_temp REAL NOT NULL,
    target_temp REAL NOT NULL,
    energy_kwh  REAL NOT NULL,
    PRIMARY KEY (ts, hour)
);
)";
}

Database::Database(const std::string& path) : db_(nullptr), path_(path) {
    if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
        throw std::runtime_error(std::string("SQLite open failed: ") +
                                 (db_ ? sqlite3_errmsg(db_) : "unknown"));
    }
}

Database::~Database() {
    if (db_) sqlite3_close(db_);
}

bool Database::init() {
    char* err = nullptr;
    int rc = sqlite3_exec(db_, kCreateSchema, nullptr, nullptr, &err);
    if (rc != SQLITE_OK) {
        std::fprintf(stderr, "SQLite init error: %s\n", err ? err : "unknown");
        sqlite3_free(err);
        return false;
    }
    return true;
}

bool Database::save_target_temperature(float t) {
    const char* sql =
        "INSERT INTO settings(key,value) VALUES('target_temp', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.2f", static_cast<double>(t));
    sqlite3_bind_text(stmt, 1, buf, -1, SQLITE_STATIC);
    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

float Database::load_target_temperature(float default_t) {
    const char* sql = "SELECT value FROM settings WHERE key='target_temp';";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return default_t;
    float v = default_t;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        if (text) v = static_cast<float>(std::atof(text));
    }
    sqlite3_finalize(stmt);
    return v;
}

bool Database::save_schedule(int day, const DaySchedule& sched) {
    const char* sql =
        "INSERT INTO schedule(day,hour,temp) VALUES(?,?,?) "
        "ON CONFLICT(day,hour) DO UPDATE SET temp=excluded.temp;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    bool ok = true;
    for (int h = 0; h < 24; ++h) {
        sqlite3_reset(stmt);
        sqlite3_clear_bindings(stmt);
        sqlite3_bind_int(stmt, 1, day);
        sqlite3_bind_int(stmt, 2, h);
        sqlite3_bind_int(stmt, 3, sched[h]);
        if (sqlite3_step(stmt) != SQLITE_DONE) ok = false;
    }
    sqlite3_finalize(stmt);
    return ok;
}

Database::DaySchedule Database::load_schedule(int day) {
    DaySchedule out{};
    out.fill(20);
    const char* sql = "SELECT hour, temp FROM schedule WHERE day=?;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return out;
    sqlite3_bind_int(stmt, 1, day);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        int h = sqlite3_column_int(stmt, 0);
        int t = sqlite3_column_int(stmt, 1);
        if (h >= 0 && h < 24) out[h] = t;
    }
    sqlite3_finalize(stmt);
    return out;
}

Database::WeekSchedule Database::load_week_schedule() {
    WeekSchedule out{};
    for (int d = 0; d < 7; ++d) out[d] = load_schedule(d);
    return out;
}

bool Database::save_hourly_stat(int hour, float indoor, float outdoor, float target, float energy) {
    const char* sql =
        "INSERT INTO hourly_stats(ts, hour, indoor_temp, outdoor_temp, target_temp, energy_kwh) "
        "VALUES(strftime('%s','now'), ?, ?, ?, ?, ?) "
        "ON CONFLICT(ts, hour) DO UPDATE SET "
        "  indoor_temp=excluded.indoor_temp,"
        "  outdoor_temp=excluded.outdoor_temp,"
        "  target_temp=excluded.target_temp,"
        "  energy_kwh=excluded.energy_kwh;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_int(stmt, 1, hour);
    sqlite3_bind_double(stmt, 2, static_cast<double>(indoor));
    sqlite3_bind_double(stmt, 3, static_cast<double>(outdoor));
    sqlite3_bind_double(stmt, 4, static_cast<double>(target));
    sqlite3_bind_double(stmt, 5, static_cast<double>(energy));
    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    const char* purge = "DELETE FROM hourly_stats WHERE ts < strftime('%s','now','-2 days');";
    sqlite3_exec(db_, purge, nullptr, nullptr, nullptr);

    return rc == SQLITE_DONE;
}

std::vector<Database::HourlyStat> Database::load_hourly_stats(int limit) {
    std::vector<HourlyStat> out;
    const char* sql =
        "SELECT hour, indoor_temp, outdoor_temp, target_temp, energy_kwh "
        "FROM hourly_stats ORDER BY ts DESC, hour DESC LIMIT ?;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return out;
    sqlite3_bind_int(stmt, 1, limit);
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        HourlyStat s;
        s.hour = sqlite3_column_int(stmt, 0);
        s.indoor_temp = static_cast<float>(sqlite3_column_double(stmt, 1));
        s.outdoor_temp = static_cast<float>(sqlite3_column_double(stmt, 2));
        s.target_temp = static_cast<float>(sqlite3_column_double(stmt, 3));
        s.energy_kwh = static_cast<float>(sqlite3_column_double(stmt, 4));
        out.push_back(s);
    }
    sqlite3_finalize(stmt);
    std::reverse(out.begin(), out.end());
    return out;
}

Database::EnergyArray Database::load_energy_24h() {
    EnergyArray out{};
    out.fill(0.0f);
    const char* sql =
        "SELECT hour, energy_kwh FROM hourly_stats "
        "WHERE ts >= strftime('%s','now','-24 hours') "
        "ORDER BY ts DESC, hour DESC;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return out;

    std::array<float, 24> sums{};
    std::array<int, 24> counts{};
    sums.fill(0.0f);
    counts.fill(0);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        int h = sqlite3_column_int(stmt, 0);
        float e = static_cast<float>(sqlite3_column_double(stmt, 1));
        if (h >= 0 && h < 24) {
            sums[h] += e;
            counts[h]++;
        }
    }
    sqlite3_finalize(stmt);

    for (int h = 0; h < 24; ++h) {
        if (counts[h] > 0) out[h] = sums[h] / counts[h];
    }
    return out;
}
