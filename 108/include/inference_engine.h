#pragma once

#include <onnxruntime_cxx_api.h>

#include <chrono>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "buffer_cache.h"
#include "shard_manager.h"

namespace inference {

struct ModelInfo {
    std::string model_path;
    std::string input_name;
    std::vector<int64_t> input_shape;
    std::string output_name;
    std::vector<int64_t> output_shape;
    bool supports_fp16;
    bool is_sharded;
    int32_t num_shards;
};

struct InferenceResult {
    BufferView output_view;
    std::vector<int64_t> output_shape;
    double inference_time_ms;
    bool cache_hit;
    size_t output_elem_count;
    bool shard_cache_hit;
    int32_t shards_loaded;
};

class InferenceEngine {
public:
    explicit InferenceEngine(const std::string& model_path,
                             int32_t intra_threads = 1,
                             bool use_cuda = false);

    InferenceEngine(const std::string& model_dir,
                    const std::string& manifest_path,
                    int32_t intra_threads = 1,
                    bool use_cuda = false,
                    size_t max_shard_memory = 4ULL << 30);

    ~InferenceEngine();

    InferenceEngine(const InferenceEngine&) = delete;
    InferenceEngine& operator=(const InferenceEngine&) = delete;

    InferenceResult infer(int32_t batch, int32_t height, int32_t width,
                          const uint8_t* input_data, size_t input_size,
                          bool use_fp16);

    const ModelInfo& get_model_info() const { return model_info_; }

    void warmup(int32_t batch, int32_t height, int32_t width, bool use_fp16);

    void compact();
    void release_output_buffer(const ShapeKey& key);

    size_t total_allocated_bytes() const;

    bool is_sharded() const { return model_info_.is_sharded; }

private:
    void setup_model();
    void setup_sharded_model(const std::string& model_dir,
                             const std::string& manifest_path);

    Ort::SessionOptions create_session_options(int32_t intra_threads,
                                               bool use_cuda);

    Ort::Value create_input_tensor(const std::vector<int64_t>& shape,
                                   const uint8_t* data, size_t size,
                                   bool use_fp16);
    Ort::Value create_output_tensor(const std::vector<int64_t>& shape,
                                    uint8_t* data, size_t size,
                                    bool use_fp16);

    size_t compute_output_size(int64_t batch, bool use_fp16) const;

    InferenceResult infer_sharded(int32_t batch, int32_t height, int32_t width,
                                  const uint8_t* input_data, size_t input_size,
                                  bool use_fp16);

    Ort::Env env_;
    Ort::Session session_;
    Ort::MemoryInfo memory_info_;
    ModelInfo model_info_;

    std::vector<std::string> input_names_str_;
    std::vector<std::string> output_names_str_;
    std::vector<const char*> input_names_;
    std::vector<const char*> output_names_;

    BufferCache input_buffer_cache_;
    BufferCache output_buffer_cache_;

    std::unique_ptr<ShardManager> shard_manager_;
    int32_t intra_threads_;
    bool use_cuda_;
};

}  // namespace inference
