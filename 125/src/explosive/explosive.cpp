#include "explosive.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <godot_cpp/classes/engine.hpp>
#include <cmath>

using namespace godot;

void Explosive::_bind_methods() {
    ClassDB::bind_method(D_METHOD("explode"), &Explosive::explode);
    ClassDB::bind_method(D_METHOD("trigger_explosion"), &Explosive::trigger_explosion);
    ClassDB::bind_method(D_METHOD("arm_explosive", "delay"), &Explosive::arm_explosive);

    ClassDB::bind_method(D_METHOD("set_explosion_radius", "radius"), &Explosive::set_explosion_radius);
    ClassDB::bind_method(D_METHOD("get_explosion_radius"), &Explosive::get_explosion_radius);

    ClassDB::bind_method(D_METHOD("set_explosion_depth", "depth"), &Explosive::set_explosion_depth);
    ClassDB::bind_method(D_METHOD("get_explosion_depth"), &Explosive::get_explosion_depth);

    ClassDB::bind_method(D_METHOD("set_is_additive", "additive"), &Explosive::set_is_additive);
    ClassDB::bind_method(D_METHOD("get_is_additive"), &Explosive::get_is_additive);

    ClassDB::bind_method(D_METHOD("set_terrain_data", "data"), &Explosive::set_terrain_data);
    ClassDB::bind_method(D_METHOD("get_terrain_data"), &Explosive::get_terrain_data);

    ClassDB::bind_method(D_METHOD("set_volume_tracker", "tracker"), &Explosive::set_volume_tracker);
    ClassDB::bind_method(D_METHOD("get_volume_tracker"), &Explosive::get_volume_tracker);

    ClassDB::bind_method(D_METHOD("get_has_exploded"), &Explosive::get_has_exploded);

    ADD_PROPERTY(PropertyInfo(Variant::FLOAT, "explosion_radius", PROPERTY_HINT_RANGE, "5.0,20.0,0.1"), "set_explosion_radius", "get_explosion_radius");
    ADD_PROPERTY(PropertyInfo(Variant::FLOAT, "explosion_depth", PROPERTY_HINT_RANGE, "0.1,10.0,0.1"), "set_explosion_depth", "get_explosion_depth");
    ADD_PROPERTY(PropertyInfo(Variant::BOOL, "is_additive"), "set_is_additive", "get_is_additive");
    ADD_PROPERTY(PropertyInfo(Variant::OBJECT, "terrain_data", PROPERTY_HINT_RESOURCE_TYPE, "TerrainData"), "set_terrain_data", "get_terrain_data");
}

Explosive::Explosive()
    : explosion_radius(10.0f)
    , explosion_depth(2.0f)
    , is_additive(false)
    , has_exploded(false)
    , trigger_delay(0.0f)
    , timer(0.0)
    , visual_mesh(nullptr)
    , sphere_mesh(nullptr) {
}

Explosive::~Explosive() {
}

void Explosive::_ready() {
    if (Engine::get_singleton()->is_editor_hint()) {
        return;
    }

    visual_mesh = memnew(MeshInstance3D);
    sphere_mesh = memnew(SphereMesh);
    sphere_mesh->set_radius(0.5f);
    sphere_mesh->set_height(1.0f);
    visual_mesh->set_mesh(sphere_mesh);
    add_child(visual_mesh);
}

void Explosive::_process(double p_delta) {
    if (Engine::get_singleton()->is_editor_hint()) {
        return;
    }

    if (!has_exploded && trigger_delay > 0.0f) {
        timer += p_delta;
        if (timer >= trigger_delay) {
            explode();
        }
    }
}

void Explosive::explode() {
    if (has_exploded) return;
    has_exploded = true;

    if (terrain_data.is_valid()) {
        Vector3 world_pos = get_global_position();

        double volume_before = 0.0;
        if (volume_tracker.is_valid()) {
            volume_before = terrain_data->calculate_volume_in_region(world_pos, explosion_radius);
        }

        terrain_data->apply_deformation(world_pos, explosion_radius, explosion_depth, is_additive);

        if (volume_tracker.is_valid()) {
            double volume_after = terrain_data->calculate_volume_in_region(world_pos, explosion_radius);
            double volume_change = volume_after - volume_before;

            String operation = is_additive ? "ADD" : "REMOVE";
            volume_tracker->record_explosion(world_pos, explosion_radius, volume_change, operation);

            UtilityFunctions::print(
                "[Explosive] Explosion at ", world_pos,
                " | Radius: ", explosion_radius,
                " | Volume change: ", volume_change, " m³",
                " | Operation: ", operation
            );
        }
    }

    if (visual_mesh) {
        visual_mesh->queue_free();
        visual_mesh = nullptr;
    }

    queue_free();
}

void Explosive::trigger_explosion() {
    if (!has_exploded) {
        explode();
    }
}

void Explosive::arm_explosive(float p_delay) {
    trigger_delay = p_delay;
    timer = 0.0;
    has_exploded = false;
}

void Explosive::set_explosion_radius(float p_radius) {
    explosion_radius = std::clamp(p_radius, 5.0f, 20.0f);
}

float Explosive::get_explosion_radius() const {
    return explosion_radius;
}

void Explosive::set_explosion_depth(float p_depth) {
    explosion_depth = p_depth;
}

float Explosive::get_explosion_depth() const {
    return explosion_depth;
}

void Explosive::set_is_additive(bool p_additive) {
    is_additive = p_additive;
}

bool Explosive::get_is_additive() const {
    return is_additive;
}

void Explosive::set_terrain_data(const Ref<TerrainData>& p_data) {
    terrain_data = p_data;
}

Ref<TerrainData> Explosive::get_terrain_data() const {
    return terrain_data;
}

void Explosive::set_volume_tracker(const Ref<VolumeTracker>& p_tracker) {
    volume_tracker = p_tracker;
}

Ref<VolumeTracker> Explosive::get_volume_tracker() const {
    return volume_tracker;
}

bool Explosive::get_has_exploded() const {
    return has_exploded;
}
