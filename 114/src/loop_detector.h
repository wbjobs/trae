#pragma once

#include "types.h"
#include <vector>
#include <unordered_map>
#include <cstddef>

class LoopDetector {
public:
    explicit LoopDetector(size_t window_size = 2000,
                          size_t repeat_threshold = 0,
                          u64 no_side_effect_limit = 5000000);

    bool feed(u32 pc, bool has_side_effect);

    bool detected() const { return detected_; }
    u32 repeated_pc() const { return repeated_pc_; }
    size_t repeated_count() const { return repeated_count_; }
    u64 no_side_effect_streak() const { return no_side_effect_streak_; }

private:
    size_t window_size_;
    size_t repeat_threshold_;
    u64 no_side_effect_limit_;

    std::vector<u32> ring_;
    size_t ring_pos_;
    size_t ring_count_;

    std::unordered_map<u32, size_t> pc_counts_;

    u64 no_side_effect_streak_;
    bool detected_;
    u32 repeated_pc_;
    size_t repeated_count_;
};
