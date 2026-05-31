#ifndef TERRAIN_MESH_H
#define TERRAIN_MESH_H

#include <godot_cpp/classes/mesh_instance3d.hpp>
#include <godot_cpp/classes/array_mesh.hpp>
#include <godot_cpp/classes/shader_material.hpp>
#include <godot_cpp/classes/compute_shader.hpp>
#include <godot_cpp/classes/rendering_device.hpp>
#include <godot_cpp/classes/image_texture.hpp>
#include <godot_cpp/classes/image.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include "terrain_data.h"

namespace godot {

class TerrainMesh : public MeshInstance3D {
    GDCLASS(TerrainMesh, MeshInstance3D)

private:
    static constexpr int TERRAIN_SIZE = 1024;
    static constexpr int LOD_LEVELS = 4;

    Ref<TerrainData> terrain_data;

    Ref<ArrayMesh> mesh;
    Ref<ShaderMaterial> terrain_material;

    Ref<Image> heightmap_image;
    Ref<ImageTexture> heightmap_texture;

    Ref<Image> normalmap_image;
    Ref<ImageTexture> normalmap_texture;

    Ref<Image> weightmap_image;
    Ref<ImageTexture> weightmap_texture;

    Ref<ComputeShader> deformation_shader;
    RID compute_pipeline;
    RID compute_uniform_set;
    RID heightmap_buffer;
    RID deformation_params_buffer;

    bool compute_initialized;

    struct DeformationParams {
        float center_x;
        float center_z;
        float radius;
        float depth;
        int32_t is_add;
        int32_t padding[3];
    };

protected:
    static void _bind_methods();

public:
    TerrainMesh();
    ~TerrainMesh();

    void setup_terrain(const Ref<TerrainData>& p_data);
    void generate_mesh(int p_lod_level = 0);
    void update_textures();

    void apply_deformation_compute(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add);
    void apply_deformation_cpu(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add);

    void update_from_data();

    Ref<TerrainData> get_terrain_data() const;
    void set_terrain_data(const Ref<TerrainData>& p_data);

    Ref<ImageTexture> get_heightmap_texture() const;
    Ref<ImageTexture> get_normalmap_texture() const;
    Ref<ImageTexture> get_weightmap_texture() const;

private:
    void init_compute_shader();
    void create_heightmap_buffer();
    void update_heightmap_buffer();
    void read_back_heightmap();
};

}

#endif
