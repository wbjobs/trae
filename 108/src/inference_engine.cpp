#include "inference_engine.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace inference {

InferenceEngine::InferenceEngine(const std::string& model_path,
                                 int32_t intra_threads, bool use_cuda)
    : env_(ORT_LOGGING_LEVEL_WARNING, "DynamicInference"),
      session_(nullptr),
      memory_info_(Ort::MemoryInfo::CreateCpu(OrtDeviceAllocator, OrtMemTypeCPU)),
      input_buffer_cache_(4ULL << 30, 3ULL << 30),
      output_buffer_cache_(4ULL << 30, 3ULL << 30),
      intra_threads_(intra_threads),
      use_cuda_(use_cuda) {
    model_info_.model_path = model_path;
    model_info_.is_sharded = false;
    model_info_.num_shards = 0;
    session_ = Ort::Session(env_, model_path.c_str(),
                            create_session_options(intra_threads, use_cuda));
    setup_model();
}

InferenceEngine::InferenceEngine(const std::string& model_dir,
                                 const std::string& manifest_path,
                                 int32_t intra_threads, bool use_cuda,
                                 size_t max_shard_memory)
    : env_(ORT_LOGGING_LEVEL_WARNING, "DynamicInference"),
      session_(nullptr),
      memory_info_(Ort::MemoryInfo::CreateCpu(OrtDeviceAllocator, OrtMemTypeCPU)),
      input_buffer_cache_(4ULL << 30, 3ULL << 30),
      output_buffer_cache_(4ULL << 30, 3ULL << 30),
      intra_threads_(intra_threads),
      use_cuda_(use_cuda) {
    model_info_.model_path = model_dir;
    model_info_.is_sharded = true;

    shard_manager_ = std::make_unique<ShardManager>(
        model_dir, env_, max_shard_memory, intra_threads, use_cuda);

    if (!shard_manager_->load_shard_manifest(manifest_path)) {
        throw std::runtime_error("Failed to load shard manifest: " + manifest_path);
    }

    model_info_.num_shards =
        static_cast<int32_t>(shard_manager_->get_shard_infos().size());

    setup_sharded_model(model_dir, manifest_path);
}

InferenceEngine::~InferenceEngine() = default;

Ort::SessionOptions InferenceEngine::create_session_options(
    int32_t intra_threads, bool use_cuda) {
    Ort::SessionOptions options;
    options.SetIntraOpNumThreads(intra_threads);
    options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    options.SetLogSeverityLevel(3);
    options.SetArenaExtendStrategy(OrtArenaExtendStrategy::kSameAsRequested);

#ifdef USE_CUDA
    if (use_cuda) {
        OrtCUDAProviderOptions cuda_options{};
        cuda_options.gpu_mem_limit = 4ULL << 30;
        cuda_options.arena_extend_strategy = 0;
        options.AppendExecutionProvider_CUDA(cuda_options);
    }
#endif

    return options;
}

void InferenceEngine::setup_model() {
    Ort::AllocatorWithDefaultOptions allocator;

    size_t input_count = session_.GetInputCount();
    if (input_count == 0) {
        throw std::runtime_error("Model has no inputs");
    }

    Ort::AllocatedStringPtr input_name_alloc =
        session_.GetInputNameAllocated(0, allocator);
    model_info_.input_name = input_name_alloc.get();
    input_names_str_.push_back(model_info_.input_name);

    Ort::TypeInfo input_type_info = session_.GetInputTypeInfo(0);
    auto input_tensor_info = input_type_info.GetTensorTypeAndShapeInfo();
    ONNXTensorElementDataType input_type = input_tensor_info.GetElementType();
    model_info_.input_shape = input_tensor_info.GetShape();

    for (auto& dim : model_info_.input_shape) {
        if (dim < 0) dim = 1;
    }

    size_t output_count = session_.GetOutputCount();
    if (output_count == 0) {
        throw std::runtime_error("Model has no outputs");
    }

    Ort::AllocatedStringPtr output_name_alloc =
        session_.GetOutputNameAllocated(0, allocator);
    model_info_.output_name = output_name_alloc.get();
    output_names_str_.push_back(model_info_.output_name);

    Ort::TypeInfo output_type_info = session_.GetOutputTypeInfo(0);
    auto output_tensor_info = output_type_info.GetTensorTypeAndShapeInfo();
    model_info_.output_shape = output_tensor_info.GetShape();

    model_info_.supports_fp16 = (input_type == ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16);

    input_names_.push_back(input_names_str_[0].c_str());
    output_names_.push_back(output_names_str_[0].c_str());
}

void InferenceEngine::setup_sharded_model(const std::string& model_dir,
                                           const std::string& manifest_path) {
    const auto& shards = shard_manager_->get_shard_infos();
    if (shards.empty()) {
        throw std::runtime_error("No shards found in manifest");
    }

    const auto& first_shard = shards.front();
    model_info_.input_name = first_shard.input_name;
    model_info_.input_shape = {-1, 3, -1, -1};

    const auto& last_shard = shards.back();
    model_info_.output_name = last_shard.output_name;
    model_info_.output_shape = {-1, 1000};

    model_info_.supports_fp16 = false;
}

size_t InferenceEngine::compute_output_size(int64_t batch, bool use_fp16) const {
    size_t elem_count = 1;
    for (auto dim : model_info_.output_shape) {
        if (dim == -1) {
            elem_count *= batch;
        } else if (dim > 0) {
            elem_count *= dim;
        }
    }
    size_t elem_size = use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float);
    return elem_count * elem_size;
}

Ort::Value InferenceEngine::create_input_tensor(
    const std::vector<int64_t>& shape, const uint8_t* data, size_t size,
    bool use_fp16) {
    size_t elem_count = 1;
    for (auto s : shape) elem_count *= s;

    size_t elem_size = use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float);

    if (elem_count * elem_size > size) {
        throw std::runtime_error("Input size too small for shape");
    }

    if (use_fp16) {
        return Ort::Value::CreateTensor<Ort::Float16_t>(
            memory_info_, const_cast<Ort::Float16_t*>(
                              reinterpret_cast<const Ort::Float16_t*>(data)),
            elem_count, shape.data(), shape.size());
    } else {
        return Ort::Value::CreateTensor<float>(
            memory_info_, const_cast<float*>(reinterpret_cast<const float*>(data)),
            elem_count, shape.data(), shape.size());
    }
}

Ort::Value InferenceEngine::create_output_tensor(
    const std::vector<int64_t>& shape, uint8_t* data, size_t size,
    bool use_fp16) {
    size_t elem_count = 1;
    for (auto s : shape) elem_count *= s;

    size_t elem_size = use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float);

    if (elem_count * elem_size > size) {
        throw std::runtime_error("Output buffer too small for shape");
    }

    if (use_fp16) {
        return Ort::Value::CreateTensor<Ort::Float16_t>(
            memory_info_, reinterpret_cast<Ort::Float16_t*>(data),
            elem_count, shape.data(), shape.size());
    } else {
        return Ort::Value::CreateTensor<float>(
            memory_info_, reinterpret_cast<float*>(data),
            elem_count, shape.data(), shape.size());
    }
}

InferenceResult InferenceEngine::infer(int32_t batch, int32_t height,
                                       int32_t width, const uint8_t* input_data,
                                       size_t input_size, bool use_fp16) {
    if (model_info_.is_sharded) {
        return infer_sharded(batch, height, width, input_data, input_size, use_fp16);
    }

    bool input_cache_hit = false;
    BufferView input_view = input_buffer_cache_.acquire(
        batch, height, width, use_fp16, input_cache_hit);

    if (!input_cache_hit) {
        std::memcpy(input_view.data, input_data, input_size);
    }

    std::vector<int64_t> input_shape{batch, 3, height, width};
    auto input_tensor = create_input_tensor(
        input_shape, input_view.data, input_view.size, use_fp16);

    size_t output_elem_count = 1;
    std::vector<int64_t> output_shape;
    for (auto dim : model_info_.output_shape) {
        if (dim == -1) {
            output_shape.push_back(batch);
            output_elem_count *= batch;
        } else {
            output_shape.push_back(dim);
            output_elem_count *= dim;
        }
    }

    size_t output_bytes = output_elem_count *
                          (use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float));

    bool output_cache_hit = false;
    BufferView output_view = output_buffer_cache_.acquire_raw(
        output_bytes, use_fp16, output_cache_hit);

    auto output_tensor = create_output_tensor(
        output_shape, output_view.data, output_view.size, use_fp16);

    Ort::Value* output_tensor_ptr = &output_tensor;
    auto start = std::chrono::steady_clock::now();

    session_.Run(Ort::RunOptions{nullptr}, input_names_.data(), &input_tensor,
                 input_names_.size(), output_names_.data(),
                 &output_tensor_ptr, 1);

    auto end = std::chrono::steady_clock::now();

    InferenceResult result;
    result.output_view = output_view;
    result.output_shape = output_shape;
    result.inference_time_ms =
        std::chrono::duration<double, std::milli>(end - start).count();
    result.cache_hit = input_cache_hit;
    result.output_elem_count = output_elem_count;
    result.shard_cache_hit = false;
    result.shards_loaded = 0;

    input_buffer_cache_.release(input_view.key);

    return result;
}

InferenceResult InferenceEngine::infer_sharded(
    int32_t batch, int32_t height, int32_t width, const uint8_t* input_data,
    size_t input_size, bool use_fp16) {
    const auto& shard_infos = shard_manager_->get_shard_infos();

    bool input_cache_hit = false;
    BufferView input_view = input_buffer_cache_.acquire(
        batch, height, width, use_fp16, input_cache_hit);

    if (!input_cache_hit) {
        std::memcpy(input_view.data, input_data, input_size);
    }

    BufferView intermediate_view = input_view;
    std::vector<int64_t> current_shape{batch, 3, height, width};
    int32_t shards_loaded = 0;
    bool any_shard_loaded = false;

    auto total_start = std::chrono::steady_clock::now();

    for (size_t i = 0; i < shard_infos.size(); ++i) {
        const auto& shard_info = shard_infos[i];
        bool is_last = (i == shard_infos.size() - 1);

        if (!shard_manager_->load_shard(shard_info.shard_id)) {
            throw std::runtime_error("Failed to load shard " +
                                     std::to_string(shard_info.shard_id));
        }
        shards_loaded++;
        any_shard_loaded = true;

        LoadedShard* shard = shard_manager_->acquire_shard(shard_info.shard_id);
        if (!shard) {
            throw std::runtime_error("Failed to acquire shard " +
                                     std::to_string(shard_info.shard_id));
        }

        auto shard_input_tensor = create_input_tensor(
            current_shape, intermediate_view.data, intermediate_view.size,
            use_fp16);

        std::vector<int64_t> output_shape;
        size_t output_elem_count = 1;
        if (is_last) {
            for (auto dim : model_info_.output_shape) {
                if (dim == -1) {
                    output_shape.push_back(batch);
                    output_elem_count *= batch;
                } else if (dim > 0) {
                    output_shape.push_back(dim);
                    output_elem_count *= dim;
                }
            }
        } else {
            output_shape = current_shape;
            output_elem_count = batch * 3 * height * width;
        }

        size_t output_bytes = output_elem_count *
                              (use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float));

        bool out_cache_hit = false;
        BufferView output_view;

        if (is_last) {
            output_view = output_buffer_cache_.acquire_raw(
                output_bytes, use_fp16, out_cache_hit);
        } else {
            output_view = input_buffer_cache_.acquire(
                batch, height, width, use_fp16, out_cache_hit);
        }

        auto output_tensor = create_output_tensor(
            output_shape, output_view.data, output_view.size, use_fp16);

        Ort::Value* output_tensor_ptr = &output_tensor;

        shard->session.Run(Ort::RunOptions{nullptr},
                           shard->input_names.data(), &shard_input_tensor,
                           shard->input_names.size(),
                           shard->output_names.data(),
                           &output_tensor_ptr, 1);

        shard_manager_->release_shard(shard_info.shard_id);

        if (i > 0 && !is_last) {
            input_buffer_cache_.release(intermediate_view.key);
        }

        intermediate_view = output_view;
        current_shape = output_shape;

        if (!is_last && i < shard_infos.size() - 1) {
            shard_manager_->preload_predicted(shard_info.shard_id);
        }
    }

    auto total_end = std::chrono::steady_clock::now();

    InferenceResult result;
    result.output_view = intermediate_view;
    result.output_shape = current_shape;
    result.inference_time_ms =
        std::chrono::duration<double, std::milli>(total_end - total_start).count();
    result.cache_hit = input_cache_hit;
    result.output_elem_count = batch * 3 * height * width;
    result.shard_cache_hit = any_shard_loaded;
    result.shards_loaded = shards_loaded;

    input_buffer_cache_.release(input_view.key);

    return result;
}

void InferenceEngine::warmup(int32_t batch, int32_t height, int32_t width,
                             bool use_fp16) {
    if (model_info_.is_sharded) {
        const auto& shard_infos = shard_manager_->get_shard_infos();
        for (const auto& shard_info : shard_infos) {
            shard_manager_->load_shard(shard_info.shard_id);
        }
        return;
    }

    bool input_cache_hit = false;
    BufferView input_view = input_buffer_cache_.acquire(
        batch, height, width, use_fp16, input_cache_hit);

    std::memset(input_view.data, 0, input_view.size);

    std::vector<int64_t> input_shape{batch, 3, height, width};
    auto input_tensor = create_input_tensor(
        input_shape, input_view.data, input_view.size, use_fp16);

    size_t output_elem_count = 1;
    std::vector<int64_t> output_shape;
    for (auto dim : model_info_.output_shape) {
        if (dim == -1) {
            output_shape.push_back(batch);
            output_elem_count *= batch;
        } else {
            output_shape.push_back(dim);
            output_elem_count *= dim;
        }
    }

    size_t output_bytes = output_elem_count *
                          (use_fp16 ? sizeof(Ort::Float16_t) : sizeof(float));

    bool output_cache_hit = false;
    BufferView output_view = output_buffer_cache_.acquire_raw(
        output_bytes, use_fp16, output_cache_hit);

    auto output_tensor = create_output_tensor(
        output_shape, output_view.data, output_view.size, use_fp16);

    Ort::Value* output_tensor_ptr = &output_tensor;

    session_.Run(Ort::RunOptions{nullptr}, input_names_.data(), &input_tensor,
                 input_names_.size(), output_names_.data(),
                 &output_tensor_ptr, 1);

    input_buffer_cache_.release(input_view.key);
    output_buffer_cache_.release(output_view.key);
}

void InferenceEngine::compact() {
    input_buffer_cache_.compact();
    output_buffer_cache_.compact();
}

void InferenceEngine::release_output_buffer(const ShapeKey& key) {
    output_buffer_cache_.release(key);
}

size_t InferenceEngine::total_allocated_bytes() const {
    size_t total = input_buffer_cache_.total_allocated_bytes() +
                   output_buffer_cache_.total_allocated_bytes();
    if (shard_manager_) {
        total += shard_manager_->total_loaded_bytes();
    }
    return total;
}

}  // namespace inference
