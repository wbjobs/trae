#include "inference_service.h"

#include <chrono>
#include <cstring>
#include <stdexcept>

namespace inference {

InferenceServiceImpl::InferenceServiceImpl() = default;

bool InferenceServiceImpl::register_model(const std::string& model_name,
                                           const std::string& model_path,
                                           int32_t intra_threads,
                                           bool use_cuda) {
    try {
        engines_[model_name] = std::make_unique<InferenceEngine>(
            model_path, intra_threads, use_cuda);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

bool InferenceServiceImpl::register_sharded_model(
    const std::string& model_name, const std::string& model_dir,
    const std::string& manifest_path, int32_t intra_threads, bool use_cuda,
    size_t max_shard_memory) {
    try {
        engines_[model_name] = std::make_unique<InferenceEngine>(
            model_dir, manifest_path, intra_threads, use_cuda, max_shard_memory);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

void InferenceServiceImpl::set_batch_range(int32_t min_batch,
                                            int32_t max_batch) {
    min_batch_ = min_batch;
    max_batch_ = max_batch;
}

void InferenceServiceImpl::set_resolution_range(int32_t min_res,
                                                 int32_t max_res) {
    min_resolution_ = min_res;
    max_resolution_ = max_res;
}

bool InferenceServiceImpl::validate_request(int32_t batch, int32_t height,
                                             int32_t width,
                                             std::string* error_msg) {
    if (batch < min_batch_ || batch > max_batch_) {
        *error_msg = "Batch size " + std::to_string(batch) +
                     " out of range [" + std::to_string(min_batch_) + ", " +
                     std::to_string(max_batch_) + "]";
        return false;
    }
    if (height < min_resolution_ || height > max_resolution_) {
        *error_msg = "Height " + std::to_string(height) +
                     " out of range [" + std::to_string(min_resolution_) +
                     ", " + std::to_string(max_resolution_) + "]";
        return false;
    }
    if (width < min_resolution_ || width > max_resolution_) {
        *error_msg = "Width " + std::to_string(width) +
                     " out of range [" + std::to_string(min_resolution_) +
                     ", " + std::to_string(max_resolution_) + "]";
        return false;
    }
    return true;
}

grpc::Status InferenceServiceImpl::Infer(grpc::ServerContext* context,
                                          const InferenceRequest* request,
                                          InferenceResponse* response) {
    std::string error_msg;
    if (!validate_request(request->batch_size(), request->height(),
                           request->width(), &error_msg)) {
        return grpc::Status(grpc::INVALID_ARGUMENT, error_msg);
    }

    auto it = engines_.find(request->model_name());
    if (it == engines_.end()) {
        return grpc::Status(grpc::NOT_FOUND,
                            "Model not found: " + request->model_name());
    }

    auto* engine = it->second.get();
    const auto& model_info = engine->get_model_info();

    if (request->use_fp16() && !model_info.supports_fp16) {
        return grpc::Status(grpc::INVALID_ARGUMENT,
                            "Model does not support FP16 precision");
    }

    try {
        InferenceResult result = engine->infer(
            request->batch_size(), request->height(), request->width(),
            reinterpret_cast<const uint8_t*>(request->input_data().data()),
            request->input_data().size(), request->use_fp16());

        size_t elem_size = request->use_fp16() ? sizeof(Ort::Float16_t) : sizeof(float);
        size_t output_bytes = result.output_elem_count * elem_size;

        response->set_model_name(request->model_name());
        response->set_batch_size(request->batch_size());
        response->set_output_size(result.output_elem_count);
        response->set_output_data(result.output_view.data, output_bytes);
        response->set_inference_time_ms(result.inference_time_ms);
        response->set_cache_hit(result.cache_hit);
        response->set_shard_cache_hit(result.shard_cache_hit);
        response->set_shards_loaded(result.shards_loaded);

        engine->release_output_buffer(result.output_view.key);

        return grpc::Status::OK;
    } catch (const std::exception& e) {
        return grpc::Status(grpc::INTERNAL, e.what());
    }
}

grpc::Status InferenceServiceImpl::GetModelInfo(
    grpc::ServerContext* context, const ModelInfoRequest* request,
    ModelInfoResponse* response) {
    auto it = engines_.find(request->model_name());
    if (it == engines_.end()) {
        return grpc::Status(grpc::NOT_FOUND,
                            "Model not found: " + request->model_name());
    }

    const auto& info = it->second->get_model_info();
    response->set_model_name(request->model_name());
    response->set_input_name(info.input_name);
    for (auto dim : info.input_shape) {
        response->add_input_shape(dim);
    }
    response->set_output_name(info.output_name);
    for (auto dim : info.output_shape) {
        response->add_output_shape(dim);
    }
    response->set_supports_fp16(info.supports_fp16);
    response->set_min_batch(min_batch_);
    response->set_max_batch(max_batch_);
    response->set_min_resolution(min_resolution_);
    response->set_max_resolution(max_resolution_);
    response->set_is_sharded(info.is_sharded);
    response->set_num_shards(info.num_shards);

    return grpc::Status::OK;
}

grpc::Status InferenceServiceImpl::Warmup(grpc::ServerContext* context,
                                           const WarmupRequest* request,
                                           WarmupResponse* response) {
    std::string error_msg;
    if (!validate_request(request->batch_size(), request->height(),
                           request->width(), &error_msg)) {
        response->set_success(false);
        response->set_message(error_msg);
        return grpc::Status(grpc::INVALID_ARGUMENT, error_msg);
    }

    auto it = engines_.find(request->model_name());
    if (it == engines_.end()) {
        response->set_success(false);
        response->set_message("Model not found: " + request->model_name());
        return grpc::Status(grpc::NOT_FOUND,
                            "Model not found: " + request->model_name());
    }

    try {
        auto start = std::chrono::steady_clock::now();
        it->second->warmup(request->batch_size(), request->height(),
                            request->width(), false);
        auto end = std::chrono::steady_clock::now();

        response->set_success(true);
        response->set_warmup_time_ms(
            std::chrono::duration<double, std::milli>(end - start).count());
        response->set_message("Warmup completed successfully");

        return grpc::Status::OK;
    } catch (const std::exception& e) {
        response->set_success(false);
        response->set_message(e.what());
        return grpc::Status(grpc::INTERNAL, e.what());
    }
}

void InferenceServiceImpl::compact_all() {
    for (auto& [name, engine] : engines_) {
        engine->compact();
    }
}

}  // namespace inference
