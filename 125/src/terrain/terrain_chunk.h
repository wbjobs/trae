#ifndef TERRAIN_CHUNK_H
#define TERRAIN_CHUNK_H

#include <godot_cpp/classes/node3d.hpp>
#include <godot_cpp/classes/mesh_instance3d.hpp>
#include <godot_cpp/classes/array_mesh.hpp>
#include <godot_cpp/classes/shader_material.hpp>
#include <godot_cpp/classes/image_texture.hpp>
#include <godot_cpp/variant/packed_float32_array.hpp>
#include <godot_cpp/variant/vector2.hpp>
#include <godot_cpp/variant/vector3.hpp>
#include <vector>
#include <mutex>

namespace godot {

class TerrainChunk : public Node3D {
    GDCLASS(TerrainChunk, Node3D)

public:
    static constexpr int CHUNK_SIZE = 128;
    static constexpr int CHUNK_SIZE_SQ = CHUNK_SIZE * CHUNK_SIZE;

private:
    int chunk_x;
    int chunk_z;
    float terrain_scale;
    float min_height;
    float max_height;

    PackedFloat32Array heightmap;
    PackedFloat32Array normal_map;
    PackedFloat32Array slope_map;
    PackedFloat32Array weight_map;

    MeshInstance3D* mesh_instance;
    Ref<ArrayMesh> mesh;
    Ref<ShaderMaterial> material;

    Ref<ImageTexture> weightmap_texture;
    Ref<ImageTexture> normalmap_texture;

    bool is_loaded;
    bool is_dirty;
    bool has_collision;

    std::mutex data_mutex;

    static PackedFloat32Array* global_heightmap;
    static int world_size_chunks;
    static float global_terrain_scale;

protected:
    static void _bind_methods();

public:
    TerrainChunk();
    ~TerrainChunk();

    void setup(int p_chunk_x, int p_chunk_z, float p_scale, float p_min_h, float p_max_h);
    void generate_from_global(const PackedFloat32Array& p_global_heightmap, int p_world_size);
    void load();
    void unload();
    void rebuild_mesh();
    void update_textures();

    float get_height_local(int p_local_x, int p_local_z) const;
    void set_height_local(int p_local_x, int p_local_z, float p_value);

    float get_height_world(float p_world_x, float p_world_z) const;
    Vector3 get_normal_world(float p_world_x, float p_world_z) const;

    void apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add);

    int get_chunk_x() const;
    int get_chunk_z() const;
    Vector2 get_chunk_coords() const;
    Vector3 get_world_position_local(int p_local_x, int p_local_z) const;

    bool get_is_loaded() const;
    bool get_is_dirty() const;
    void mark_dirty();
    void clear_dirty();

    PackedFloat32Array get_heightmap_data() const;
    PackedFloat32Array get_normal_map_data() const;

    void update_normals();
    void update_slopes();
    void update_weight_map();

    static void set_global_heightmap(PackedFloat32Array* p_heightmap, int p_world_chunks, float p_scale);

private:
    void create_mesh();
    void smooth_edges();
    Vector3 calculate_normal(int p_local_x, int p_local_z) const;
};

}

#endif
