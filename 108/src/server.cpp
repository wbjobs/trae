#include <grpcpp/grpcpp.h>

#include <atomic>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <thread>

#include "inference_service.h"

void print_usage(const char* prog) {
    std::cout << "Usage: " << prog << " [OPTIONS]\n"
              << "Options:\n"
              << "  --model_path PATH     Path to ONNX model file\n"
              << "  --model_name NAME     Name to register the model under\n"
              << "  --port PORT           Server port (default: 50051)\n"
              << "  --intra_threads N     Number of intra-op threads (default: 1)\n"
              << "  --use_cuda            Enable CUDA execution provider\n"
              << "  --min_batch N         Minimum batch size (default: 1)\n"
              << "  --max_batch N         Maximum batch size (default: 32)\n"
              << "  --min_res N           Minimum resolution (default: 224)\n"
              << "  --max_res N           Maximum resolution (default: 1024)\n"
              << "  --compact_interval N  Background compaction interval in seconds\n"
              << "                        (default: 60, 0 = disabled)\n"
              << "\n"
              << "Sharded model options (use instead of --model_path):\n"
              << "  --shard_dir DIR       Directory containing shard ONNX files\n"
              << "  --shard_manifest FILE Path to shard_manifest.csv\n"
              << "  --max_shard_memory GB Max memory for shard cache in GB (default: 4)\n"
              << std::endl;
}

int main(int argc, char* argv[]) {
    std::string model_path;
    std::string model_name = "default";
    std::string server_address = "0.0.0.0:50051";
    int32_t intra_threads = 1;
    bool use_cuda = false;
    int32_t min_batch = 1;
    int32_t max_batch = 32;
    int32_t min_res = 224;
    int32_t max_res = 1024;
    int32_t compact_interval = 60;

    std::string shard_dir;
    std::string shard_manifest;
    int32_t max_shard_memory_gb = 4;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--model_path" && i + 1 < argc) {
            model_path = argv[++i];
        } else if (arg == "--model_name" && i + 1 < argc) {
            model_name = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            server_address = "0.0.0.0:" + std::string(argv[++i]);
        } else if (arg == "--intra_threads" && i + 1 < argc) {
            intra_threads = std::atoi(argv[++i]);
        } else if (arg == "--use_cuda") {
            use_cuda = true;
        } else if (arg == "--min_batch" && i + 1 < argc) {
            min_batch = std::atoi(argv[++i]);
        } else if (arg == "--max_batch" && i + 1 < argc) {
            max_batch = std::atoi(argv[++i]);
        } else if (arg == "--min_res" && i + 1 < argc) {
            min_res = std::atoi(argv[++i]);
        } else if (arg == "--max_res" && i + 1 < argc) {
            max_res = std::atoi(argv[++i]);
        } else if (arg == "--compact_interval" && i + 1 < argc) {
            compact_interval = std::atoi(argv[++i]);
        } else if (arg == "--shard_dir" && i + 1 < argc) {
            shard_dir = argv[++i];
        } else if (arg == "--shard_manifest" && i + 1 < argc) {
            shard_manifest = argv[++i];
        } else if (arg == "--max_shard_memory" && i + 1 < argc) {
            max_shard_memory_gb = std::atoi(argv[++i]);
        } else if (arg == "--help") {
            print_usage(argv[0]);
            return 0;
        }
    }

    bool use_sharding = !shard_dir.empty() && !shard_manifest.empty();

    if (!use_sharding && model_path.empty()) {
        std::cerr << "Error: --model_path or (--shard_dir + --shard_manifest) is required"
                  << std::endl;
        print_usage(argv[0]);
        return 1;
    }

    inference::InferenceServiceImpl service;
    service.set_batch_range(min_batch, max_batch);
    service.set_resolution_range(min_res, max_res);

    if (use_sharding) {
        size_t max_shard_memory = static_cast<size_t>(max_shard_memory_gb) << 30;
        if (!service.register_sharded_model(model_name, shard_dir, shard_manifest,
                                             intra_threads, use_cuda,
                                             max_shard_memory)) {
            std::cerr << "Failed to load sharded model from: " << shard_dir
                      << " (" << shard_manifest << ")" << std::endl;
            return 1;
        }
    } else {
        if (!service.register_model(model_name, model_path, intra_threads, use_cuda)) {
            std::cerr << "Failed to load model from: " << model_path << std::endl;
            return 1;
        }
    }

    std::atomic<bool> running{true};
    std::thread compaction_thread;

    if (compact_interval > 0) {
        compaction_thread = std::thread([&service, &running, compact_interval]() {
            while (running.load()) {
                std::this_thread::sleep_for(
                    std::chrono::seconds(compact_interval));
                if (!running.load()) break;
                service.compact_all();
            }
        });
    }

    grpc::ServerBuilder builder;
    builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    std::unique_ptr<grpc::Server> server(builder.BuildAndStart());
    std::cout << "Inference server listening on " << server_address << std::endl;

    if (use_sharding) {
        std::cout << "Sharded model: " << model_name << " (" << shard_dir << ")"
                  << std::endl;
        std::cout << "Max shard memory: " << max_shard_memory_gb << " GB" << std::endl;
    } else {
        std::cout << "Model: " << model_name << " (" << model_path << ")" << std::endl;
    }

    std::cout << "Batch range: [" << min_batch << ", " << max_batch << "]" << std::endl;
    std::cout << "Resolution range: [" << min_res << ", " << max_res << "]" << std::endl;
    if (compact_interval > 0) {
        std::cout << "Background compaction: every " << compact_interval << "s" << std::endl;
    }

    server->Wait();

    running.store(false);
    if (compaction_thread.joinable()) {
        compaction_thread.join();
    }

    return 0;
}
