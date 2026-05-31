#include <grpcpp/grpcpp.h>

#include <chrono>
#include <cstring>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include "generated/inference.grpc.pb.h"

class InferenceClient {
public:
    InferenceClient(std::shared_ptr<grpc::Channel> channel)
        : stub_(inference::InferenceService::NewStub(channel)) {}

    void do_infer(const std::string& model_name, int32_t batch, int32_t height,
                   int32_t width, bool use_fp16) {
        inference::InferenceRequest request;
        request.set_model_name(model_name);
        request.set_batch_size(batch);
        request.set_height(height);
        request.set_width(width);
        request.set_use_fp16(use_fp16);

        size_t elem_size = use_fp16 ? 2 : 4;
        size_t total_size =
            static_cast<size_t>(batch) * 3 * height * width * elem_size;
        std::vector<uint8_t> input_data(total_size, 0x3F);
        request.set_input_data(input_data.data(), total_size);

        inference::InferenceResponse response;
        grpc::ClientContext context;

        grpc::Status status = stub_->Infer(&context, request, &response);

        if (status.ok()) {
            std::cout << "[Infer] batch=" << batch
                      << " res=" << height << "x" << width
                      << " fp16=" << (use_fp16 ? "yes" : "no")
                      << " time=" << response.inference_time_ms() << "ms"
                      << " cache_hit=" << (response.cache_hit() ? "yes" : "no")
                      << " output_size=" << response.output_size() << std::endl;
        } else {
            std::cerr << "[Infer] RPC failed: " << status.error_code()
                      << " - " << status.error_message() << std::endl;
        }
    }

    void do_get_model_info(const std::string& model_name) {
        inference::ModelInfoRequest request;
        request.set_model_name(model_name);

        inference::ModelInfoResponse response;
        grpc::ClientContext context;

        grpc::Status status = stub_->GetModelInfo(&context, request, &response);

        if (status.ok()) {
            std::cout << "[ModelInfo] " << model_name << ":\n"
                      << "  Input: " << response.input_name() << " [";
            for (int i = 0; i < response.input_shape_size(); ++i) {
                if (i > 0) std::cout << ", ";
                std::cout << response.input_shape(i);
            }
            std::cout << "]\n"
                      << "  Output: " << response.output_name() << " [";
            for (int i = 0; i < response.output_shape_size(); ++i) {
                if (i > 0) std::cout << ", ";
                std::cout << response.output_shape(i);
            }
            std::cout << "]\n"
                      << "  Supports FP16: "
                      << (response.supports_fp16() ? "yes" : "no") << "\n"
                      << "  Batch: [" << response.min_batch() << ", "
                      << response.max_batch() << "]\n"
                      << "  Resolution: [" << response.min_resolution()
                      << ", " << response.max_resolution() << "]" << std::endl;
        } else {
            std::cerr << "[ModelInfo] RPC failed: " << status.error_code()
                      << " - " << status.error_message() << std::endl;
        }
    }

    void do_warmup(const std::string& model_name, int32_t batch,
                    int32_t height, int32_t width) {
        inference::WarmupRequest request;
        request.set_model_name(model_name);
        request.set_batch_size(batch);
        request.set_height(height);
        request.set_width(width);

        inference::WarmupResponse response;
        grpc::ClientContext context;

        grpc::Status status = stub_->Warmup(&context, request, &response);

        if (status.ok()) {
            std::cout << "[Warmup] success=" << response.success()
                      << " time=" << response.warmup_time_ms() << "ms"
                      << " msg=" << response.message() << std::endl;
        } else {
            std::cerr << "[Warmup] RPC failed: " << status.error_code()
                      << " - " << status.error_message() << std::endl;
        }
    }

private:
    std::unique_ptr<inference::InferenceService::Stub> stub_;
};

int main(int argc, char* argv[]) {
    std::string server_addr = "localhost:50051";
    std::string model_name = "default";

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--server" && i + 1 < argc) {
            server_addr = argv[++i];
        } else if (arg == "--model_name" && i + 1 < argc) {
            model_name = argv[++i];
        }
    }

    InferenceClient client(
        grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials()));

    std::cout << "=== Model Info ===" << std::endl;
    client.do_get_model_info(model_name);

    std::cout << "\n=== Warmup ===" << std::endl;
    client.do_warmup(model_name, 4, 224, 224);

    std::cout << "\n=== Inference Tests ===" << std::endl;

    std::vector<std::tuple<int32_t, int32_t, int32_t, bool>> test_cases = {
        {1, 224, 224, false},
        {4, 224, 224, false},
        {8, 512, 512, false},
        {16, 256, 256, false},
        {32, 224, 224, false},
        {4, 1024, 1024, false},
        {1, 224, 224, false},
        {4, 224, 224, false},
    };

    for (const auto& [batch, h, w, fp16] : test_cases) {
        client.do_infer(model_name, batch, h, w, fp16);
    }

    std::cout << "\n=== Done ===" << std::endl;
    return 0;
}
