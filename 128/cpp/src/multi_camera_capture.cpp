#include "multi_camera_capture.h"
#include <chrono>
#include <iostream>
#include <algorithm>

MultiCameraCapture::MultiCameraCapture(const std::vector<CameraConfig>& configs)
    : configs_(configs), running_(false) {
    frame_queues_.resize(configs_.size());
    queue_mutexes_.resize(configs_.size());
    queue_cvs_.resize(configs_.size());
    captures_.resize(configs_.size());
}

MultiCameraCapture::~MultiCameraCapture() {
    stop();
}

bool MultiCameraCapture::initialize() {
    for (size_t i = 0; i < configs_.size(); ++i) {
        captures_[i] = std::make_unique<cv::VideoCapture>(configs_[i].id);
        if (!captures_[i]->isOpened()) {
            std::cerr << "Failed to open camera " << configs_[i].id 
                      << " (" << configs_[i].name << ")" << std::endl;
            return false;
        }
        
        captures_[i]->set(cv::CAP_PROP_FRAME_WIDTH, configs_[i].width);
        captures_[i]->set(cv::CAP_PROP_FRAME_HEIGHT, configs_[i].height);
        captures_[i]->set(cv::CAP_PROP_FPS, configs_[i].fps);
        captures_[i]->set(cv::CAP_PROP_BUFFERSIZE, 1);
        
        std::cout << "Initialized camera " << configs_[i].name 
                  << " (" << configs_[i].width << "x" << configs_[i].height 
                  << " @" << configs_[i].fps << "fps)" << std::endl;
    }
    return true;
}

void MultiCameraCapture::start() {
    running_ = true;
    for (size_t i = 0; i < configs_.size(); ++i) {
        capture_threads_.emplace_back(&MultiCameraCapture::captureWorker, this, i);
    }
}

void MultiCameraCapture::stop() {
    running_ = false;
    
    for (auto& cv : queue_cvs_) {
        cv.notify_all();
    }
    
    for (auto& thread : capture_threads_) {
        if (thread.joinable()) {
            thread.join();
        }
    }
    capture_threads_.clear();
    
    for (auto& capture : captures_) {
        if (capture && capture->isOpened()) {
            capture->release();
        }
    }
    captures_.clear();
}

bool MultiCameraCapture::isRunning() const {
    return running_;
}

void MultiCameraCapture::captureWorker(size_t camera_index) {
    auto& capture = captures_[camera_index];
    auto& queue = frame_queues_[camera_index];
    auto& mutex = queue_mutexes_[camera_index];
    auto& cv = queue_cvs_[camera_index];
    const auto& config = configs_[camera_index];
    
    while (running_) {
        cv::Mat frame;
        *capture >> frame;
        
        if (frame.empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }
        
        auto now = std::chrono::system_clock::now();
        auto timestamp = std::chrono::duration<double>(
            now.time_since_epoch()).count();
        
        CameraFrame camera_frame;
        camera_frame.frame = frame.clone();
        camera_frame.camera_id = config.id;
        camera_frame.camera_name = config.name;
        camera_frame.timestamp = timestamp;
        camera_frame.valid = true;
        
        {
            std::lock_guard<std::mutex> lock(mutex);
            while (queue.size() >= queue_size_) {
                queue.pop();
            }
            queue.push(camera_frame);
        }
        cv.notify_one();
    }
}

CameraFrame MultiCameraCapture::getLatestFrame(size_t camera_index, int timeout_ms) {
    auto& queue = frame_queues_[camera_index];
    auto& mutex = queue_mutexes_[camera_index];
    auto& cv = queue_cvs_[camera_index];
    
    std::unique_lock<std::mutex> lock(mutex);
    if (!cv.wait_for(lock, std::chrono::milliseconds(timeout_ms),
                     [&queue] { return !queue.empty(); })) {
        CameraFrame empty;
        empty.valid = false;
        return empty;
    }
    
    CameraFrame frame = queue.front();
    while (queue.size() > 1) {
        queue.pop();
    }
    return frame;
}

std::vector<CameraFrame> MultiCameraCapture::getSynchronizedFrames(int timeout_ms) {
    std::vector<CameraFrame> frames;
    frames.reserve(configs_.size());
    
    double target_time = std::chrono::duration<double>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    for (size_t i = 0; i < configs_.size(); ++i) {
        CameraFrame frame = getLatestFrame(i, timeout_ms);
        frames.push_back(frame);
    }
    
    return frames;
}

cv::Mat MultiCameraCapture::createMosaicView(const std::vector<CameraFrame>& frames, int max_cols) {
    if (frames.empty()) {
        return cv::Mat::zeros(480, 640, CV_8UC3);
    }
    
    int num_frames = frames.size();
    int cols = std::min(max_cols, num_frames);
    int rows = (num_frames + cols - 1) / cols;
    
    int frame_width = configs_[0].width;
    int frame_height = configs_[0].height;
    
    cv::Mat mosaic = cv::Mat::zeros(rows * frame_height, cols * frame_width, CV_8UC3);
    
    for (int i = 0; i < num_frames; ++i) {
        int row = i / cols;
        int col = i % cols;
        
        cv::Rect roi(col * frame_width, row * frame_height, frame_width, frame_height);
        cv::Mat target_roi = mosaic(roi);
        
        if (frames[i].valid && !frames[i].frame.empty()) {
            cv::Mat display_frame;
            if (frames[i].frame.channels() == 1) {
                cv::cvtColor(frames[i].frame, display_frame, cv::COLOR_GRAY2BGR);
            } else {
                display_frame = frames[i].frame.clone();
            }
            
            cv::putText(display_frame, frames[i].camera_name,
                       cv::Point(10, 30), cv::FONT_HERSHEY_SIMPLEX,
                       0.8, cv::Scalar(0, 255, 0), 2);
            
            display_frame.copyTo(target_roi);
        }
    }
    
    return mosaic;
}
