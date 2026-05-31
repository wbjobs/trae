#include "volume_tracker.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <chrono>

using namespace godot;

void VolumeTracker::_bind_methods() {
    ClassDB::bind_method(D_METHOD("record_explosion", "position", "radius", "volume_change", "operation"), &VolumeTracker::record_explosion);
    ClassDB::bind_method(D_METHOD("reset"), &VolumeTracker::reset);
    ClassDB::bind_method(D_METHOD("get_total_volume_added"), &VolumeTracker::get_total_volume_added);
    ClassDB::bind_method(D_METHOD("get_total_volume_removed"), &VolumeTracker::get_total_volume_removed);
    ClassDB::bind_method(D_METHOD("get_net_volume_change"), &VolumeTracker::get_net_volume_change);
    ClassDB::bind_method(D_METHOD("get_explosion_count"), &VolumeTracker::get_explosion_count);
    ClassDB::bind_method(D_METHOD("get_explosion_positions"), &VolumeTracker::get_explosion_positions);
    ClassDB::bind_method(D_METHOD("get_explosion_radii"), &VolumeTracker::get_explosion_radii);
    ClassDB::bind_method(D_METHOD("get_volume_changes"), &VolumeTracker::get_volume_changes);
    ClassDB::bind_method(D_METHOD("get_summary"), &VolumeTracker::get_summary);
}

VolumeTracker::VolumeTracker()
    : total_volume_added(0.0)
    , total_volume_removed(0.0)
    , explosion_count(0) {
}

VolumeTracker::~VolumeTracker() {
}

void VolumeTracker::record_explosion(const Vector3& p_position, float p_radius, double p_volume_change, const String& p_operation) {
    ExplosionRecord record;
    record.position = p_position;
    record.radius = p_radius;
    record.volume_change = p_volume_change;
    record.operation = p_operation;
    record.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    explosion_history.push_back(record);

    if (p_operation == "ADD") {
        total_volume_added += p_volume_change;
    } else {
        total_volume_removed += -p_volume_change;
    }

    explosion_count++;
}

void VolumeTracker::reset() {
    explosion_history.clear();
    total_volume_added = 0.0;
    total_volume_removed = 0.0;
    explosion_count = 0;
}

double VolumeTracker::get_total_volume_added() const {
    return total_volume_added;
}

double VolumeTracker::get_total_volume_removed() const {
    return total_volume_removed;
}

double VolumeTracker::get_net_volume_change() const {
    return total_volume_added - total_volume_removed;
}

int VolumeTracker::get_explosion_count() const {
    return explosion_count;
}

PackedVector3Array VolumeTracker::get_explosion_positions() const {
    PackedVector3Array positions;
    positions.resize(explosion_history.size());
    for (size_t i = 0; i < explosion_history.size(); i++) {
        positions[i] = explosion_history[i].position;
    }
    return positions;
}

PackedFloat32Array VolumeTracker::get_explosion_radii() const {
    PackedFloat32Array radii;
    radii.resize(explosion_history.size());
    for (size_t i = 0; i < explosion_history.size(); i++) {
        radii[i] = explosion_history[i].radius;
    }
    return radii;
}

PackedFloat32Array VolumeTracker::get_volume_changes() const {
    PackedFloat32Array changes;
    changes.resize(explosion_history.size());
    for (size_t i = 0; i < explosion_history.size(); i++) {
        changes[i] = (float)explosion_history[i].volume_change;
    }
    return changes;
}

String VolumeTracker::get_summary() const {
    String summary = "=== Terrain Destruction Summary ===\n";
    summary += "Total explosions: " + String::num_int64(explosion_count) + "\n";
    summary += "Total volume added: " + String::num(total_volume_added, 2) + " m³\n";
    summary += "Total volume removed: " + String::num(total_volume_removed, 2) + " m³\n";
    summary += "Net volume change: " + String::num(get_net_volume_change(), 2) + " m³\n";

    if (!explosion_history.empty()) {
        summary += "\nRecent explosions:\n";
        size_t start = explosion_history.size() > 5 ? explosion_history.size() - 5 : 0;
        for (size_t i = start; i < explosion_history.size(); i++) {
            const auto& r = explosion_history[i];
            summary += "  [" + String::num_int64(i + 1) + "] " + r.operation +
                       " | Pos: (" + String::num(r.position.x, 1) + ", " +
                       String::num(r.position.y, 1) + ", " +
                       String::num(r.position.z, 1) + ")" +
                       " | R: " + String::num(r.radius, 1) +
                       " | ΔV: " + String::num(r.volume_change, 2) + " m³\n";
        }
    }

    return summary;
}
