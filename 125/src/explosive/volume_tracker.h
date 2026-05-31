#ifndef VOLUME_TRACKER_H
#define VOLUME_TRACKER_H

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/vector3.hpp>
#include <godot_cpp/variant/packed_vector3_array.hpp>
#include <godot_cpp/variant/packed_float32_array.hpp>
#include <godot_cpp/variant/string.hpp>
#include <vector>

namespace godot {

struct ExplosionRecord {
    Vector3 position;
    float radius;
    double volume_change;
    String operation;
    uint64_t timestamp;
};

class VolumeTracker : public RefCounted {
    GDCLASS(VolumeTracker, RefCounted)

private:
    std::vector<ExplosionRecord> explosion_history;
    double total_volume_added;
    double total_volume_removed;
    int explosion_count;

protected:
    static void _bind_methods();

public:
    VolumeTracker();
    ~VolumeTracker();

    void record_explosion(const Vector3& p_position, float p_radius, double p_volume_change, const String& p_operation);
    void reset();

    double get_total_volume_added() const;
    double get_total_volume_removed() const;
    double get_net_volume_change() const;
    int get_explosion_count() const;

    PackedVector3Array get_explosion_positions() const;
    PackedFloat32Array get_explosion_radii() const;
    PackedFloat32Array get_volume_changes() const;

    String get_summary() const;
};

}

#endif
