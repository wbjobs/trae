#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace inference {

struct ShardManifestEntry {
    int32_t shard_id;
    std::string filename;
    size_t weight_bytes;
    int32_t num_layers;
    std::string input_name;
    std::string output_name;
};

class ModelSharder {
public:
    static bool shard_model(const std::string& model_path,
                            const std::string& output_dir,
                            int32_t layers_per_shard = 10,
                            size_t min_shard_bytes = 128ULL << 20);

    static bool write_manifest(const std::string& output_dir,
                               const std::vector<ShardManifestEntry>& entries);

private:
    static std::vector<std::vector<std::string>> group_nodes_by_layers(
        const void* model_proto, int32_t layers_per_shard);

    static size_t estimate_node_weight(const void* node_proto);

    static std::string extract_node_name(const void* node_proto);
};

}  // namespace inference
