#include "terrain_chunk.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <cmath>
#include <algorithm>

namespace godot {

PackedFloat32Array* TerrainChunk::global_heightmap = nullptr;
int TerrainChunk::world_size_chunks = 8;
float TerrainChunk::global_terrain_scale = 1.0f;

void TerrainChunk::_bind_methods() {
    ClassDB::bind_method(D_METHOD("setup", "chunk_x", "chunk_z", "scale", "min_h", "max_h"), &TerrainChunk::setup);
    ClassDB::bind_method(D_METHOD("load"), &TerrainChunk::load);
    ClassDB::bind_method(D_METHOD("unload"), &TerrainChunk::unload);
    ClassDB::bind_method(D_METHOD("rebuild_mesh"), &TerrainChunk::rebuild_mesh);
    ClassDB::bind_method(D_METHOD("apply_deformation", "world_center", "radius", "depth", "add"), &TerrainChunk::apply_deformation);
    ClassDB::bind_method(D_METHOD("get_chunk_x"), &TerrainChunk::get_chunk_x);
    ClassDB::bind_method(D_METHOD("get_chunk_z"), &TerrainChunk::get_chunk_z);
    ClassDB::bind_method(D_METHOD("get_is_loaded"), &TerrainChunk::get_is_loaded);
    ClassDB::bind_static_method("TerrainChunk", D_METHOD("set_global_heightmap", "heightmap", "world_chunks", "scale"), &TerrainChunk::set_global_heightmap);
}

TerrainChunk::TerrainChunk()
    : chunk_x(0)
    , chunk_z(0)
    , terrain_scale(1.0f)
    , min_height(0.0f)
    , max_height(100.0f)
    , mesh_instance(nullptr)
    , is_loaded(false)
    , is_dirty(false)
    , has_collision(false) {
    heightmap.resize(CHUNK_SIZE_SQ);
    normal_map.resize(CHUNK_SIZE_SQ * 3);
    slope_map.resize(CHUNK_SIZE_SQ);
    weight_map.resize(CHUNK_SIZE_SQ * 4);
}

TerrainChunk::~TerrainChunk() {
    if (mesh_instance) {
        memdelete(mesh_instance);
    }
}

void TerrainChunk::set_global_heightmap(PackedFloat32Array* p_heightmap, int p_world_chunks, float p_scale) {
    global_heightmap = p_heightmap;
    world_size_chunks = p_world_chunks;
    global_terrain_scale = p_scale;
}

void TerrainChunk::setup(int p_chunk_x, int p_chunk_z, float p_scale, float p_min_h, float p_max_h) {
    chunk_x = p_chunk_x;
    chunk_z = p_chunk_z;
    terrain_scale = p_scale;
    min_height = p_min_h;
    max_height = p_max_h;

    float world_offset_x = (chunk_x - world_size_chunks * 0.5f) * CHUNK_SIZE * terrain_scale;
    float world_offset_z = (chunk_z - world_size_chunks * 0.5f) * CHUNK_SIZE * terrain_scale;
    set_position(Vector3(world_offset_x, 0.0f, world_offset_z));
}

void TerrainChunk::generate_from_global(const PackedFloat32Array& p_global_heightmap, int p_world_size) {
    const float* global_data = p_global_heightmap.ptr();
    int global_size = p_world_size;

    int start_x = chunk_x * CHUNK_SIZE;
    int start_z = chunk_z * CHUNK_SIZE;

    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            int gx = start_x + x;
            int gz = start_z + z;

            if (gx >= 0 && gx < global_size && gz >= 0 && gz < global_size) {
                heightmap[z * CHUNK_SIZE + x] = global_data[gz * global_size + gx];
            } else {
                heightmap[z * CHUNK_SIZE + x] = (min_height + max_height) * 0.5f;
            }
        }
    }

    update_normals();
    update_slopes();
    update_weight_map();
    smooth_edges();
}

void TerrainChunk::load() {
    if (is_loaded) return;

    if (!mesh_instance) {
        mesh_instance = memnew(MeshInstance3D);
        add_child(mesh_instance);
    }

    create_mesh();
    update_textures();
    is_loaded = true;
    is_dirty = false;
}

void TerrainChunk::unload() {
    if (!is_loaded) return;

    if (mesh_instance) {
        mesh_instance->queue_free();
        mesh_instance = nullptr;
    }

    mesh = Ref<ArrayMesh>();
    material = Ref<ShaderMaterial>();
    weightmap_texture = Ref<ImageTexture>();
    normalmap_texture = Ref<ImageTexture>();

    is_loaded = false;
}

void TerrainChunk::create_mesh() {
    PackedVector3Array vertices;
    PackedVector3Array normals;
    PackedVector2Array uvs;
    PackedInt32Array indices;

    vertices.resize(CHUNK_SIZE * CHUNK_SIZE);
    normals.resize(CHUNK_SIZE * CHUNK_SIZE);
    uvs.resize(CHUNK_SIZE * CHUNK_SIZE);

    float half_size = CHUNK_SIZE * 0.5f * terrain_scale;

    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            int idx = z * CHUNK_SIZE + x;
            float wx = (x - CHUNK_SIZE * 0.5f) * terrain_scale;
            float wz = (z - CHUNK_SIZE * 0.5f) * terrain_scale;
            float wy = heightmap[idx];

            vertices[idx] = Vector3(wx, wy, wz);

            int n_idx = idx * 3;
            normals[idx] = Vector3(normal_map[n_idx], normal_map[n_idx + 1], normal_map[n_idx + 2]);

            uvs[idx] = Vector2((float)x / (CHUNK_SIZE - 1), (float)z / (CHUNK_SIZE - 1));
        }
    }

    indices.resize((CHUNK_SIZE - 1) * (CHUNK_SIZE - 1) * 6);
    int index_idx = 0;
    for (int z = 0; z < CHUNK_SIZE - 1; z++) {
        for (int x = 0; x < CHUNK_SIZE - 1; x++) {
            int i0 = z * CHUNK_SIZE + x;
            int i1 = i0 + 1;
            int i2 = i0 + CHUNK_SIZE;
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

    if (mesh_instance) {
        mesh_instance->set_mesh(mesh);
    }
}

void TerrainChunk::rebuild_mesh() {
    if (!is_loaded) return;
    create_mesh();
    update_textures();
}

void TerrainChunk::update_textures() {
    if (!is_loaded) return;

    PackedByteArray weight_bytes;
    weight_bytes.resize(CHUNK_SIZE * CHUNK_SIZE * 4 * sizeof(float));
    memcpy(weight_bytes.ptrw(), weight_map.ptr(), CHUNK_SIZE * CHUNK_SIZE * 4 * sizeof(float));

    PackedByteArray normal_bytes;
    normal_bytes.resize(CHUNK_SIZE * CHUNK_SIZE * 4 * sizeof(float));
    for (int i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        int src_idx = i * 3;
        int dst_idx = i * 4;
        ((float*)normal_bytes.ptrw())[dst_idx] = normal_map[src_idx];
        ((float*)normal_bytes.ptrw())[dst_idx + 1] = normal_map[src_idx + 1];
        ((float*)normal_bytes.ptrw())[dst_idx + 2] = normal_map[src_idx + 2];
        ((float*)normal_bytes.ptrw())[dst_idx + 3] = 0.0f;
    }

    Ref<Image> weight_img = Image::create_from_data(CHUNK_SIZE, CHUNK_SIZE, false, Image::FORMAT_RGBA32F, weight_bytes);
    Ref<Image> normal_img = Image::create_from_data(CHUNK_SIZE, CHUNK_SIZE, false, Image::FORMAT_RGBA32F, normal_bytes);

    weightmap_texture = ImageTexture::create_from_image(weight_img);
    normalmap_texture = ImageTexture::create_from_image(normal_img);

    if (!material.is_valid()) {
        material = Ref<ShaderMaterial>(ShaderMaterial::create());
        Ref<Shader> shader = ResourceLoader::get_singleton()->load("res://shaders/terrain_simple.gdshader");
        material->set_shader(shader);
        if (mesh_instance) {
            mesh_instance->set_material_override(material);
        }
    }

    material->set_shader_parameter("weightmap_texture", weightmap_texture);
    material->set_shader_parameter("normalmap_texture", normalmap_texture);
}

void TerrainChunk::update_normals() {
    const float dx = terrain_scale;
    const float scale = 0.125f / dx;

    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            Vector3 normal = calculate_normal(x, z);

            int idx = (z * CHUNK_SIZE + x) * 3;
            normal_map[idx] = normal.x;
            normal_map[idx + 1] = normal.y;
            normal_map[idx + 2] = normal.z;
        }
    }
}

Vector3 TerrainChunk::calculate_normal(int p_local_x, int p_local_z) const {
    auto get_h = [&](int dx, int dz) -> float {
        int gx = chunk_x * CHUNK_SIZE + p_local_x + dx;
        int gz = chunk_z * CHUNK_SIZE + p_local_z + dz;
        int total_size = world_size_chunks * CHUNK_SIZE;

        if (gx < 0 || gx >= total_size || gz < 0 || gz >= total_size) {
            return 0.0f;
        }

        if (global_heightmap) {
            return (*global_heightmap)[gz * total_size + gx];
        }
        return heightmap[p_local_z * CHUNK_SIZE + p_local_x];
    };

    float h00 = get_h(-1, -1);
    float h10 = get_h(0, -1);
    float h20 = get_h(1, -1);
    float h01 = get_h(-1, 0);
    float h21 = get_h(1, 0);
    float h02 = get_h(-1, 1);
    float h12 = get_h(0, 1);
    float h22 = get_h(1, 1);

    float sobel_x = (h00 + 2.0f * h01 + h02) - (h20 + 2.0f * h21 + h22);
    float sobel_z = (h00 + 2.0f * h10 + h20) - (h02 + 2.0f * h12 + h22);

    const float scale = 0.125f / terrain_scale;
    float nx = sobel_x * scale;
    float nz = sobel_z * scale;
    float ny = 1.0f;

    float len = sqrtf(nx * nx + ny * ny + nz * nz);
    if (len > 0.0f) {
        nx /= len;
        ny /= len;
        nz /= len;
    }

    return Vector3(nx, ny, nz);
}

void TerrainChunk::update_slopes() {
    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            int idx = (z * CHUNK_SIZE + x) * 3;
            Vector3 normal(normal_map[idx], normal_map[idx + 1], normal_map[idx + 2]);
            float slope = 1.0f - normal.y;
            slope = std::clamp(slope, 0.0f, 1.0f);
            slope_map[z * CHUNK_SIZE + x] = slope;
        }
    }
}

void TerrainChunk::update_weight_map() {
    float height_range = max_height - min_height;
    if (height_range <= 0.0f) height_range = 1.0f;

    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            int idx = z * CHUNK_SIZE + x;
            float height = heightmap[idx];
            float normalized_height = (height - min_height) / height_range;
            normalized_height = std::clamp(normalized_height, 0.0f, 1.0f);
            float slope = slope_map[idx];

            float grass_w = 0.0f, rock_w = 0.0f, snow_w = 0.0f, sand_w = 0.0f;

            if (slope > 0.4f) {
                rock_w = (slope - 0.4f) / 0.6f;
            }
            if (normalized_height > 0.7f) {
                snow_w = (normalized_height - 0.7f) / 0.3f;
                snow_w *= (1.0f - slope * 0.5f);
            }
            if (normalized_height < 0.2f) {
                sand_w = (0.2f - normalized_height) / 0.2f;
            }

            grass_w = 1.0f - rock_w - snow_w - sand_w;
            grass_w = std::max(0.0f, grass_w);

            float total = grass_w + rock_w + snow_w + sand_w;
            if (total > 0.001f) {
                float inv = 1.0f / total;
                grass_w *= inv; rock_w *= inv; snow_w *= inv; sand_w *= inv;
            }

            int w_idx = idx * 4;
            weight_map[w_idx] = grass_w;
            weight_map[w_idx + 1] = rock_w;
            weight_map[w_idx + 2] = snow_w;
            weight_map[w_idx + 3] = sand_w;
        }
    }
}

void TerrainChunk::smooth_edges() {
    const int border = 2;
    std::vector<float> temp(CHUNK_SIZE_SQ);

    for (int z = 0; z < CHUNK_SIZE; z++) {
        for (int x = 0; x < CHUNK_SIZE; x++) {
            bool is_border = x < border || x >= CHUNK_SIZE - border || z < border || z >= CHUNK_SIZE - border;
            if (!is_border) {
                temp[z * CHUNK_SIZE + x] = heightmap[z * CHUNK_SIZE + x];
                continue;
            }

            float avg = 0.0f;
            float count = 0.0f;
            for (int dz = -1; dz <= 1; dz++) {
                for (int dx = -1; dx <= 1; dx++) {
                    int lx = x + dx;
                    int lz = z + dz;
                    int gx = chunk_x * CHUNK_SIZE + lx;
                    int gz = chunk_z * CHUNK_SIZE + lz;
                    int total_size = world_size_chunks * CHUNK_SIZE;

                    if (gx >= 0 && gx < total_size && gz >= 0 && gz < total_size) {
                        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                            avg += heightmap[lz * CHUNK_SIZE + lx];
                        } else if (global_heightmap) {
                            avg += (*global_heightmap)[gz * total_size + gx];
                        }
                        count += 1.0f;
                    }
                }
            }
            if (count > 0.0f) {
                temp[z * CHUNK_SIZE + x] = avg / count;
            } else {
                temp[z * CHUNK_SIZE + x] = heightmap[z * CHUNK_SIZE + x];
            }
        }
    }

    for (int i = 0; i < CHUNK_SIZE_SQ; i++) {
        heightmap[i] = temp[i];
    }
}

float TerrainChunk::get_height_local(int p_local_x, int p_local_z) const {
    if (p_local_x < 0 || p_local_x >= CHUNK_SIZE || p_local_z < 0 || p_local_z >= CHUNK_SIZE) {
        return 0.0f;
    }
    return heightmap[p_local_z * CHUNK_SIZE + p_local_x];
}

void TerrainChunk::set_height_local(int p_local_x, int p_local_z, float p_value) {
    if (p_local_x < 0 || p_local_x >= CHUNK_SIZE || p_local_z < 0 || p_local_z >= CHUNK_SIZE) {
        return;
    }
    std::lock_guard<std::mutex> lock(data_mutex);
    heightmap[p_local_z * CHUNK_SIZE + p_local_x] = std::clamp(p_value, min_height, max_height);
    is_dirty = true;
}

float TerrainChunk::get_height_world(float p_world_x, float p_world_z) const {
    Vector3 local_pos = get_global_transform().affine_inverse().xform(Vector3(p_world_x, 0, p_world_z));
    float lx = local_pos.x / terrain_scale + CHUNK_SIZE * 0.5f;
    float lz = local_pos.z / terrain_scale + CHUNK_SIZE * 0.5f;

    int x0 = (int)floorf(lx);
    int z0 = (int)floorf(lz);
    float fx = lx - x0;
    float fz = lz - z0;

    x0 = std::clamp(x0, 0, CHUNK_SIZE - 2);
    z0 = std::clamp(z0, 0, CHUNK_SIZE - 2);

    float h00 = get_height_local(x0, z0);
    float h10 = get_height_local(x0 + 1, z0);
    float h01 = get_height_local(x0, z0 + 1);
    float h11 = get_height_local(x0 + 1, z0 + 1);

    float h0 = h00 * (1 - fx) + h10 * fx;
    float h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}

Vector3 TerrainChunk::get_normal_world(float p_world_x, float p_world_z) const {
    Vector3 local_pos = get_global_transform().affine_inverse().xform(Vector3(p_world_x, 0, p_world_z));
    float lx = local_pos.x / terrain_scale + CHUNK_SIZE * 0.5f;
    float lz = local_pos.z / terrain_scale + CHUNK_SIZE * 0.5f;

    int x = std::clamp((int)roundf(lx), 0, CHUNK_SIZE - 1);
    int z = std::clamp((int)roundf(lz), 0, CHUNK_SIZE - 1);

    int idx = (z * CHUNK_SIZE + x) * 3;
    return Vector3(normal_map[idx], normal_map[idx + 1], normal_map[idx + 2]);
}

void TerrainChunk::apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add) {
    std::lock_guard<std::mutex> lock(data_mutex);

    Vector3 local_center = get_global_transform().affine_inverse().xform(p_world_center);
    float local_radius = p_radius / terrain_scale;

    int center_x = (int)(local_center.x / terrain_scale + CHUNK_SIZE * 0.5f);
    int center_z = (int)(local_center.z / terrain_scale + CHUNK_SIZE * 0.5f);

    int min_x = std::max(0, center_x - (int)local_radius - 1);
    int max_x = std::min(CHUNK_SIZE - 1, center_x + (int)local_radius + 1);
    int min_z = std::max(0, center_z - (int)local_radius - 1);
    int max_z = std::min(CHUNK_SIZE - 1, center_z + (int)local_radius + 1);

    float radius_sq = p_radius * p_radius;

    for (int z = min_z; z <= max_z; z++) {
        for (int x = min_x; x <= max_x; x++) {
            float wx = (x - CHUNK_SIZE * 0.5f) * terrain_scale;
            float wz = (z - CHUNK_SIZE * 0.5f) * terrain_scale;
            float dx = wx - local_center.x;
            float dz = wz - local_center.z;
            float dist_sq = dx * dx + dz * dz;

            if (dist_sq < radius_sq) {
                float dist = sqrtf(dist_sq);
                float t = dist / p_radius;
                float falloff = 1.0f - t;
                falloff = falloff * falloff * (3.0f - 2.0f * falloff);

                float deformation = p_depth * falloff;
                int idx = z * CHUNK_SIZE + x;

                if (p_add) {
                    heightmap[idx] += deformation;
                } else {
                    heightmap[idx] -= deformation;
                }

                heightmap[idx] = std::clamp(heightmap[idx], min_height, max_height);
            }
        }
    }

    update_normals();
    update_slopes();
    update_weight_map();
    is_dirty = true;

    if (is_loaded) {
        call_deferred("rebuild_mesh");
    }
}

int TerrainChunk::get_chunk_x() const { return chunk_x; }
int TerrainChunk::get_chunk_z() const { return chunk_z; }
Vector2 TerrainChunk::get_chunk_coords() const { return Vector2(chunk_x, chunk_z); }

Vector3 TerrainChunk::get_world_position_local(int p_local_x, int p_local_z) const {
    Vector3 local_pos(
        (p_local_x - CHUNK_SIZE * 0.5f) * terrain_scale,
        heightmap[p_local_z * CHUNK_SIZE + p_local_x],
        (p_local_z - CHUNK_SIZE * 0.5f) * terrain_scale
    );
    return get_global_transform().xform(local_pos);
}

bool TerrainChunk::get_is_loaded() const { return is_loaded; }
bool TerrainChunk::get_is_dirty() const { return is_dirty; }
void TerrainChunk::mark_dirty() { is_dirty = true; }
void TerrainChunk::clear_dirty() { is_dirty = false; }

PackedFloat32Array TerrainChunk::get_heightmap_data() const { return heightmap; }
PackedFloat32Array TerrainChunk::get_normal_map_data() const { return normal_map; }

}
