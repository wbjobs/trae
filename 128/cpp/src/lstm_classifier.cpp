#include "lstm_classifier.h"
#include <stdexcept>
#include <cmath>
#include <tensorflow/lite/kernels/register.h>
#include <tensorflow/lite/builtin_op_data.h>

LSTMClassifier::LSTMClassifier(const LSTMConfig& config)
    : config_(config), initialized_(false) {}

LSTMClassifier::~LSTMClassifier() {}

bool LSTMClassifier::initialize() {
    try {
        model_ = tflite::FlatBufferModel::BuildFromFile(config_.model_path.c_str());
        if (!model_) {
            return false;
        }
        
        tflite::ops::builtin::BuiltinOpResolver resolver;
        tflite::InterpreterBuilder builder(*model_, resolver);
        
        if (builder(&interpreter_) != kTfLiteOk) {
            return false;
        }
        
        if (interpreter_->AllocateTensors() != kTfLiteOk) {
            return false;
        }
        
        int input_size = config_.sequence_length * config_.num_keypoints * config_.num_features;
        int expected_input = interpreter_->input_tensor(0)->dims->data[0] * 
                            interpreter_->input_tensor(0)->dims->data[1] * 
                            interpreter_->input_tensor(0)->dims->data[2];
        
        if (expected_input != input_size) {
            return false;
        }
        
        initialized_ = true;
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

void LSTMClassifier::addKeypointSequence(const std::vector<float>& keypoints) {
    sequence_buffer_.push_back(keypoints);
    
    while (sequence_buffer_.size() > config_.sequence_length) {
        sequence_buffer_.pop_front();
    }
}

bool LSTMClassifier::isReady() const {
    return sequence_buffer_.size() >= config_.sequence_length;
}

std::vector<float> LSTMClassifier::prepareInput() {
    std::vector<float> input;
    input.reserve(config_.sequence_length * config_.num_keypoints * config_.num_features);
    
    for (const auto& seq : sequence_buffer_) {
        input.insert(input.end(), seq.begin(), seq.end());
    }
    
    return input;
}

float LSTMClassifier::sigmoid(float x) {
    return 1.0f / (1.0f + std::exp(-x));
}

LSTMOutput LSTMClassifier::predict() {
    LSTMOutput result;
    result.fall_probability = 0.0f;
    result.normal_probability = 1.0f;
    result.is_fall = false;
    
    if (!initialized_ || !isReady()) {
        return result;
    }
    
    try {
        std::vector<float> input_data = prepareInput();
        
        float* input_ptr = interpreter_->typed_input_tensor<float>(0);
        std::copy(input_data.begin(), input_data.end(), input_ptr);
        
        if (interpreter_->Invoke() != kTfLiteOk) {
            return result;
        }
        
        float* output_ptr = interpreter_->typed_output_tensor<float>(0);
        int output_size = interpreter_->output_tensor(0)->dims->data[1];
        
        if (output_size >= 2) {
            result.fall_probability = sigmoid(output_ptr[1]);
            result.normal_probability = sigmoid(output_ptr[0]);
        } else if (output_size >= 1) {
            result.fall_probability = sigmoid(output_ptr[0]);
            result.normal_probability = 1.0f - result.fall_probability;
        }
        
        result.is_fall = result.fall_probability >= config_.threshold;
        
    } catch (const std::exception& e) {
        result.is_fall = false;
    }
    
    return result;
}

void LSTMClassifier::reset() {
    sequence_buffer_.clear();
}
