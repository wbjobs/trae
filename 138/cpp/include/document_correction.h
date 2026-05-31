#ifndef DOCUMENT_CORRECTION_H
#define DOCUMENT_CORRECTION_H

#include "common.h"
#include "document_detector.h"
#include "perspective_transformer.h"
#include <memory>
#include <string>

namespace doc_correction {

class ShadowRemoverImpl;

class DocumentCorrection {
public:
    DocumentCorrection();
    ~DocumentCorrection();

    bool init(const std::string& model_dir, const CorrectionOptions& options = CorrectionOptions());

    CorrectionResult correct(const cv::Mat& image);

    CorrectionResult correct(const std::string& image_path);

    bool correct(const cv::Mat& image, const std::string& output_path);

    bool isInitialized() const;

    void setOptions(const CorrectionOptions& options);

    const CorrectionOptions& getOptions() const;

    static cv::Mat removeShadow(const cv::Mat& image, const ShadowRemovalOptions& options);

private:
    std::unique_ptr<DocumentDetector> detector_;
    std::unique_ptr<PerspectiveTransformer> transformer_;
    std::unique_ptr<ShadowRemoverImpl> shadow_remover_;
    CorrectionOptions options_;
    bool initialized_;
};

}

#endif
