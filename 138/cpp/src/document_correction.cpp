#include "document_correction.h"
#include <algorithm>
#include <cmath>
#include <thread>
#include <vector>

namespace doc_correction {

class ShadowRemoverImpl {
public:
    static cv::Mat fastGaussianBlur(const cv::Mat& src, float sigma) {
        int ksize = static_cast<int>(sigma * 3.0f) * 2 + 1;
        ksize = std::max(3, ksize | 1);

        if (ksize <= 7) {
            cv::Mat dst;
            cv::GaussianBlur(src, dst, cv::Size(ksize, ksize), sigma, sigma);
            return dst;
        }

        return boxBlur(src, ksize);
    }

    static cv::Mat boxBlur(const cv::Mat& src, int ksize) {
        cv::Mat dst;
        if (src.channels() == 1) {
            boxBlurChannel(src, dst, ksize);
        } else {
            std::vector<cv::Mat> channels;
            cv::split(src, channels);
            for (auto& ch : channels) {
                cv::Mat blurred;
                boxBlurChannel(ch, blurred, ksize);
                ch = blurred;
            }
            cv::merge(channels, dst);
        }
        return dst;
    }

    static void boxBlurChannel(const cv::Mat& src, cv::Mat& dst, int ksize) {
        int rows = src.rows;
        int cols = src.cols;
        int half = ksize / 2;

        dst = cv::Mat::zeros(rows, cols, src.type());
        cv::Mat row_blur = cv::Mat::zeros(rows, cols, CV_32F);

        for (int y = 0; y < rows; y++) {
            float sum = 0.0f;
            int count = 0;
            const uchar* src_row = src.ptr<uchar>(y);

            for (int x = -half; x < half; x++) {
                if (x >= 0 && x < cols) {
                    sum += src_row[x];
                    count++;
                }
            }

            for (int x = 0; x < cols; x++) {
                if (x + half < cols) {
                    sum += src_row[x + half];
                    count++;
                }
                if (x - half - 1 >= 0) {
                    sum -= src_row[x - half - 1];
                    count--;
                }
                row_blur.ptr<float>(y)[x] = sum / std::max(1, count);
            }
        }

        for (int x = 0; x < cols; x++) {
            float sum = 0.0f;
            int count = 0;

            for (int y = -half; y < half; y++) {
                if (y >= 0 && y < rows) {
                    sum += row_blur.ptr<float>(y)[x];
                    count++;
                }
            }

            for (int y = 0; y < rows; y++) {
                if (y + half < rows) {
                    sum += row_blur.ptr<float>(y + half)[x];
                    count++;
                }
                if (y - half - 1 >= 0) {
                    sum -= row_blur.ptr<float>(y - half - 1)[x];
                    count--;
                }
                dst.ptr<uchar>(y)[x] = cv::saturate_cast<uchar>(sum / std::max(1, count));
            }
        }
    }

    static cv::Mat removeShadow(const cv::Mat& image, const ShadowRemovalOptions& options) {
        if (image.empty() || options.type == ShadowRemovalType::NONE) {
            return image.clone();
        }

        bool is_color = (image.channels() == 3);
        cv::Mat gray;

        if (is_color) {
            cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
        } else {
            gray = image.clone();
        }

        cv::Mat result_gray;

        switch (options.type) {
            case ShadowRemovalType::FAST_SSR:
                result_gray = fastSSR(gray, options.sigma, options.gain, options.offset);
                break;

            case ShadowRemovalType::SIMPLE_MSR:
                result_gray = simpleMSR(gray, {15.0f, options.sigma, 250.0f},
                                       options.gain, options.offset);
                break;

            case ShadowRemovalType::ADAPTIVE:
                result_gray = adaptiveRetinex(gray, options.sigma);
                break;

            default:
                return image.clone();
        }

        if (is_color) {
            cv::Mat result;
            cv::cvtColor(result_gray, result, cv::COLOR_GRAY2BGR);

            if (options.preserve_color) {
                preserveColorRatio(image, result);
            }

            return result;
        }

        return result_gray;
    }

private:
    static cv::Mat fastSSR(const cv::Mat& gray, float sigma,
                           float gain, float offset) {
        cv::Mat log_gray = logTransform(gray);
        cv::Mat blurred = fastGaussianBlur(gray, sigma);
        cv::Mat log_blur = logTransform(blurred);
        cv::Mat retinex = log_gray - log_blur;

        normalizeImage(retinex);

        cv::Mat result_gray;
        retinex.convertTo(result_gray, CV_8U);

        if (gain != 1.0f || offset != 0.0f) {
            result_gray.convertTo(result_gray, -1, gain, offset);
        }

        return result_gray;
    }

    static cv::Mat simpleMSR(const cv::Mat& gray,
                             const std::vector<float>& sigmas,
                             float gain, float offset) {
        cv::Mat log_gray = logTransform(gray);
        cv::Mat sum_retinex = cv::Mat::zeros(gray.size(), CV_32F);

        for (float sigma : sigmas) {
            cv::Mat blurred = fastGaussianBlur(gray, sigma);
            cv::Mat log_blur = logTransform(blurred);
            sum_retinex += (log_gray - log_blur);
        }

        cv::Mat retinex = sum_retinex / static_cast<float>(sigmas.size());
        normalizeImage(retinex);

        cv::Mat result_gray;
        retinex.convertTo(result_gray, CV_8U);

        if (gain != 1.0f || offset != 0.0f) {
            result_gray.convertTo(result_gray, -1, gain, offset);
        }

        return result_gray;
    }

    static cv::Mat adaptiveRetinex(const cv::Mat& gray, float base_sigma) {
        cv::Scalar mean_scalar, std_scalar;
        cv::meanStdDev(gray, mean_scalar, std_scalar);
        double mean_val = mean_scalar[0];
        double std_dev = std_scalar[0];

        float sigma = base_sigma;
        float gain = 1.0f;

        if (std_dev < 30.0) {
            sigma = base_sigma * 0.6f;
            gain = 1.2f;
        } else if (std_dev > 70.0) {
            sigma = base_sigma * 1.3f;
            gain = 0.9f;
        }

        if (mean_val < 80.0) {
            gain *= 1.15f;
        } else if (mean_val > 180.0) {
            gain *= 0.9f;
        }

        return fastSSR(gray, sigma, gain, 0.0f);
    }

    static cv::Mat logTransform(const cv::Mat& src) {
        cv::Mat src_float;
        src.convertTo(src_float, CV_32F);
        src_float += 1.0f;

        cv::Mat log_img;
        cv::log(src_float, log_img);
        return log_img;
    }

    static void normalizeImage(cv::Mat& img) {
        double min_val, max_val;
        cv::minMaxLoc(img, &min_val, &max_val);

        if (max_val > min_val) {
            img = (img - min_val) / (max_val - min_val) * 255.0;
        }
    }

    static void preserveColorRatio(const cv::Mat& original, cv::Mat& processed) {
        if (original.channels() != 3 || processed.channels() != 3) {
            return;
        }

        std::vector<cv::Mat> orig_channels, proc_channels;
        cv::split(original, orig_channels);
        cv::split(processed, proc_channels);

        cv::Mat orig_gray, proc_gray;
        cv::cvtColor(original, orig_gray, cv::COLOR_BGR2GRAY);
        cv::cvtColor(processed, proc_gray, cv::COLOR_BGR2GRAY);

        orig_gray.convertTo(orig_gray, CV_32F);
        proc_gray.convertTo(proc_gray, CV_32F);
        orig_gray += 1.0f;
        proc_gray += 1.0f;

        for (int c = 0; c < 3; c++) {
            orig_channels[c].convertTo(orig_channels[c], CV_32F);
            proc_channels[c].convertTo(proc_channels[c], CV_32F);

            cv::Mat ratio = orig_channels[c] / orig_gray;
            proc_channels[c] = proc_gray.mul(ratio);

            proc_channels[c].convertTo(proc_channels[c], CV_8U);
        }

        cv::merge(proc_channels, processed);
    }
};

DocumentCorrection::DocumentCorrection()
    : detector_(std::make_unique<DocumentDetector>()),
      transformer_(std::make_unique<PerspectiveTransformer>()),
      initialized_(false) {}

DocumentCorrection::~DocumentCorrection() = default;

bool DocumentCorrection::init(const std::string& model_dir, const CorrectionOptions& options) {
    options_ = options;

    if (!model_dir.empty()) {
        initialized_ = detector_->init(model_dir, options.use_gpu);
    } else {
        initialized_ = detector_->init("", options.use_gpu);
    }

    if (initialized_) {
        detector_->setConfidenceThreshold(options.confidence_threshold);
    }

    return initialized_;
}

cv::Mat DocumentCorrection::removeShadow(const cv::Mat& image, const ShadowRemovalOptions& options) {
    return ShadowRemoverImpl::removeShadow(image, options);
}

CorrectionResult DocumentCorrection::correct(const cv::Mat& image) {
    CorrectionResult result;

    if (!initialized_) {
        result.success = false;
        result.error_message = "SDK not initialized";
        return result;
    }

    if (image.empty()) {
        result.success = false;
        result.error_message = "Input image is empty";
        return result;
    }

    try {
        cv::Mat processed_image = image;

        if (options_.shadow_removal.type != ShadowRemovalType::NONE) {
            processed_image = ShadowRemoverImpl::removeShadow(image, options_.shadow_removal);
        }

        Corners corners;
        float confidence = 0.0f;

        if (!detector_->detect(processed_image, corners, confidence)) {
            result.success = false;
            result.error_message = "Failed to detect document corners";
            return result;
        }

        result.corners = corners;

        if (!corners.isValid()) {
            result.success = false;
            result.error_message = "Invalid corners detected";
            return result;
        }

        result.corrected_image = transformer_->transform(processed_image, corners, options_);

        if (result.corrected_image.empty()) {
            result.success = false;
            result.error_message = "Failed to transform image";
            return result;
        }

        result.success = true;
        return result;
    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = std::string("Exception: ") + e.what();
        return result;
    } catch (...) {
        result.success = false;
        result.error_message = "Unknown exception";
        return result;
    }
}

CorrectionResult DocumentCorrection::correct(const std::string& image_path) {
    cv::Mat image = cv::imread(image_path, cv::IMREAD_COLOR);
    return correct(image);
}

bool DocumentCorrection::correct(const cv::Mat& image, const std::string& output_path) {
    CorrectionResult result = correct(image);
    if (!result.success) {
        return false;
    }
    return cv::imwrite(output_path, result.corrected_image);
}

bool DocumentCorrection::isInitialized() const {
    return initialized_;
}

void DocumentCorrection::setOptions(const CorrectionOptions& options) {
    options_ = options;
    if (detector_) {
        detector_->setConfidenceThreshold(options.confidence_threshold);
    }
}

const CorrectionOptions& DocumentCorrection::getOptions() const {
    return options_;
}

}
