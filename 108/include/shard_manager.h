#pragma once

#include <onnxruntime_cxx_api.h>

#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "access_predictor.h"

namespace inference {

struct ShardInfo {
    int32_t shard_id;
    std::string shard_path;
    size_t weight_bytes;
    int32_t num_layers;
    std::string input_name;
    std::vector<int64_t> input_shape;
    std::string output_name;
    std::vector<int64_t> output_shape;
};

struct LoadedShard {
    int32_t shard_id;
    Ort::Session session;
    std::vector<std::string> input_names_str;
    std::vector<std::string> output_names_str;
    std::vector<const char*> input_names;
    std::vector<const char*> output_names;
    bool in_use;
    std::chrono::steady_clock::time_point last_used;
};

class ShardManager {
public:
    ShardManager(const std::string& model_dir,
                 Ort::Env& env,
                 size_t max_memory_bytes = 4ULL << 30,
                 int32_t intra_threads = 1,
                 bool use_cuda = false);
    ~ShardManager();

    ShardManager(const ShardManager&) = delete;
    ShardManager& operator=(const ShardManager&) = delete;

    bool load_shard(int32_t shard_id);
    void unload_shard(int32_t shard_id);

    LoadedShard* acquire_shard(int32_t shard_id);
    void release_shard(int32_t shard_id);

    void preload_predicted(int32_t current_shard_id);

    void set_max_memory(size_t max_bytes);
    size_t total_loaded_bytes() const;
    size_t num_loaded_shards() const;

    const std::vector<ShardInfo>& get_shard_infos() const {
        return shard_infos_;
    }

    AccessPatternPredictor& predictor() { return predictor_; }

    bool load_shard_manifest(const std::string& manifest_path);

private:
    size_t estimate_shard_memory(int32_t shard_id) const;
    Ort::SessionOptions create_session_options();

    Ort::Env& env_;
    std::string model_dir_;
    size_t max_memory_bytes_;
    int32_t intra_threads_;
    bool use_cuda_;

    std::vector<ShardInfo> shard_infos_;
    std::unordered_map<int32_t, std::unique_ptr<LoadedShard>> loaded_shards_;
    std::unordered_map<int32_t, size_t> shard_memory_estimate_;

    AccessPatternPredictor predictor_;

    mutable std::mutex mutex_;
    Ort::MemoryInfo memory_info_;
};

}  // namespace inference
