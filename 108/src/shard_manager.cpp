#include "shard_manager.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <fstream>
#include <stdexcept>

namespace inference {

ShardManager::ShardManager(const std::string& model_dir, Ort::Env& env,
                             size_t max_memory_bytes, int32_t intra_threads,
                             bool use_cuda)
    : env_(env),
      model_dir_(model_dir),
      max_memory_bytes_(max_memory_bytes),
      intra_threads_(intra_threads),
      use_cuda_(use_cuda),
      predictor_(64, 2),
      memory_info_(Ort::MemoryInfo::CreateCpu(OrtDeviceAllocator, OrtMemTypeCPU)) {}

ShardManager::~ShardManager() = default;

Ort::SessionOptions ShardManager::create_session_options() {
    Ort::SessionOptions options;
    options.SetIntraOpNumThreads(intra_threads_);
    options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    options.SetLogSeverityLevel(3);
    options.SetArenaExtendStrategy(OrtArenaExtendStrategy::kSameAsRequested);

#ifdef USE_CUDA
    if (use_cuda_) {
        OrtCUDAProviderOptions cuda_options{};
        cuda_options.gpu_mem_limit = max_memory_bytes_ / 2;
        cuda_options.arena_extend_strategy = 0;
        options.AppendExecutionProvider_CUDA(cuda_options);
    }
#endif

    return options;
}

bool ShardManager::load_shard_manifest(const std::string& manifest_path) {
    std::ifstream manifest(manifest_path);
    if (!manifest.is_open()) return false;

    std::string line;
    while (std::getline(manifest, line)) {
        if (line.empty() || line[0] == '#') continue;

        ShardInfo info;
        size_t pos = 0;
        std::string token;

        int field = 0;
        while ((pos = line.find(',')) != std::string::npos || field < 5) {
            token = (pos != std::string::npos) ? line.substr(0, pos) : line;

            switch (field) {
                case 0:
                    info.shard_id = std::stoi(token);
                    break;
                case 1:
                    info.shard_path = model_dir_ + "/" + token;
                    break;
                case 2:
                    info.weight_bytes = std::stoull(token);
                    break;
                case 3:
                    info.num_layers = std::stoi(token);
                    break;
                case 4:
                    info.input_name = token;
                    break;
                case 5:
                    info.output_name = token;
                    break;
            }

            if (pos != std::string::npos) {
                line.erase(0, pos + 1);
            } else {
                break;
            }
            field++;
        }

        shard_memory_estimate_[info.shard_id] = info.weight_bytes;
        shard_infos_.push_back(std::move(info));
    }

    std::sort(shard_infos_.begin(), shard_infos_.end(),
              [](const ShardInfo& a, const ShardInfo& b) {
                  return a.shard_id < b.shard_id;
              });

    return !shard_infos_.empty();
}

size_t ShardManager::estimate_shard_memory(int32_t shard_id) const {
    auto it = shard_memory_estimate_.find(shard_id);
    if (it != shard_memory_estimate_.end()) {
        return it->second;
    }
    return 256ULL << 20;
}

bool ShardManager::load_shard(int32_t shard_id) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = loaded_shards_.find(shard_id);
    if (it != loaded_shards_.end()) {
        return true;
    }

    size_t needed = estimate_shard_memory(shard_id);
    size_t current = 0;
    for (const auto& [id, shard] : loaded_shards_) {
        current += estimate_shard_memory(id);
    }

    if (current + needed > max_memory_bytes_) {
        while (current + needed > max_memory_bytes_) {
            int32_t oldest_id = -1;
            auto oldest_time = std::chrono::steady_clock::time_point::max();

            for (const auto& [id, shard] : loaded_shards_) {
                if (!shard->in_use && shard->last_used < oldest_time) {
                    oldest_id = id;
                    oldest_time = shard->last_used;
                }
            }

            if (oldest_id < 0) break;

            loaded_shards_.erase(oldest_id);
            current = 0;
            for (const auto& [id, shard] : loaded_shards_) {
                current += estimate_shard_memory(id);
            }
        }
    }

    auto info_it = std::find_if(
        shard_infos_.begin(), shard_infos_.end(),
        [shard_id](const ShardInfo& s) { return s.shard_id == shard_id; });

    if (info_it == shard_infos_.end()) {
        return false;
    }

    try {
        auto shard = std::make_unique<LoadedShard>();
        shard->shard_id = shard_id;
        shard->session = Ort::Session(env_, info_it->shard_path.c_str(),
                                       create_session_options());
        shard->in_use = false;
        shard->last_used = std::chrono::steady_clock::now();

        Ort::AllocatorWithDefaultOptions allocator;

        size_t input_count = shard->session.GetInputCount();
        if (input_count > 0) {
            Ort::AllocatedStringPtr name_alloc =
                shard->session.GetInputNameAllocated(0, allocator);
            shard->input_names_str.push_back(name_alloc.get());
            shard->input_names.push_back(shard->input_names_str[0].c_str());
        }

        size_t output_count = shard->session.GetOutputCount();
        if (output_count > 0) {
            Ort::AllocatedStringPtr name_alloc =
                shard->session.GetOutputNameAllocated(0, allocator);
            shard->output_names_str.push_back(name_alloc.get());
            shard->output_names.push_back(shard->output_names_str[0].c_str());
        }

        loaded_shards_[shard_id] = std::move(shard);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

void ShardManager::unload_shard(int32_t shard_id) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = loaded_shards_.find(shard_id);
    if (it != loaded_shards_.end()) {
        loaded_shards_.erase(it);
    }
}

LoadedShard* ShardManager::acquire_shard(int32_t shard_id) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = loaded_shards_.find(shard_id);
    if (it != loaded_shards_.end()) {
        it->second->in_use = true;
        it->second->last_used = std::chrono::steady_clock::now();

        auto now = std::chrono::steady_clock::now();
        double time_ms =
            std::chrono::duration<double, std::milli>(
                now.time_since_epoch())
                .count();
        predictor_.record_access(shard_id, time_ms);

        return it->second.get();
    }

    return nullptr;
}

void ShardManager::release_shard(int32_t shard_id) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = loaded_shards_.find(shard_id);
    if (it != loaded_shards_.end()) {
        it->second->in_use = false;
        it->second->last_used = std::chrono::steady_clock::now();
    }
}

void ShardManager::preload_predicted(int32_t current_shard_id) {
    std::vector<int32_t> predicted =
        predictor_.predict_next_shards(current_shard_id, 2);

    for (int32_t shard_id : predicted) {
        auto it = loaded_shards_.find(shard_id);
        if (it == loaded_shards_.end()) {
            load_shard(shard_id);
        }
    }
}

size_t ShardManager::total_loaded_bytes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t total = 0;
    for (const auto& [id, shard] : loaded_shards_) {
        total += estimate_shard_memory(id);
    }
    return total;
}

size_t ShardManager::num_loaded_shards() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return loaded_shards_.size();
}

void ShardManager::set_max_memory(size_t max_bytes) {
    std::lock_guard<std::mutex> lock(mutex_);
    max_memory_bytes_ = max_bytes;
}

}  // namespace inference
