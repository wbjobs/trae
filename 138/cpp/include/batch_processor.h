#ifndef DOCUMENT_CORRECTION_BATCH_H
#define DOCUMENT_CORRECTION_BATCH_H

#include "document_correction.h"
#include <vector>
#include <string>
#include <functional>
#include <atomic>
#include <mutex>

namespace doc_correction {

struct BatchResult {
    std::string input_path;
    std::string output_path;
    bool success;
    std::string error_message;
    Corners corners;
};

using BatchProgressCallback = std::function<void(int current, int total, const BatchResult& result)>;

class BatchProcessor {
public:
    BatchProcessor();
    ~BatchProcessor();

    bool init(const std::string& model_dir, const CorrectionOptions& options = CorrectionOptions());

    std::vector<BatchResult> process(
        const std::vector<std::string>& input_paths,
        const std::string& output_dir,
        BatchProgressCallback callback = nullptr);

    std::vector<BatchResult> process(
        const std::vector<cv::Mat>& images,
        BatchProgressCallback callback = nullptr);

    void cancel();

    bool isProcessing() const;

    int getThreadCount() const;
    void setThreadCount(int count);

private:
    std::unique_ptr<DocumentCorrection> corrector_;
    std::atomic<bool> cancel_flag_;
    std::atomic<bool> processing_;
    int thread_count_;
    std::mutex mutex_;

    BatchResult processSingle(const std::string& input_path, const std::string& output_dir);

    BatchResult processSingle(const cv::Mat& image, int index);

    static std::string generateOutputPath(const std::string& input_path,
                                           const std::string& output_dir);
};

}

#endif
