#ifndef LSTM_CLASSIFIER_H
#define LSTM_CLASSIFIER_H

#include <string>
#include <vector>
#include <deque>
#include <memory>
#include <tensorflow/lite/interpreter.h>
#include <tensorflow/lite/model.h>
#include "config_parser.h"

struct LSTMInput {
    std::vector<std::vector<float>> sequences;
};

struct LSTMOutput {
    float fall_probability;
    float normal_probability;
    bool is_fall;
};

class LSTMClassifier {
public:
    explicit LSTMClassifier(const LSTMConfig& config);
    ~LSTMClassifier();
    
    bool initialize();
    void addKeypointSequence(const std::vector<float>& keypoints);
    bool isReady() const;
    LSTMOutput predict();
    void reset();

private:
    LSTMConfig config_;
    std::unique_ptr<tflite::FlatBufferModel> model_;
    std::unique_ptr<tflite::Interpreter> interpreter_;
    std::deque<std::vector<float>> sequence_buffer_;
    bool initialized_;
    
    std::vector<float> prepareInput();
    static float sigmoid(float x);
};

#endif
