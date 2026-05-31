#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include "document_correction.h"
#include "batch_processor.h"

using namespace doc_correction;

void printUsage(const char* programName) {
    std::cout << "Usage: " << programName << " <command> [options]" << std::endl;
    std::cout << "Commands:" << std::endl;
    std::cout << "  single <input_image> <output_image> [model_dir]" << std::endl;
    std::cout << "  batch <input_list_file> <output_dir> [model_dir]" << std::endl;
    std::cout << "  detect <input_image> [model_dir]" << std::endl;
    std::cout << std::endl;
    std::cout << "Examples:" << std::endl;
    std::cout << "  " << programName << " single input.jpg output.jpg" << std::endl;
    std::cout << "  " << programName << " batch list.txt output/" << std::endl;
}

int singleCorrection(const std::string& inputPath, const std::string& outputPath,
                     const std::string& modelDir) {
    std::cout << "Processing single image..." << std::endl;
    std::cout << "Input: " << inputPath << std::endl;
    std::cout << "Output: " << outputPath << std::endl;

    CorrectionOptions options;
    options.target_width = 1080;
    options.target_height = 1920;
    options.keep_aspect_ratio = true;
    options.padding = 20;
    options.confidence_threshold = 0.5f;

    DocumentCorrection corrector;
    if (!corrector.init(modelDir, options)) {
        std::cerr << "Failed to initialize DocumentCorrection" << std::endl;
        return -1;
    }

    std::cout << "SDK initialized successfully" << std::endl;

    cv::Mat image = cv::imread(inputPath, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Failed to read image: " << inputPath << std::endl;
        return -1;
    }

    std::cout << "Image loaded: " << image.cols << "x" << image.rows << std::endl;

    CorrectionResult result = corrector.correct(image);

    if (!result.success) {
        std::cerr << "Correction failed: " << result.error_message << std::endl;
        return -1;
    }

    std::cout << "Correction successful!" << std::endl;
    std::cout << "Detected corners:" << std::endl;
    std::cout << "  Top Left: (" << result.corners.top_left.x << ", "
              << result.corners.top_left.y << ")" << std::endl;
    std::cout << "  Top Right: (" << result.corners.top_right.x << ", "
              << result.corners.top_right.y << ")" << std::endl;
    std::cout << "  Bottom Right: (" << result.corners.bottom_right.x << ", "
              << result.corners.bottom_right.y << ")" << std::endl;
    std::cout << "  Bottom Left: (" << result.corners.bottom_left.x << ", "
              << result.corners.bottom_left.y << ")" << std::endl;
    std::cout << "Output size: " << result.corrected_image.cols << "x"
              << result.corrected_image.rows << std::endl;

    if (cv::imwrite(outputPath, result.corrected_image)) {
        std::cout << "Saved to: " << outputPath << std::endl;
        return 0;
    } else {
        std::cerr << "Failed to save output image" << std::endl;
        return -1;
    }
}

int batchCorrection(const std::string& listFile, const std::string& outputDir,
                    const std::string& modelDir) {
    std::cout << "Processing batch images..." << std::endl;
    std::cout << "List file: " << listFile << std::endl;
    std::cout << "Output directory: " << outputDir << std::endl;

    std::vector<std::string> inputPaths;
    std::ifstream file(listFile);
    if (!file.is_open()) {
        std::cerr << "Failed to open list file: " << listFile << std::endl;
        return -1;
    }

    std::string line;
    while (std::getline(file, line)) {
        if (!line.empty()) {
            inputPaths.push_back(line);
        }
    }
    file.close();

    std::cout << "Found " << inputPaths.size() << " images to process" << std::endl;

    CorrectionOptions options;
    options.target_width = 1080;
    options.target_height = 1920;
    options.keep_aspect_ratio = true;
    options.padding = 20;
    options.confidence_threshold = 0.5f;

    BatchProcessor processor;
    if (!processor.init(modelDir, options)) {
        std::cerr << "Failed to initialize BatchProcessor" << std::endl;
        return -1;
    }

    processor.setThreadCount(4);
    std::cout << "Batch processor initialized with " << processor.getThreadCount()
              << " threads" << std::endl;

    int successCount = 0;
    int failedCount = 0;

    auto callback = [&](int current, int total, const BatchResult& result) {
        std::cout << "[" << current << "/" << total << "] ";
        if (result.success) {
            std::cout << "SUCCESS: " << result.output_path << std::endl;
            successCount++;
        } else {
            std::cout << "FAILED: " << result.input_path
                      << " - " << result.error_message << std::endl;
            failedCount++;
        }
    };

    std::vector<BatchResult> results = processor.process(inputPaths, outputDir, callback);

    std::cout << std::endl << "Batch processing completed!" << std::endl;
    std::cout << "Total: " << results.size() << ", Success: " << successCount
              << ", Failed: " << failedCount << std::endl;

    return failedCount > 0 ? -1 : 0;
}

int detectCorners(const std::string& inputPath, const std::string& modelDir) {
    std::cout << "Detecting document corners..." << std::endl;
    std::cout << "Input: " << inputPath << std::endl;

    CorrectionOptions options;
    options.confidence_threshold = 0.5f;

    DocumentCorrection corrector;
    if (!corrector.init(modelDir, options)) {
        std::cerr << "Failed to initialize DocumentCorrection" << std::endl;
        return -1;
    }

    cv::Mat image = cv::imread(inputPath, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Failed to read image: " << inputPath << std::endl;
        return -1;
    }

    std::cout << "Image loaded: " << image.cols << "x" << image.rows << std::endl;

    CorrectionResult result = corrector.correct(image);

    if (!result.success) {
        std::cerr << "Detection failed: " << result.error_message << std::endl;
        return -1;
    }

    std::cout << "Detection successful!" << std::endl;
    std::cout << "Corners:" << std::endl;
    std::cout << "  Top Left: (" << result.corners.top_left.x << ", "
              << result.corners.top_left.y << ")" << std::endl;
    std::cout << "  Top Right: (" << result.corners.top_right.x << ", "
              << result.corners.top_right.y << ")" << std::endl;
    std::cout << "  Bottom Right: (" << result.corners.bottom_right.x << ", "
              << result.corners.bottom_right.y << ")" << std::endl;
    std::cout << "  Bottom Left: (" << result.corners.bottom_left.x << ", "
              << result.corners.bottom_left.y << ")" << std::endl;

    cv::Mat debugImage = image.clone();
    std::vector<cv::Point2f> pts = {
        cv::Point2f(result.corners.top_left.x, result.corners.top_left.y),
        cv::Point2f(result.corners.top_right.x, result.corners.top_right.y),
        cv::Point2f(result.corners.bottom_right.x, result.corners.bottom_right.y),
        cv::Point2f(result.corners.bottom_left.x, result.corners.bottom_left.y)
    };

    for (size_t i = 0; i < pts.size(); i++) {
        cv::circle(debugImage, pts[i], 8, cv::Scalar(0, 255, 0), -1);
        cv::line(debugImage, pts[i], pts[(i + 1) % 4], cv::Scalar(0, 255, 0), 3);
    }

    std::string debugPath = inputPath.substr(0, inputPath.find_last_of('.')) + "_corners.jpg";
    if (cv::imwrite(debugPath, debugImage)) {
        std::cout << "Debug image saved to: " << debugPath << std::endl;
    }

    return 0;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printUsage(argv[0]);
        return -1;
    }

    std::string command = argv[1];
    std::string modelDir = "";

    if (command == "single" && argc >= 4) {
        if (argc >= 5) modelDir = argv[4];
        return singleCorrection(argv[2], argv[3], modelDir);
    } else if (command == "batch" && argc >= 4) {
        if (argc >= 5) modelDir = argv[4];
        return batchCorrection(argv[2], argv[3], modelDir);
    } else if (command == "detect" && argc >= 3) {
        if (argc >= 4) modelDir = argv[3];
        return detectCorners(argv[2], modelDir);
    } else {
        printUsage(argv[0]);
        return -1;
    }
}
