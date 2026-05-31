#ifndef MULTI_CAMERA_CAPTURE_H
#define MULTI_CAMERA_CAPTURE_H

#include <vector>
#include <string>
#include <memory>
#include <thread>
#include <mutex>
#include <atomic>
#include <queue>
#include <condition_variable>
#include <opencv2/opencv.hpp>
#include "config_parser.h"

struct CameraFrame {
    cv::Mat frame;
    int camera_id;
    std::string camera_name;
    double timestamp;
    bool valid;
};

class MultiCameraCapture {
public:
    explicit MultiCameraCapture(const std::vector<CameraConfig>& configs);
    ~MultiCameraCapture();
    
    bool initialize();
    void start();
    void stop();
    bool isRunning() const;
    
    std::vector<CameraFrame> getSynchronizedFrames(int timeout_ms = 1000);
    size_t getCameraCount() const { return configs_.size(); }
    
    cv::Mat createMosaicView(const std::vector<CameraFrame>& frames, int max_cols = 2);

private:
    std::vector<CameraConfig> configs_;
    std::vector<std::unique_ptr<cv::VideoCapture>> captures_;
    std::vector<std::thread> capture_threads_;
    std::vector<std::queue<CameraFrame>> frame_queues_;
    std::vector<std::mutex> queue_mutexes_;
    std::vector<std::condition_variable> queue_cvs_;
    
    std::atomic<bool> running_;
    size_t queue_size_ = 5;
    
    void captureWorker(size_t camera_index);
    CameraFrame getLatestFrame(size_t camera_index, int timeout_ms);
};

#endif
