#ifndef TERRAIN_DATA_H
#define TERRAIN_DATA_H

#include <godot_cpp/classes/resource.hpp>
#include <godot_cpp/variant/packed_float32_array.hpp>
#include <godot_cpp/variant/vector2.hpp>
#include <godot_cpp/variant/vector3.hpp>
#include <godot_cpp/variant/color.hpp>
#include <godot_cpp/variant/packed_color_array.hpp>
#include <vector>
#include <mutex>

namespace godot {

class TerrainData : public Resource {
    GDCLASS(TerrainData, Resource)

private:
    static constexpr int TERRAIN_SIZE = 1024;
    static constexpr int TERRAIN_SIZE_SQ = TERRAIN_SIZE * TERRAIN_SIZE;

    PackedFloat32Array heightmap;
    PackedFloat32Array original_heightmap;
    PackedFloat32Array normal_map;
    PackedFloat32Array slope_map;
    PackedFloat32Array weight_map;

    float terrain_scale;
    float min_height;
    float max_height;
    bool is_dirty;
    std::mutex data_mutex;

    void update_normals_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z);
    void update_slopes_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z);
    void update_weight_map_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z);
    void smooth_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z, float p_strength = 0.5f);

protected:
    static void _bind_methods();

public:
    TerrainData();
    ~TerrainData();

    void initialize(float p_scale, float p_min_height, float p_max_height);
    void generate_perlin_terrain(int p_seed, float p_frequency, int p_octaves, float p_persistence);
    void reset_to_original();

    float get_height(int p_x, int p_z) const;
    void set_height(int p_x, int p_z, float p_value);
    float get_safe_height(int p_x, int p_z) const;

    Vector3 get_world_position(int p_x, int p_z) const;
    Vector2 get_terrain_coords(const Vector3& p_world_pos) const;

    void update_normals();
    void update_slopes();
    void update_weight_map();

    Vector3 get_normal(int p_x, int p_z) const;
    float get_slope(int p_x, int p_z) const;
    Color get_weight(int p_x, int p_z) const;

    PackedFloat32Array get_heightmap_data() const;
    PackedFloat32Array get_normal_map_data() const;
    PackedFloat32Array get_weight_map_data() const;

    int get_terrain_size() const;
    float get_terrain_scale() const;
    Vector3 get_terrain_world_size() const;

    bool is_point_inside(const Vector3& p_world_pos) const;
    void mark_dirty();
    void clear_dirty();
    bool get_is_dirty() const;

    void apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add);
    double calculate_volume_in_region(const Vector3& p_world_center, float p_radius) const;
};

}

#endif
