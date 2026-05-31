#include "terrain_world.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include <godot_cpp/classes/engine.hpp>
#include <chrono>
#include <random>
#include <cmath>
#include <algorithm>

namespace godot {

void TerrainWorld::_bind_methods() {
    ClassDB::bind_method(D_METHOD("generate_world"), &TerrainWorld::generate_world);
    ClassDB::bind_method(D_METHOD("regenerate_world", "seed"), &TerrainWorld::regenerate_world);
    ClassDB::bind_method(D_METHOD("reset_world"), &TerrainWorld::reset_world);
    ClassDB::bind_method(D_METHOD("load_chunk", "chunk_x", "chunk_z"), &TerrainWorld::load_chunk);
    ClassDB::bind_method(D_METHOD("unload_chunk", "chunk_x", "chunk_z"), &TerrainWorld::unload_chunk);
    ClassDB::bind_method(D_METHOD("update_loaded_chunks"), &TerrainWorld::update_loaded_chunks);
    ClassDB::bind_method(D_METHOD("get_chunk", "chunk_x", "chunk_z"), &TerrainWorld::get_chunk);
    ClassDB::bind_method(D_METHOD("get_chunk_at_world", "world_pos"), &TerrainWorld::get_chunk_at_world);
    ClassDB::bind_method(D_METHOD("get_height_at", "world_pos"), &TerrainWorld::get_height_at);
    ClassDB::bind_method(D_METHOD("get_normal_at", "world_pos"), &TerrainWorld::get_normal_at);
    ClassDB::bind_method(D_METHOD("apply_deformation", "world_center", "radius", "depth", "add"), &TerrainWorld::apply_deformation);
    ClassDB::bind_method(D_METHOD("get_global_heightmap"), &TerrainWorld::get_global_heightmap);
    ClassDB::bind_method(D_METHOD("set_player", "path"), &TerrainWorld::set_player);
    ClassDB::bind_method(D_METHOD("get_player"), &TerrainWorld::get_player);
    ClassDB::bind_method(D_METHOD("set_view_distance", "distance"), &TerrainWorld::set_view_distance);
    ClassDB::bind_method(D_METHOD("get_view_distance"), &TerrainWorld::get_view_distance);
    ClassDB::bind_method(D_METHOD("set_terrain_scale", "scale"), &TerrainWorld::set_terrain_scale);
    ClassDB::bind_method(D_METHOD("get_terrain_scale"), &TerrainWorld::get_terrain_scale);
    ClassDB::bind_method(D_METHOD("set_max_loaded_chunks", "max"), &TerrainWorld::set_max_loaded_chunks);
    ClassDB::bind_method(D_METHOD("get_max_loaded_chunks"), &TerrainWorld::get_max_loaded_chunks);
    ClassDB::bind_method(D_METHOD("get_chunk_coords_from_world", "world_pos"), &TerrainWorld::get_chunk_coords_from_world);
    ClassDB::bind_method(D_METHOD("get_loaded_chunk_count"), &TerrainWorld::get_loaded_chunk_count);
    ClassDB::bind_method(D_METHOD("get_memory_usage_mb"), &TerrainWorld::get_memory_usage_mb);
    ClassDB::bind_method(D_METHOD("set_streaming_enabled", "enabled"), &TerrainWorld::set_streaming_enabled);
    ClassDB::bind_method(D_METHOD("get_streaming_enabled"), &TerrainWorld::get_streaming_enabled);
    ClassDB::bind_method(D_METHOD("set_seed", "seed"), &TerrainWorld::set_seed);
    ClassDB::bind_method(D_METHOD("get_seed"), &TerrainWorld::get_seed);
    ClassDB::bind_method(D_METHOD("set_noise_frequency", "freq"), &TerrainWorld::set_noise_frequency);
    ClassDB::bind_method(D_METHOD("get_noise_frequency"), &TerrainWorld::get_noise_frequency);
    ClassDB::bind_method(D_METHOD("set_noise_octaves", "oct"), &TerrainWorld::set_noise_octaves);
    ClassDB::bind_method(D_METHOD("get_noise_octaves"), &TerrainWorld::get_noise_octaves);
    ClassDB::bind_method(D_METHOD("set_noise_persistence", "pers"), &TerrainWorld::set_noise_persistence);
    ClassDB::bind_method(D_METHOD("get_noise_persistence"), &TerrainWorld::get_noise_persistence);

    ADD_PROPERTY(PropertyInfo(Variant::NODE_PATH, "player"), "set_player", "get_player");
    ADD_PROPERTY(PropertyInfo(Variant::INT, "view_distance", PROPERTY_HINT_RANGE, "1,5,1"), "set_view_distance", "get_view_distance");
    ADD_PROPERTY(PropertyInfo(Variant::INT, "max_loaded_chunks", PROPERTY_HINT_RANGE, "1,64,1"), "set_max_loaded_chunks", "get_max_loaded_chunks");
    ADD_PROPERTY(PropertyInfo(Variant::FLOAT, "terrain_scale", PROPERTY_HINT_RANGE, "0.1,10.0,0.1"), "set_terrain_scale", "get_terrain_scale");
    ADD_PROPERTY(PropertyInfo(Variant::BOOL, "streaming_enabled"), "set_streaming_enabled", "get_streaming_enabled");
    ADD_PROPERTY(PropertyInfo(Variant::INT, "seed"), "set_seed", "get_seed");
}

TerrainWorld::TerrainWorld()
    : player_node(nullptr)
    , terrain_scale(1.0f)
    , min_height(0.0f)
    , max_height(100.0f)
    , view_distance(VIEW_DISTANCE)
    , max_loaded_chunks(16)
    , current_center_x(-1)
    , current_center_z(-1)
    , streaming_enabled(true)
    , generate_on_start(true)
    , seed(42)
    , noise_frequency(4.0f)
    , noise_octaves(6)
    , noise_persistence(0.5f)
    , frame_counter(0)
    , memory_usage_mb(0.0f) {
    global_heightmap.resize(WORLD_SIZE * WORLD_SIZE);
    original_heightmap.resize(WORLD_SIZE * WORLD_SIZE);
}

TerrainWorld::~TerrainWorld() {
    std::lock_guard<std::mutex> lock(chunk_mutex);
    for (auto& pair : chunks) {
        if (pair.second) {
            pair.second->queue_free();
        }
    }
    chunks.clear();
}

void TerrainWorld::_ready() {
    if (Engine::get_singleton()->is_editor_hint()) {
        return;
    }

    if (generate_on_start) {
        generate_world();
    }

    if (!player_path.is_empty()) {
        Node* node = get_node_or_null(player_path);
        if (node) {
            player_node = dynamic_cast<Node3D*>(node);
        }
    }

    current_center_x = -1;
    current_center_z = -1;
}

void TerrainWorld::_process(double p_delta) {
    if (Engine::get_singleton()->is_editor_hint()) {
        return;
    }

    frame_counter++;

    if (streaming_enabled) {
        update_player_tracking();
        update_loaded_chunks();
    }

    if (frame_counter % 30 == 0) {
        update_memory_usage();
    }
}

void TerrainWorld::generate_world() {
    generate_global_heightmap();
    TerrainChunk::set_global_heightmap(&global_heightmap, WORLD_CHUNKS, terrain_scale);

    if (!streaming_enabled) {
        for (int z = 0; z < WORLD_CHUNKS; z++) {
            for (int x = 0; x < WORLD_CHUNKS; x++) {
                load_chunk(x, z);
            }
        }
    } else {
        update_loaded_chunks();
    }

    UtilityFunctions::print("[TerrainWorld] 世界生成完成，尺寸: ", WORLD_SIZE, "x", WORLD_SIZE,
                           " (", WORLD_CHUNKS, "x", WORLD_CHUNKS, " 区块)");
}

void TerrainWorld::regenerate_world(int p_seed) {
    seed = p_seed;

    std::lock_guard<std::mutex> lock(chunk_mutex);
    for (auto& pair : chunks) {
        if (pair.second) {
            pair.second->queue_free();
        }
    }
    chunks.clear();
    lru_list.clear();
    last_access_time.clear();

    generate_world();
}

void TerrainWorld::reset_world() {
    for (int i = 0; i < WORLD_SIZE * WORLD_SIZE; i++) {
        global_heightmap[i] = original_heightmap[i];
    }

    std::lock_guard<std::mutex> lock(chunk_mutex);
    for (auto& pair : chunks) {
        if (pair.second) {
            pair.second->generate_from_global(global_heightmap, WORLD_SIZE);
            if (pair.second->get_is_loaded()) {
                pair.second->rebuild_mesh();
            }
        }
    }

    UtilityFunctions::print("[TerrainWorld] 世界已重置");
}

void TerrainWorld::generate_global_heightmap() {
    std::mt19937 rng(seed);
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

    for (int z = 0; z < WORLD_SIZE; z++) {
        for (int x = 0; x < WORLD_SIZE; x++) {
            float nx = (float)x * noise_frequency / WORLD_SIZE;
            float ny = (float)z * noise_frequency / WORLD_SIZE;

            float amplitude = 1.0f;
            float frequency = 1.0f;
            float noise_value = 0.0f;
            float max_amplitude = 0.0f;

            for (int o = 0; o < noise_octaves; o++) {
                noise_value += noise2d(nx * frequency, ny * frequency) * amplitude;
                max_amplitude += amplitude;
                amplitude *= noise_persistence;
                frequency *= 2.0f;
            }

            noise_value = (noise_value / max_amplitude + 1.0f) * 0.5f;
            float height = min_height + noise_value * height_range;

            global_heightmap[z * WORLD_SIZE + x] = height;
            original_heightmap[z * WORLD_SIZE + x] = height;
        }
    }
}

void TerrainWorld::load_chunk(int p_chunk_x, int p_chunk_z) {
    if (!is_valid_chunk(p_chunk_x, p_chunk_z)) {
        return;
    }

    ChunkKey key{p_chunk_x, p_chunk_z};

    std::lock_guard<std::mutex> lock(chunk_mutex);
    auto it = chunks.find(key);
    if (it != chunks.end() && it->second && it->second->get_is_loaded()) {
        touch_chunk(key);
        return;
    }

    TerrainChunk* chunk = nullptr;
    if (it == chunks.end()) {
        chunk = memnew(TerrainChunk);
        chunk->setup(p_chunk_x, p_chunk_z, terrain_scale, min_height, max_height);
        chunks[key] = chunk;
        add_child(chunk);
    } else {
        chunk = it->second;
    }

    chunk->generate_from_global(global_heightmap, WORLD_SIZE);
    chunk->load();
    touch_chunk(key);

    if (chunks.size() > max_loaded_chunks) {
        evict_old_chunks();
    }
}

void TerrainWorld::unload_chunk(int p_chunk_x, int p_chunk_z) {
    ChunkKey key{p_chunk_x, p_chunk_z};

    std::lock_guard<std::mutex> lock(chunk_mutex);
    auto it = chunks.find(key);
    if (it != chunks.end() && it->second) {
        it->second->unload();
    }
}

void TerrainWorld::update_loaded_chunks() {
    if (!player_node) {
        return;
    }

    Vector3 player_pos = player_node->get_global_position();
    Vector2 chunk_coords = get_chunk_coords_from_world(player_pos);

    int center_x = (int)chunk_coords.x;
    int center_z = (int)chunk_coords.y;

    if (center_x == current_center_x && center_z == current_center_z) {
        return;
    }

    current_center_x = center_x;
    current_center_z = center_z;

    std::unordered_set<ChunkKey, ChunkKeyHash> needed_chunks;

    for (int dz = -view_distance; dz <= view_distance; dz++) {
        for (int dx = -view_distance; dx <= view_distance; dx++) {
            int cx = center_x + dx;
            int cz = center_z + dz;
            if (is_valid_chunk(cx, cz)) {
                ChunkKey key{cx, cz};
                needed_chunks.insert(key);
                load_chunk(cx, cz);
            }
        }
    }

    std::vector<ChunkKey> to_unload;
    {
        std::lock_guard<std::mutex> lock(chunk_mutex);
        for (const auto& pair : chunks) {
            if (pair.second && pair.second->get_is_loaded()) {
                if (needed_chunks.find(pair.first) == needed_chunks.end()) {
                    to_unload.push_back(pair.first);
                }
            }
        }
    }

    for (const auto& key : to_unload) {
        unload_chunk(key.x, key.z);
    }
}

TerrainChunk* TerrainWorld::get_chunk(int p_chunk_x, int p_chunk_z) const {
    if (!is_valid_chunk(p_chunk_x, p_chunk_z)) {
        return nullptr;
    }

    ChunkKey key{p_chunk_x, p_chunk_z};
    std::lock_guard<std::mutex> lock(chunk_mutex);
    auto it = chunks.find(key);
    if (it != chunks.end()) {
        return it->second;
    }
    return nullptr;
}

TerrainChunk* TerrainWorld::get_chunk_at_world(const Vector3& p_world_pos) const {
    Vector2 coords = get_chunk_coords_from_world(p_world_pos);
    return get_chunk((int)coords.x, (int)coords.y);
}

float TerrainWorld::get_height_at(const Vector3& p_world_pos) const {
    TerrainChunk* chunk = get_chunk_at_world(p_world_pos);
    if (chunk) {
        return chunk->get_height_world(p_world_pos.x, p_world_pos.z);
    }

    Vector2 coords = get_chunk_coords_from_world(p_world_pos);
    int cx = (int)coords.x;
    int cz = (int)coords.y;
    if (is_valid_chunk(cx, cz)) {
        int gx = (int)((p_world_pos.x / terrain_scale) + WORLD_SIZE * 0.5f);
        int gz = (int)((p_world_pos.z / terrain_scale) + WORLD_SIZE * 0.5f);
        gx = std::clamp(gx, 0, WORLD_SIZE - 1);
        gz = std::clamp(gz, 0, WORLD_SIZE - 1);
        return global_heightmap[gz * WORLD_SIZE + gx];
    }
    return 0.0f;
}

Vector3 TerrainWorld::get_normal_at(const Vector3& p_world_pos) const {
    TerrainChunk* chunk = get_chunk_at_world(p_world_pos);
    if (chunk) {
        return chunk->get_normal_world(p_world_pos.x, p_world_pos.z);
    }
    return Vector3(0, 1, 0);
}

void TerrainWorld::apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add) {
    Vector2 center_coords = get_chunk_coords_from_world(p_world_center);
    int radius_cells = (int)(p_radius / terrain_scale) + 1;
    int chunk_radius = (radius_cells / TerrainChunk::CHUNK_SIZE) + 1;

    int center_x = (int)center_coords.x;
    int center_z = (int)center_coords.y;

    std::vector<TerrainChunk*> affected_chunks;
    {
        std::lock_guard<std::mutex> lock(chunk_mutex);
        for (int dz = -chunk_radius; dz <= chunk_radius; dz++) {
            for (int dx = -chunk_radius; dx <= chunk_radius; dx++) {
                int cx = center_x + dx;
                int cz = center_z + dz;
                if (is_valid_chunk(cx, cz)) {
                    ChunkKey key{cx, cz};
                    auto it = chunks.find(key);
                    if (it != chunks.end() && it->second) {
                        affected_chunks.push_back(it->second);
                    }
                }
            }
        }
    }

    for (TerrainChunk* chunk : affected_chunks) {
        chunk->apply_deformation(p_world_center, p_radius, p_depth, p_add);
    }

    int min_gx = (int)((p_world_center.x - p_radius) / terrain_scale + WORLD_SIZE * 0.5f);
    int max_gx = (int)((p_world_center.x + p_radius) / terrain_scale + WORLD_SIZE * 0.5f);
    int min_gz = (int)((p_world_center.z - p_radius) / terrain_scale + WORLD_SIZE * 0.5f);
    int max_gz = (int)((p_world_center.z + p_radius) / terrain_scale + WORLD_SIZE * 0.5f);

    min_gx = std::max(0, min_gx);
    max_gx = std::min(WORLD_SIZE - 1, max_gx);
    min_gz = std::max(0, min_gz);
    max_gz = std::min(WORLD_SIZE - 1, max_gz);

    float radius_sq = p_radius * p_radius;

    for (int gz = min_gz; gz <= max_gz; gz++) {
        for (int gx = min_gx; gx <= max_gx; gx++) {
            float wx = (gx - WORLD_SIZE * 0.5f) * terrain_scale;
            float wz = (gz - WORLD_SIZE * 0.5f) * terrain_scale;
            float dx = wx - p_world_center.x;
            float dz = wz - p_world_center.z;
            float dist_sq = dx * dx + dz * dz;

            if (dist_sq < radius_sq) {
                float dist = sqrtf(dist_sq);
                float t = dist / p_radius;
                float falloff = 1.0f - t;
                falloff = falloff * falloff * (3.0f - 2.0f * falloff);

                float deformation = p_depth * falloff;
                int idx = gz * WORLD_SIZE + gx;

                if (p_add) {
                    global_heightmap[idx] += deformation;
                } else {
                    global_heightmap[idx] -= deformation;
                }

                global_heightmap[idx] = std::clamp(global_heightmap[idx], min_height, max_height);
            }
        }
    }
}

PackedFloat32Array TerrainWorld::get_global_heightmap() const {
    return global_heightmap;
}

void TerrainWorld::set_player(const NodePath& p_path) {
    player_path = p_path;
    if (is_inside_tree()) {
        Node* node = get_node_or_null(p_path);
        if (node) {
            player_node = dynamic_cast<Node3D*>(node);
        }
    }
}

NodePath TerrainWorld::get_player() const {
    return player_path;
}

void TerrainWorld::set_view_distance(int p_distance) {
    view_distance = std::clamp(p_distance, 1, 5);
}

int TerrainWorld::get_view_distance() const {
    return view_distance;
}

void TerrainWorld::set_terrain_scale(float p_scale) {
    terrain_scale = p_scale;
}

float TerrainWorld::get_terrain_scale() const {
    return terrain_scale;
}

void TerrainWorld::set_max_loaded_chunks(int p_max) {
    max_loaded_chunks = std::clamp(p_max, 1, 64);
}

int TerrainWorld::get_max_loaded_chunks() const {
    return max_loaded_chunks;
}

Vector2 TerrainWorld::get_chunk_coords_from_world(const Vector3& p_world_pos) const {
    float tx = p_world_pos.x / (TerrainChunk::CHUNK_SIZE * terrain_scale) + WORLD_CHUNKS * 0.5f;
    float tz = p_world_pos.z / (TerrainChunk::CHUNK_SIZE * terrain_scale) + WORLD_CHUNKS * 0.5f;
    return Vector2(tx, tz);
}

int TerrainWorld::get_loaded_chunk_count() const {
    int count = 0;
    std::lock_guard<std::mutex> lock(chunk_mutex);
    for (const auto& pair : chunks) {
        if (pair.second && pair.second->get_is_loaded()) {
            count++;
        }
    }
    return count;
}

float TerrainWorld::get_memory_usage_mb() const {
    return memory_usage_mb;
}

void TerrainWorld::set_streaming_enabled(bool p_enabled) {
    streaming_enabled = p_enabled;
}

bool TerrainWorld::get_streaming_enabled() const {
    return streaming_enabled;
}

void TerrainWorld::set_seed(int p_seed) {
    seed = p_seed;
}

int TerrainWorld::get_seed() const {
    return seed;
}

void TerrainWorld::set_noise_frequency(float p_freq) {
    noise_frequency = p_freq;
}

float TerrainWorld::get_noise_frequency() const {
    return noise_frequency;
}

void TerrainWorld::set_noise_octaves(int p_oct) {
    noise_octaves = p_oct;
}

int TerrainWorld::get_noise_octaves() const {
    return noise_octaves;
}

void TerrainWorld::set_noise_persistence(float p_pers) {
    noise_persistence = p_pers;
}

float TerrainWorld::get_noise_persistence() const {
    return noise_persistence;
}

bool TerrainWorld::is_valid_chunk(int p_chunk_x, int p_chunk_z) const {
    return p_chunk_x >= 0 && p_chunk_x < WORLD_CHUNKS && p_chunk_z >= 0 && p_chunk_z < WORLD_CHUNKS;
}

void TerrainWorld::touch_chunk(const ChunkKey& p_key) {
    uint64_t now = frame_counter;
    last_access_time[p_key] = now;

    lru_list.remove(p_key);
    lru_list.push_front(p_key);
}

void TerrainWorld::evict_old_chunks() {
    while (chunks.size() > max_loaded_chunks && !lru_list.empty()) {
        ChunkKey oldest_key = lru_list.back();
        lru_list.pop_back();

        auto it = chunks.find(oldest_key);
        if (it != chunks.end() && it->second) {
            it->second->unload();
        }
    }
}

void TerrainWorld::update_memory_usage() {
    size_t global_mem = sizeof(float) * WORLD_SIZE * WORLD_SIZE * 2;

    size_t chunk_mem = 0;
    int loaded_count = 0;
    {
        std::lock_guard<std::mutex> lock(chunk_mutex);
        for (const auto& pair : chunks) {
            if (pair.second) {
                chunk_mem += sizeof(TerrainChunk);
                chunk_mem += sizeof(float) * TerrainChunk::CHUNK_SIZE_SQ * 9;

                if (pair.second->get_is_loaded()) {
                    loaded_count++;
                    chunk_mem += 1024 * 1024;
                }
            }
        }
    }

    size_t total_bytes = global_mem + chunk_mem;
    memory_usage_mb = (float)total_bytes / (1024.0f * 1024.0f);
}

void TerrainWorld::update_player_tracking() {
    if (!player_node && !player_path.is_empty()) {
        Node* node = get_node_or_null(player_path);
        if (node) {
            player_node = dynamic_cast<Node3D*>(node);
        }
    }
}

}
