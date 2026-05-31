#ifndef EXPLOSIVE_H
#define EXPLOSIVE_H

#include <godot_cpp/classes/node3d.hpp>
#include <godot_cpp/classes/mesh_instance3d.hpp>
#include <godot_cpp/classes/sphere_mesh.hpp>
#include <godot_cpp/classes/static_body3d.hpp>
#include <godot_cpp/variant/vector3.hpp>
#include "terrain_data.h"
#include "volume_tracker.h"

namespace godot {

class Explosive : public Node3D {
    GDCLASS(Explosive, Node3D)

private:
    float explosion_radius;
    float explosion_depth;
    bool is_additive;
    bool has_exploded;
    float trigger_delay;
    double timer;

    Ref<TerrainData> terrain_data;
    Ref<VolumeTracker> volume_tracker;

    MeshInstance3D* visual_mesh;
    SphereMesh* sphere_mesh;

protected:
    static void _bind_methods();

public:
    Explosive();
    ~Explosive();

    void _ready() override;
    void _process(double p_delta) override;

    void explode();
    void trigger_explosion();
    void arm_explosive(float p_delay = 0.0f);

    void set_explosion_radius(float p_radius);
    float get_explosion_radius() const;

    void set_explosion_depth(float p_depth);
    float get_explosion_depth() const;

    void set_is_additive(bool p_additive);
    bool get_is_additive() const;

    void set_terrain_data(const Ref<TerrainData>& p_data);
    Ref<TerrainData> get_terrain_data() const;

    void set_volume_tracker(const Ref<VolumeTracker>& p_tracker);
    Ref<VolumeTracker> get_volume_tracker() const;

    bool get_has_exploded() const;
};

}

#endif
