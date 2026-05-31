#include "batch_processor.h"
#include <thread>
#include <future>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#else
#include <unistd.h>
#endif

namespace doc_correction {

BatchProcessor::BatchProcessor()
    : corrector_(std::make_unique<DocumentCorrection>()),
      cancel_flag_(false),
      processing_(false),
      thread_count_(2) {}

BatchProcessor::~BatchProcessor() {
    cancel();
}

bool BatchProcessor::init(const std::string& model_dir, const CorrectionOptions& options) {
    return corrector_->init(model_dir, options);
}

std::vector<BatchResult> BatchProcessor::process(
    const std::vector<std::string>& input_paths,
    const std::string& output_dir,
    BatchProgressCallback callback) {

    std::vector<BatchResult> results;
    if (input_paths.empty()) {
        return results;
    }

    results.resize(input_paths.size());
    processing_ = true;
    cancel_flag_ = false;

    auto process_func = [&](int start, int end) {
        for (int i = start; i < end && !cancel_flag_; i++) {
            results[i] = processSingle(input_paths[i], output_dir);

            if (callback) {
                std::lock_guard<std::mutex> lock(mutex_);
                callback(i + 1, static_cast<int>(input_paths.size()), results[i]);
            }
        }
    };

    int count = static_cast<int>(input_paths.size());
    int actual_threads = std::min(thread_count_, count);

    if (actual_threads <= 1) {
        process_func(0, count);
    } else {
        std::vector<std::thread> threads;
        int chunk_size = (count + actual_threads - 1) / actual_threads;

        for (int t = 0; t < actual_threads; t++) {
            int start = t * chunk_size;
            int end = std::min(start + chunk_size, count);
            if (start < end) {
                threads.emplace_back(process_func, start, end);
            }
        }

        for (auto& t : threads) {
            if (t.joinable()) {
                t.join();
            }
        }
    }

    processing_ = false;
    return results;
}

std::vector<BatchResult> BatchProcessor::process(
    const std::vector<cv::Mat>& images,
    BatchProgressCallback callback) {

    std::vector<BatchResult> results;
    if (images.empty()) {
        return results;
    }

    results.resize(images.size());
    processing_ = true;
    cancel_flag_ = false;

    auto process_func = [&](int start, int end) {
        for (int i = start; i < end && !cancel_flag_; i++) {
            results[i] = processSingle(images[i], i);

            if (callback) {
                std::lock_guard<std::mutex> lock(mutex_);
                callback(i + 1, static_cast<int>(images.size()), results[i]);
            }
        }
    };

    int count = static_cast<int>(images.size());
    int actual_threads = std::min(thread_count_, count);

    if (actual_threads <= 1) {
        process_func(0, count);
    } else {
        std::vector<std::thread> threads;
        int chunk_size = (count + actual_threads - 1) / actual_threads;

        for (int t = 0; t < actual_threads; t++) {
            int start = t * chunk_size;
            int end = std::min(start + chunk_size, count);
            if (start < end) {
                threads.emplace_back(process_func, start, end);
            }
        }

        for (auto& t : threads) {
            if (t.joinable()) {
                t.join();
            }
        }
    }

    processing_ = false;
    return results;
}

void BatchProcessor::cancel() {
    cancel_flag_ = true;
}

bool BatchProcessor::isProcessing() const {
    return processing_;
}

int BatchProcessor::getThreadCount() const {
    return thread_count_;
}

void BatchProcessor::setThreadCount(int count) {
    thread_count_ = std::max(1, count);
}

BatchResult BatchProcessor::processSingle(const std::string& input_path, const std::string& output_dir) {
    BatchResult result;
    result.input_path = input_path;
    result.success = false;

    try {
        cv::Mat image = cv::imread(input_path, cv::IMREAD_COLOR);
        if (image.empty()) {
            result.error_message = "Failed to read image: " + input_path;
            return result;
        }

        CorrectionResult correction = corrector_->correct(image);
        if (!correction.success) {
            result.error_message = correction.error_message;
            return result;
        }

        result.corners = correction.corners;
        result.output_path = generateOutputPath(input_path, output_dir);

        if (cv::imwrite(result.output_path, correction.corrected_image)) {
            result.success = true;
        } else {
            result.error_message = "Failed to write output image";
        }
    } catch (const std::exception& e) {
        result.error_message = std::string("Exception: ") + e.what();
    } catch (...) {
        result.error_message = "Unknown exception";
    }

    return result;
}

BatchResult BatchProcessor::processSingle(const cv::Mat& image, int index) {
    BatchResult result;
    result.input_path = std::to_string(index);
    result.success = false;

    try {
        CorrectionResult correction = corrector_->correct(image);
        if (!correction.success) {
            result.error_message = correction.error_message;
            return result;
        }

        result.corners = correction.corners;
        result.success = true;
    } catch (const std::exception& e) {
        result.error_message = std::string("Exception: ") + e.what();
    } catch (...) {
        result.error_message = "Unknown exception";
    }

    return result;
}

std::string BatchProcessor::generateOutputPath(const std::string& input_path,
                                               const std::string& output_dir) {
    size_t last_sep = input_path.find_last_of("/\\");
    std::string filename = (last_sep != std::string::npos) ?
                            input_path.substr(last_sep + 1) : input_path;

    size_t dot_pos = filename.find_last_of('.');
    std::string name = (dot_pos != std::string::npos) ?
                        filename.substr(0, dot_pos) : filename;
    std::string ext = (dot_pos != std::string::npos) ?
                       filename.substr(dot_pos) : ".jpg";

    return output_dir + "/" + name + "_corrected" + ext;
}

}
