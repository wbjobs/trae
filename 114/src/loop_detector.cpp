#include "loop_detector.h"

LoopDetector::LoopDetector(size_t window_size,
                           size_t repeat_threshold,
                           u64 no_side_effect_limit)
    : window_size_(window_size)
    , repeat_threshold_(repeat_threshold == 0 ? window_size / 3 : repeat_threshold)
    , no_side_effect_limit_(no_side_effect_limit)
    , ring_(window_size, 0)
    , ring_pos_(0)
    , ring_count_(0)
    , no_side_effect_streak_(0)
    , detected_(false)
    , repeated_pc_(0)
    , repeated_count_(0)
{
}

bool LoopDetector::feed(u32 pc, bool has_side_effect) {
    if (detected_) return true;

    if (has_side_effect) {
        no_side_effect_streak_ = 0;
        pc_counts_.clear();
        ring_count_ = 0;
        ring_pos_ = 0;
        return false;
    }

    ++no_side_effect_streak_;

    if (ring_count_ >= window_size_) {
        u32 old_pc = ring_[ring_pos_];
        auto it = pc_counts_.find(old_pc);
        if (it != pc_counts_.end()) {
            if (--it->second == 0)
                pc_counts_.erase(it);
        }
    } else {
        ++ring_count_;
    }

    ring_[ring_pos_] = pc;
    ring_pos_ = (ring_pos_ + 1) % window_size_;

    size_t count = ++pc_counts_[pc];
    if (count > repeated_count_) {
        repeated_count_ = count;
        repeated_pc_ = pc;
    }

    if (count >= repeat_threshold_) {
        detected_ = true;
        return true;
    }

    if (no_side_effect_streak_ >= no_side_effect_limit_) {
        detected_ = true;
        repeated_pc_ = pc;
        repeated_count_ = count;
        return true;
    }

    return false;
}
