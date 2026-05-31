#pragma once

#include <grpcpp/server_context.h>

#include <memory>
#include <string>
#include <unordered_map>

#include "generated/inference.grpc.pb.h"
#include "inference_engine.h"

namespace inference {

class InferenceServiceImpl final : public InferenceService::Service {
public:
    InferenceServiceImpl();

    grpc::Status Infer(grpc::ServerContext* context,
                       const InferenceRequest* request,
                       InferenceResponse* response) override;

    grpc::Status GetModelInfo(grpc::ServerContext* context,
                              const ModelInfoRequest* request,
                              ModelInfoResponse* response) override;

    grpc::Status Warmup(grpc::ServerContext* context,
                        const WarmupRequest* request,
                        WarmupResponse* response) override;

    bool register_model(const std::string& model_name,
                        const std::string& model_path,
                        int32_t intra_threads = 1,
                        bool use_cuda = false);

    bool register_sharded_model(const std::string& model_name,
                                 const std::string& model_dir,
                                 const std::string& manifest_path,
                                 int32_t intra_threads = 1,
                                 bool use_cuda = false,
                                 size_t max_shard_memory = 4ULL << 30);

    void set_batch_range(int32_t min_batch, int32_t max_batch);
    void set_resolution_range(int32_t min_res, int32_t max_res);
    void compact_all();

private:
    bool validate_request(int32_t batch, int32_t height, int32_t width,
                          std::string* error_msg);

    std::unordered_map<std::string, std::unique_ptr<InferenceEngine>> engines_;
    int32_t min_batch_ = 1;
    int32_t max_batch_ = 32;
    int32_t min_resolution_ = 224;
    int32_t max_resolution_ = 1024;
};

}  // namespace inference
