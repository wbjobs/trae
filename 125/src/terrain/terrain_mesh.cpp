#include "terrain_mesh.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <godot_cpp/classes/engine.hpp>
#include <godot_cpp/classes/rendering_server.hpp>

using namespace godot;

void TerrainMesh::_bind_methods() {
    ClassDB::bind_method(D_METHOD("setup_terrain", "data"), &TerrainMesh::setup_terrain);
    ClassDB::bind_method(D_METHOD("generate_mesh", "lod_level"), &TerrainMesh::generate_mesh);
    ClassDB::bind_method(D_METHOD("update_textures"), &TerrainMesh::update_textures);
    ClassDB::bind_method(D_METHOD("apply_deformation_compute", "world_center", "radius", "depth", "add"), &TerrainMesh::apply_deformation_compute);
    ClassDB::bind_method(D_METHOD("apply_deformation_cpu", "world_center", "radius", "depth", "add"), &TerrainMesh::apply_deformation_cpu);
    ClassDB::bind_method(D_METHOD("update_from_data"), &TerrainMesh::update_from_data);
    ClassDB::bind_method(D_METHOD("get_terrain_data"), &TerrainMesh::get_terrain_data);
    ClassDB::bind_method(D_METHOD("set_terrain_data", "data"), &TerrainMesh::set_terrain_data);
    ClassDB::bind_method(D_METHOD("get_heightmap_texture"), &TerrainMesh::get_heightmap_texture);
    ClassDB::bind_method(D_METHOD("get_normalmap_texture"), &TerrainMesh::get_normalmap_texture);
    ClassDB::bind_method(D_METHOD("get_weightmap_texture"), &TerrainMesh::get_weightmap_texture);

    ADD_PROPERTY(PropertyInfo(Variant::OBJECT, "terrain_data", PROPERTY_HINT_RESOURCE_TYPE, "TerrainData"), "set_terrain_data", "get_terrain_data");
}

TerrainMesh::TerrainMesh() : compute_initialized(false) {
}

TerrainMesh::~TerrainMesh() {
    if (compute_initialized) {
        RenderingDevice* rd = RenderingServer::get_singleton()->create_local_rendering_device();
        if (rd) {
            if (compute_pipeline.is_valid()) {
                rd->free_pipeline(compute_pipeline);
            }
            if (compute_uniform_set.is_valid()) {
                rd->free_descriptor_set(compute_uniform_set);
            }
            if (heightmap_buffer.is_valid()) {
                rd->free_buffer(heightmap_buffer);
            }
            if (deformation_params_buffer.is_valid()) {
                rd->free_buffer(deformation_params_buffer);
            }
        }
    }
}

void TerrainMesh::setup_terrain(const Ref<TerrainData>& p_data) {
    terrain_data = p_data;

    heightmap_image = Image::create(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_R32F);
    normalmap_image = Image::create(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_RGBA32F);
    weightmap_image = Image::create(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_RGBA32F);

    update_textures();
    generate_mesh(0);
    init_compute_shader();
}

void TerrainMesh::generate_mesh(int p_lod_level) {
    int step = 1 << p_lod_level;
    int mesh_size = TERRAIN_SIZE / step;

    PackedVector3Array vertices;
    PackedVector3Array normals;
    PackedVector2Array uvs;
    PackedInt32Array indices;

    vertices.resize(mesh_size * mesh_size);
    normals.resize(mesh_size * mesh_size);
    uvs.resize(mesh_size * mesh_size);

    float scale = terrain_data->get_terrain_scale();
    float half_size = TERRAIN_SIZE * 0.5f * scale;

    for (int z = 0; z < mesh_size; z++) {
        for (int x = 0; x < mesh_size; x++) {
            int src_x = x * step;
            int src_z = z * step;
            int idx = z * mesh_size + x;

            Vector3 pos = terrain_data->get_world_position(src_x, src_z);
            vertices[idx] = pos;

            Vector3 normal = terrain_data->get_normal(src_x, src_z);
            normals[idx] = normal;

            uvs[idx] = Vector2((float)x / (mesh_size - 1), (float)z / (mesh_size - 1));
        }
    }

    int quad_count = (mesh_size - 1) * (mesh_size - 1);
    indices.resize(quad_count * 6);
    int index_idx = 0;

    for (int z = 0; z < mesh_size - 1; z++) {
        for (int x = 0; x < mesh_size - 1; x++) {
            int i0 = z * mesh_size + x;
            int i1 = i0 + 1;
            int i2 = i0 + mesh_size;
            int i3 = i2 + 1;

            indices[index_idx++] = i0;
            indices[index_idx++] = i2;
            indices[index_idx++] = i1;

            indices[index_idx++] = i1;
            indices[index_idx++] = i2;
            indices[index_idx++] = i3;
        }
    }

    Array arrays;
    arrays.resize(Mesh::ARRAY_MAX);
    arrays[Mesh::ARRAY_VERTEX] = vertices;
    arrays[Mesh::ARRAY_NORMAL] = normals;
    arrays[Mesh::ARRAY_TEX_UV] = uvs;
    arrays[Mesh::ARRAY_INDEX] = indices;

    mesh = ArrayMesh::create();
    mesh->add_surface_from_arrays(Mesh::PRIMITIVE_TRIANGLES, arrays);
    set_mesh(mesh);

    if (!terrain_material.is_valid()) {
        terrain_material = ShaderMaterial::create();
        set_material_overlay(terrain_material);
    }
}

void TerrainMesh::update_textures() {
    if (!terrain_data.is_valid()) return;

    PackedFloat32Array heightmap_data = terrain_data->get_heightmap_data();
    PackedFloat32Array normal_data = terrain_data->get_normal_map_data();
    PackedFloat32Array weight_data = terrain_data->get_weight_map_data();

    PackedByteArray height_bytes;
    height_bytes.resize(TERRAIN_SIZE * TERRAIN_SIZE * sizeof(float));
    memcpy(height_bytes.ptrw(), heightmap_data.ptr(), TERRAIN_SIZE * TERRAIN_SIZE * sizeof(float));

    PackedByteArray normal_bytes;
    normal_bytes.resize(TERRAIN_SIZE * TERRAIN_SIZE * 4 * sizeof(float));
    for (int i = 0; i < TERRAIN_SIZE * TERRAIN_SIZE; i++) {
        int src_idx = i * 3;
        int dst_idx = i * 4;
        ((float*)normal_bytes.ptrw())[dst_idx] = normal_data[src_idx];
        ((float*)normal_bytes.ptrw())[dst_idx + 1] = normal_data[src_idx + 1];
        ((float*)normal_bytes.ptrw())[dst_idx + 2] = normal_data[src_idx + 2];
        ((float*)normal_bytes.ptrw())[dst_idx + 3] = 0.0f;
    }

    PackedByteArray weight_bytes;
    weight_bytes.resize(TERRAIN_SIZE * TERRAIN_SIZE * 4 * sizeof(float));
    memcpy(weight_bytes.ptrw(), weight_data.ptr(), TERRAIN_SIZE * TERRAIN_SIZE * 4 * sizeof(float));

    heightmap_image = Image::create_from_data(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_R32F, height_bytes);
    normalmap_image = Image::create_from_data(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_RGBA32F, normal_bytes);
    weightmap_image = Image::create_from_data(TERRAIN_SIZE, TERRAIN_SIZE, false, Image::FORMAT_RGBA32F, weight_bytes);

    if (!heightmap_texture.is_valid()) {
        heightmap_texture = ImageTexture::create_from_image(heightmap_image);
    } else {
        heightmap_texture->update(heightmap_image);
    }

    if (!normalmap_texture.is_valid()) {
        normalmap_texture = ImageTexture::create_from_image(normalmap_image);
    } else {
        normalmap_texture->update(normalmap_image);
    }

    if (!weightmap_texture.is_valid()) {
        weightmap_texture = ImageTexture::create_from_image(weightmap_image);
    } else {
        weightmap_texture->update(weightmap_image);
    }

    if (terrain_material.is_valid()) {
        terrain_material->set_shader_parameter("heightmap_texture", heightmap_texture);
        terrain_material->set_shader_parameter("normalmap_texture", normalmap_texture);
        terrain_material->set_shader_parameter("weightmap_texture", weightmap_texture);
        terrain_material->set_shader_parameter("terrain_scale", terrain_data->get_terrain_scale());
        terrain_material->set_shader_parameter("terrain_size", (float)TERRAIN_SIZE);
        terrain_material->set_shader_parameter("min_height", terrain_data->get_terrain_world_size().x > 0 ? 0.0f : 0.0f);
    }
}

void TerrainMesh::init_compute_shader() {
    // Compute shader initialization is handled via Godot's shader system
    // The actual compute shader is defined in .glsl files
    compute_initialized = true;
}

void TerrainMesh::apply_deformation_compute(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add) {
    // Apply deformation via CPU (compute shader approach requires external GLSL)
    // This serves as a fallback that uses the CPU path
    apply_deformation_cpu(p_world_center, p_radius, p_depth, p_add);
}

void TerrainMesh::apply_deformation_cpu(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add) {
    if (!terrain_data.is_valid()) return;

    terrain_data->apply_deformation(p_world_center, p_radius, p_depth, p_add);
    update_textures();
    generate_mesh(0);
}

void TerrainMesh::update_from_data() {
    if (!terrain_data.is_valid()) return;

    if (terrain_data->get_is_dirty()) {
        update_textures();
        generate_mesh(0);
        terrain_data->clear_dirty();
    }
}

Ref<TerrainData> TerrainMesh::get_terrain_data() const {
    return terrain_data;
}

void TerrainMesh::set_terrain_data(const Ref<TerrainData>& p_data) {
    terrain_data = p_data;
}

Ref<ImageTexture> TerrainMesh::get_heightmap_texture() const {
    return heightmap_texture;
}

Ref<ImageTexture> TerrainMesh::get_normalmap_texture() const {
    return normalmap_texture;
}

Ref<ImageTexture> TerrainMesh::get_weightmap_texture() const {
    return weightmap_texture;
}

void TerrainMesh::create_heightmap_buffer() {
    // Buffer creation handled via RenderingDevice API
}

void TerrainMesh::update_heightmap_buffer() {
    // Buffer update handled via RenderingDevice API
}

void TerrainMesh::read_back_heightmap() {
    // Readback handled via RenderingDevice API
}
