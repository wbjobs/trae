#include "terrain_data.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <cmath>
#include <algorithm>
#include <random>

using namespace godot;

void TerrainData::_bind_methods() {
    ClassDB::bind_method(D_METHOD("initialize", "scale", "min_height", "max_height"), &TerrainData::initialize);
    ClassDB::bind_method(D_METHOD("generate_perlin_terrain", "seed", "frequency", "octaves", "persistence"), &TerrainData::generate_perlin_terrain);
    ClassDB::bind_method(D_METHOD("reset_to_original"), &TerrainData::reset_to_original);
    ClassDB::bind_method(D_METHOD("get_height", "x", "z"), &TerrainData::get_height);
    ClassDB::bind_method(D_METHOD("set_height", "x", "z", "value"), &TerrainData::set_height);
    ClassDB::bind_method(D_METHOD("get_world_position", "x", "z"), &TerrainData::get_world_position);
    ClassDB::bind_method(D_METHOD("get_terrain_coords", "world_pos"), &TerrainData::get_terrain_coords);
    ClassDB::bind_method(D_METHOD("update_normals"), &TerrainData::update_normals);
    ClassDB::bind_method(D_METHOD("update_slopes"), &TerrainData::update_slopes);
    ClassDB::bind_method(D_METHOD("update_weight_map"), &TerrainData::update_weight_map);
    ClassDB::bind_method(D_METHOD("get_heightmap_data"), &TerrainData::get_heightmap_data);
    ClassDB::bind_method(D_METHOD("get_normal_map_data"), &TerrainData::get_normal_map_data);
    ClassDB::bind_method(D_METHOD("get_weight_map_data"), &TerrainData::get_weight_map_data);
    ClassDB::bind_method(D_METHOD("get_terrain_size"), &TerrainData::get_terrain_size);
    ClassDB::bind_method(D_METHOD("get_terrain_scale"), &TerrainData::get_terrain_scale);
    ClassDB::bind_method(D_METHOD("get_terrain_world_size"), &TerrainData::get_terrain_world_size);
    ClassDB::bind_method(D_METHOD("is_point_inside", "world_pos"), &TerrainData::is_point_inside);
    ClassDB::bind_method(D_METHOD("mark_dirty"), &TerrainData::mark_dirty);
    ClassDB::bind_method(D_METHOD("clear_dirty"), &TerrainData::clear_dirty);
    ClassDB::bind_method(D_METHOD("get_is_dirty"), &TerrainData::get_is_dirty);
    ClassDB::bind_method(D_METHOD("apply_deformation", "world_center", "radius", "depth", "add"), &TerrainData::apply_deformation);
    ClassDB::bind_method(D_METHOD("calculate_volume_in_region", "world_center", "radius"), &TerrainData::calculate_volume_in_region);
}

TerrainData::TerrainData() : terrain_scale(1.0f), min_height(0.0f), max_height(100.0f), is_dirty(false) {
    heightmap.resize(TERRAIN_SIZE_SQ);
    original_heightmap.resize(TERRAIN_SIZE_SQ);
    normal_map.resize(TERRAIN_SIZE_SQ * 3);
    slope_map.resize(TERRAIN_SIZE_SQ);
    weight_map.resize(TERRAIN_SIZE_SQ * 4);

    for (int i = 0; i < TERRAIN_SIZE_SQ; i++) {
        heightmap[i] = 0.0f;
        original_heightmap[i] = 0.0f;
        slope_map[i] = 0.0f;
    }
}

TerrainData::~TerrainData() {}

void TerrainData::initialize(float p_scale, float p_min_height, float p_max_height) {
    terrain_scale = p_scale;
    min_height = p_min_height;
    max_height = p_max_height;
}

void TerrainData::generate_perlin_terrain(int p_seed, float p_frequency, int p_octaves, float p_persistence) {
    std::mt19937 rng(p_seed);
    std::uniform_real_distribution<float> dist(0.0f, 1.0f);

    const int grid_size = 256;
    std::vector<float> perm(grid_size * 2);
    for (int i = 0; i < grid_size; i++) {
        perm[i] = dist(rng);
    }
    for (int i = grid_size; i < grid_size * 2; i++) {
        perm[i] = perm[i - grid_size];
    }

    auto fade = [](float t) -> float {
        return t * t * t * (t * (t * 6 - 15) + 10);
    };

    auto lerp = [](float a, float b, float t) -> float {
        return a + t * (b - a);
    };

    auto grad = [&](int hash, float x, float y) -> float {
        int h = hash & 7;
        float u = (h < 4) ? x : y;
        float v = (h < 4) ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2.0f * v : 2.0f * v);
    };

    auto noise2d = [&](float x, float y) -> float {
        int xi = (int)x & 255;
        int yi = (int)y & 255;
        float xf = x - (int)x;
        float yf = y - (int)y;

        float u = fade(xf);
        float v = fade(yf);

        int aa = (int)(perm[xi] * 255) + (int)(perm[yi] * 255);
        int ab = (int)(perm[xi] * 255) + (int)(perm[yi + 1] * 255);
        int ba = (int)(perm[xi + 1] * 255) + (int)(perm[yi] * 255);
        int bb = (int)(perm[xi + 1] * 255) + (int)(perm[yi + 1] * 255);

        float x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
        float x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
        return lerp(x1, x2, v);
    };

    float height_range = max_height - min_height;

    for (int z = 0; z < TERRAIN_SIZE; z++) {
        for (int x = 0; x < TERRAIN_SIZE; x++) {
            float nx = (float)x * p_frequency / TERRAIN_SIZE;
            float ny = (float)z * p_frequency / TERRAIN_SIZE;

            float amplitude = 1.0f;
            float frequency = 1.0f;
            float noise_value = 0.0f;
            float max_amplitude = 0.0f;

            for (int o = 0; o < p_octaves; o++) {
                noise_value += noise2d(nx * frequency, ny * frequency) * amplitude;
                max_amplitude += amplitude;
                amplitude *= p_persistence;
                frequency *= 2.0f;
            }

            noise_value = (noise_value / max_amplitude + 1.0f) * 0.5f;
            float height = min_height + noise_value * height_range;

            heightmap[z * TERRAIN_SIZE + x] = height;
            original_heightmap[z * TERRAIN_SIZE + x] = height;
        }
    }

    update_normals();
    update_slopes();
    update_weight_map();
    mark_dirty();
}

void TerrainData::reset_to_original() {
    std::lock_guard<std::mutex> lock(data_mutex);
    for (int i = 0; i < TERRAIN_SIZE_SQ; i++) {
        heightmap[i] = original_heightmap[i];
    }
    update_normals();
    update_slopes();
    update_weight_map();
    mark_dirty();
}

float TerrainData::get_height(int p_x, int p_z) const {
    if (p_x < 0 || p_x >= TERRAIN_SIZE || p_z < 0 || p_z >= TERRAIN_SIZE) {
        return 0.0f;
    }
    return heightmap[p_z * TERRAIN_SIZE + p_x];
}

void TerrainData::set_height(int p_x, int p_z, float p_value) {
    if (p_x < 0 || p_x >= TERRAIN_SIZE || p_z < 0 || p_z >= TERRAIN_SIZE) {
        return;
    }
    std::lock_guard<std::mutex> lock(data_mutex);
    heightmap[p_z * TERRAIN_SIZE + p_x] = p_value;
}

float TerrainData::get_safe_height(int p_x, int p_z) const {
    p_x = std::clamp(p_x, 0, TERRAIN_SIZE - 1);
    p_z = std::clamp(p_z, 0, TERRAIN_SIZE - 1);
    return heightmap[p_z * TERRAIN_SIZE + p_x];
}

Vector3 TerrainData::get_world_position(int p_x, int p_z) const {
    float world_x = (p_x - TERRAIN_SIZE * 0.5f) * terrain_scale;
    float world_z = (p_z - TERRAIN_SIZE * 0.5f) * terrain_scale;
    float world_y = get_height(p_x, p_z);
    return Vector3(world_x, world_y, world_z);
}

Vector2 TerrainData::get_terrain_coords(const Vector3& p_world_pos) const {
    float tx = p_world_pos.x / terrain_scale + TERRAIN_SIZE * 0.5f;
    float tz = p_world_pos.z / terrain_scale + TERRAIN_SIZE * 0.5f;
    return Vector2(tx, tz);
}

void TerrainData::update_normals() {
    update_normals_region(0, 0, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
}

void TerrainData::update_normals_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z) {
    p_min_x = std::max(0, p_min_x);
    p_min_z = std::max(0, p_min_z);
    p_max_x = std::min(TERRAIN_SIZE - 1, p_max_x);
    p_max_z = std::min(TERRAIN_SIZE - 1, p_max_z);

    const float dx = terrain_scale;
    const float dz = terrain_scale;
    const float scale = 0.125f / dx;

    for (int z = p_min_z; z <= p_max_z; z++) {
        for (int x = p_min_x; x <= p_max_x; x++) {
            float h00 = get_safe_height(x - 1, z - 1);
            float h10 = get_safe_height(x, z - 1);
            float h20 = get_safe_height(x + 1, z - 1);
            float h01 = get_safe_height(x - 1, z);
            float h21 = get_safe_height(x + 1, z);
            float h02 = get_safe_height(x - 1, z + 1);
            float h12 = get_safe_height(x, z + 1);
            float h22 = get_safe_height(x + 1, z + 1);

            float sobel_x = (h00 + 2.0f * h01 + h02) - (h20 + 2.0f * h21 + h22);
            float sobel_z = (h00 + 2.0f * h10 + h20) - (h02 + 2.0f * h12 + h22);

            float nx = sobel_x * scale;
            float nz = sobel_z * scale;
            float ny = 1.0f;

            float len = sqrtf(nx * nx + ny * ny + nz * nz);
            if (len > 0.0f) {
                nx /= len;
                ny /= len;
                nz /= len;
            }

            int idx = (z * TERRAIN_SIZE + x) * 3;
            normal_map[idx] = nx;
            normal_map[idx + 1] = ny;
            normal_map[idx + 2] = nz;
        }
    }
}

void TerrainData::update_slopes() {
    update_slopes_region(0, 0, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
}

void TerrainData::update_slopes_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z) {
    p_min_x = std::max(0, p_min_x);
    p_min_z = std::max(0, p_min_z);
    p_max_x = std::min(TERRAIN_SIZE - 1, p_max_x);
    p_max_z = std::min(TERRAIN_SIZE - 1, p_max_z);

    for (int z = p_min_z; z <= p_max_z; z++) {
        for (int x = p_min_x; x <= p_max_x; x++) {
            int idx = (z * TERRAIN_SIZE + x) * 3;
            Vector3 normal(normal_map[idx], normal_map[idx + 1], normal_map[idx + 2]);
            float slope = 1.0f - normal.y;
            slope = std::clamp(slope, 0.0f, 1.0f);
            slope_map[z * TERRAIN_SIZE + x] = slope;
        }
    }
}

void TerrainData::update_weight_map() {
    update_weight_map_region(0, 0, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
}

void TerrainData::update_weight_map_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z) {
    p_min_x = std::max(0, p_min_x);
    p_min_z = std::max(0, p_min_z);
    p_max_x = std::min(TERRAIN_SIZE - 1, p_max_x);
    p_max_z = std::min(TERRAIN_SIZE - 1, p_max_z);

    float height_range = max_height - min_height;
    if (height_range <= 0.0f) {
        height_range = 1.0f;
    }

    for (int z = p_min_z; z <= p_max_z; z++) {
        for (int x = p_min_x; x <= p_max_x; x++) {
            int idx = z * TERRAIN_SIZE + x;
            float height = heightmap[idx];
            float normalized_height = (height - min_height) / height_range;
            normalized_height = std::clamp(normalized_height, 0.0f, 1.0f);
            float slope = slope_map[idx];

            float grass_weight = 0.0f;
            float rock_weight = 0.0f;
            float snow_weight = 0.0f;
            float sand_weight = 0.0f;

            float rock_threshold = 0.4f;
            if (slope > rock_threshold) {
                rock_weight = (slope - rock_threshold) / (1.0f - rock_threshold);
            }

            float snow_threshold = 0.7f;
            if (normalized_height > snow_threshold) {
                snow_weight = (normalized_height - snow_threshold) / (1.0f - snow_threshold);
                snow_weight *= (1.0f - slope * 0.5f);
            }

            float sand_threshold = 0.2f;
            if (normalized_height < sand_threshold) {
                sand_weight = (sand_threshold - normalized_height) / sand_threshold;
            }

            grass_weight = 1.0f - rock_weight - snow_weight - sand_weight;
            grass_weight = std::max(0.0f, grass_weight);

            float total = grass_weight + rock_weight + snow_weight + sand_weight;
            if (total > 0.001f) {
                float inv_total = 1.0f / total;
                grass_weight *= inv_total;
                rock_weight *= inv_total;
                snow_weight *= inv_total;
                sand_weight *= inv_total;
            }

            int w_idx = idx * 4;
            weight_map[w_idx] = grass_weight;
            weight_map[w_idx + 1] = rock_weight;
            weight_map[w_idx + 2] = snow_weight;
            weight_map[w_idx + 3] = sand_weight;
        }
    }
}

void TerrainData::smooth_region(int p_min_x, int p_min_z, int p_max_x, int p_max_z, float p_strength) {
    p_min_x = std::max(1, p_min_x);
    p_min_z = std::max(1, p_min_z);
    p_max_x = std::min(TERRAIN_SIZE - 2, p_max_x);
    p_max_z = std::min(TERRAIN_SIZE - 2, p_max_z);

    if (p_strength <= 0.0f || p_min_x > p_max_x || p_min_z > p_max_z) {
        return;
    }

    std::vector<float> temp_heights((p_max_x - p_min_x + 1) * (p_max_z - p_min_z + 1));
    int temp_idx = 0;

    for (int z = p_min_z; z <= p_max_z; z++) {
        for (int x = p_min_x; x <= p_max_x; x++) {
            float avg = 0.0f;
            float count = 0.0f;

            for (int dz = -1; dz <= 1; dz++) {
                for (int dx = -1; dx <= 1; dx++) {
                    avg += heightmap[(z + dz) * TERRAIN_SIZE + (x + dx)];
                    count += 1.0f;
                }
            }

            avg /= count;
            temp_heights[temp_idx++] = avg;
        }
    }

    temp_idx = 0;
    for (int z = p_min_z; z <= p_max_z; z++) {
        for (int x = p_min_x; x <= p_max_x; x++) {
            float original = heightmap[z * TERRAIN_SIZE + x];
            float smoothed = temp_heights[temp_idx++];
            heightmap[z * TERRAIN_SIZE + x] = original * (1.0f - p_strength) + smoothed * p_strength;
        }
    }
}

Vector3 TerrainData::get_normal(int p_x, int p_z) const {
    int idx = (p_z * TERRAIN_SIZE + p_x) * 3;
    return Vector3(normal_map[idx], normal_map[idx + 1], normal_map[idx + 2]);
}

float TerrainData::get_slope(int p_x, int p_z) const {
    return slope_map[p_z * TERRAIN_SIZE + p_x];
}

Color TerrainData::get_weight(int p_x, int p_z) const {
    int idx = (p_z * TERRAIN_SIZE + p_x) * 4;
    return Color(weight_map[idx], weight_map[idx + 1], weight_map[idx + 2], weight_map[idx + 3]);
}

PackedFloat32Array TerrainData::get_heightmap_data() const {
    return heightmap;
}

PackedFloat32Array TerrainData::get_normal_map_data() const {
    return normal_map;
}

PackedFloat32Array TerrainData::get_weight_map_data() const {
    return weight_map;
}

int TerrainData::get_terrain_size() const {
    return TERRAIN_SIZE;
}

float TerrainData::get_terrain_scale() const {
    return terrain_scale;
}

Vector3 TerrainData::get_terrain_world_size() const {
    float world_size = TERRAIN_SIZE * terrain_scale;
    return Vector3(world_size, max_height - min_height, world_size);
}

bool TerrainData::is_point_inside(const Vector3& p_world_pos) const {
    Vector2 coords = get_terrain_coords(p_world_pos);
    return coords.x >= 0 && coords.x < TERRAIN_SIZE && coords.y >= 0 && coords.y < TERRAIN_SIZE;
}

void TerrainData::mark_dirty() {
    is_dirty = true;
}

void TerrainData::clear_dirty() {
    is_dirty = false;
}

bool TerrainData::get_is_dirty() const {
    return is_dirty;
}

void TerrainData::apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add) {
    std::lock_guard<std::mutex> lock(data_mutex);

    Vector2 center_coords = get_terrain_coords(p_world_center);
    int radius_cells = (int)(p_radius / terrain_scale) + 1;

    int min_x = std::max(0, (int)center_coords.x - radius_cells);
    int max_x = std::min(TERRAIN_SIZE - 1, (int)center_coords.x + radius_cells);
    int min_z = std::max(0, (int)center_coords.y - radius_cells);
    int max_z = std::min(TERRAIN_SIZE - 1, (int)center_coords.y + radius_cells);

    float radius_sq = p_radius * p_radius;
    float half_world_size = TERRAIN_SIZE * terrain_scale * 0.5f;

    for (int z = min_z; z <= max_z; z++) {
        for (int x = min_x; x <= max_x; x++) {
            float world_x = (x - TERRAIN_SIZE * 0.5f) * terrain_scale;
            float world_z = (z - TERRAIN_SIZE * 0.5f) * terrain_scale;

            float dx = world_x - p_world_center.x;
            float dz = world_z - p_world_center.z;
            float dist_sq = dx * dx + dz * dz;

            if (dist_sq < radius_sq) {
                float dist = sqrtf(dist_sq);
                float normalized_dist = dist / p_radius;

                float falloff = 1.0f - normalized_dist;
                falloff = falloff * falloff * (3.0f - 2.0f * falloff);

                float deformation = p_depth * falloff;
                int idx = z * TERRAIN_SIZE + x;

                if (p_add) {
                    heightmap[idx] += deformation;
                } else {
                    heightmap[idx] -= deformation;
                }

                heightmap[idx] = std::clamp(heightmap[idx], min_height, max_height);
            }
        }
    }

    int normal_border = 2;
    int norm_min_x = std::max(0, min_x - normal_border);
    int norm_max_x = std::min(TERRAIN_SIZE - 1, max_x + normal_border);
    int norm_min_z = std::max(0, min_z - normal_border);
    int norm_max_z = std::min(TERRAIN_SIZE - 1, max_z + normal_border);

    smooth_region(norm_min_x, norm_min_z, norm_max_x, norm_max_z, 0.3f);

    update_normals_region(norm_min_x, norm_min_z, norm_max_x, norm_max_z);
    update_slopes_region(norm_min_x, norm_min_z, norm_max_x, norm_max_z);
    update_weight_map_region(norm_min_x, norm_min_z, norm_max_x, norm_max_z);

    mark_dirty();
}

double TerrainData::calculate_volume_in_region(const Vector3& p_world_center, float p_radius) const {
    Vector2 center_coords = get_terrain_coords(p_world_center);
    int radius_cells = (int)(p_radius / terrain_scale) + 1;

    int min_x = std::max(0, (int)center_coords.x - radius_cells);
    int max_x = std::min(TERRAIN_SIZE - 1, (int)center_coords.x + radius_cells);
    int min_z = std::max(0, (int)center_coords.y - radius_cells);
    int max_z = std::min(TERRAIN_SIZE - 1, (int)center_coords.y + radius_cells);

    float radius_sq = p_radius * p_radius;
    double total_volume = 0.0;
    double cell_area = (double)terrain_scale * terrain_scale;

    for (int z = min_z; z <= max_z; z++) {
        for (int x = min_x; x <= max_x; x++) {
            Vector3 world_pos = get_world_position(x, z);
            Vector2 offset = Vector2(world_pos.x - p_world_center.x, world_pos.z - p_world_center.z);
            float dist_sq = offset.x * offset.x + offset.y * offset.y;

            if (dist_sq < radius_sq) {
                int idx = z * TERRAIN_SIZE + x;
                float height_diff = heightmap[idx] - original_heightmap[idx];
                total_volume += (double)height_diff * cell_area;
            }
        }
    }

    return total_volume;
}
