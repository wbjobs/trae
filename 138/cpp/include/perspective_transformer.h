#ifndef DOCUMENT_CORRECTION_TRANSFORMER_H
#define DOCUMENT_CORRECTION_TRANSFORMER_H

#include "common.h"

namespace doc_correction {

class PerspectiveTransformer {
public:
    PerspectiveTransformer();
    ~PerspectiveTransformer();

    cv::Mat transform(const cv::Mat& image, const Corners& corners,
                      const CorrectionOptions& options);

    static cv::Mat getTargetPoints(int width, int height, int padding = 0);

    static cv::Mat getPerspectiveMatrix(const Corners& src,
                                        const std::vector<cv::Point2f>& dst);

private:
    static int calculateTargetSize(const Corners& corners,
                                   const CorrectionOptions& options,
                                   int& out_width, int& out_height);

    static double distance(const Point2f& p1, const Point2f& p2);
};

}

#endif
