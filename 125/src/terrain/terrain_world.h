#ifndef TERRAIN_WORLD_H
#define TERRAIN_WORLD_H

#include <godot_cpp/classes/node3d.hpp>
#include <godot_cpp/classes/camera3d.hpp>
#include <godot_cpp/variant/packed_float32_array.hpp>
#include <godot_cpp/variant/vector2.hpp>
#include <godot_cpp/variant/vector3.hpp>
#include "terrain_chunk.h"
#include <unordered_map>
#include <unordered_set>
#include <list>
#include <mutex>
#include <memory>

namespace godot {

struct ChunkKey {
    int x;
    int z;

    bool operator==(const ChunkKey& other) const {
        return x == other.x && z == other.z;
    }
};

struct ChunkKeyHash {
    size_t operator()(const ChunkKey& k) const {
        return (size_t)k.x * 73856093 ^ (size_t)k.z * 19349663;
    }
};

class TerrainWorld : public Node3D {
    GDCLASS(TerrainWorld, Node3D)

public:
    static constexpr int WORLD_CHUNKS = 8;
    static constexpr int WORLD_SIZE = WORLD_CHUNKS * TerrainChunk::CHUNK_SIZE;
    static constexpr int VIEW_DISTANCE = 2;

private:
    PackedFloat32Array global_heightmap;
    PackedFloat32Array original_heightmap;

    std::unordered_map<ChunkKey, TerrainChunk*, ChunkKeyHash> chunks;
    std::unordered_map<ChunkKey, uint64_t, ChunkKeyHash> last_access_time;
    std::list<ChunkKey> lru_list;

    Node3D* player_node;
    NodePath player_path;

    float terrain_scale;
    float min_height;
    float max_height;

    int view_distance;
    int max_loaded_chunks;

    int current_center_x;
    int current_center_z;

    bool streaming_enabled;
    bool generate_on_start;

    int seed;
    float noise_frequency;
    int noise_octaves;
    float noise_persistence;

    mutable std::mutex chunk_mutex;

    uint64_t frame_counter;
    float memory_usage_mb;

protected:
    static void _bind_methods();

public:
    TerrainWorld();
    ~TerrainWorld();

    void _ready() override;
    void _process(double p_delta) override;

    void generate_world();
    void regenerate_world(int p_seed);
    void reset_world();

    void load_chunk(int p_chunk_x, int p_chunk_z);
    void unload_chunk(int p_chunk_x, int p_chunk_z);
    void update_loaded_chunks();

    TerrainChunk* get_chunk(int p_chunk_x, int p_chunk_z) const;
    TerrainChunk* get_chunk_at_world(const Vector3& p_world_pos) const;

    float get_height_at(const Vector3& p_world_pos) const;
    Vector3 get_normal_at(const Vector3& p_world_pos) const;

    void apply_deformation(const Vector3& p_world_center, float p_radius, float p_depth, bool p_add);

    PackedFloat32Array get_global_heightmap() const;

    void set_player(const NodePath& p_path);
    NodePath get_player() const;

    void set_view_distance(int p_distance);
    int get_view_distance() const;

    void set_terrain_scale(float p_scale);
    float get_terrain_scale() const;

    void set_max_loaded_chunks(int p_max);
    int get_max_loaded_chunks() const;

    Vector2 get_chunk_coords_from_world(const Vector3& p_world_pos) const;

    int get_loaded_chunk_count() const;
    float get_memory_usage_mb() const;

    void set_streaming_enabled(bool p_enabled);
    bool get_streaming_enabled() const;

    void set_seed(int p_seed);
    int get_seed() const;

    void set_noise_frequency(float p_freq);
    float get_noise_frequency() const;

    void set_noise_octaves(int p_oct);
    int get_noise_octaves() const;

    void set_noise_persistence(float p_pers);
    float get_noise_persistence() const;

private:
    void generate_global_heightmap();
    bool is_valid_chunk(int p_chunk_x, int p_chunk_z) const;
    void touch_chunk(const ChunkKey& p_key);
    void evict_old_chunks();
    void update_memory_usage();
    void update_player_tracking();
};

}

#endif
