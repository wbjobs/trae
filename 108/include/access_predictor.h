#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace inference {

struct AccessPattern {
    int32_t shard_id;
    uint64_t access_count;
    double avg_interval_ms;
    double last_access_time_ms;
};

class AccessPatternPredictor {
public:
    explicit AccessPatternPredictor(size_t window_size = 64,
                                    size_t lookahead = 2);

    void record_access(int32_t shard_id, double current_time_ms);

    std::vector<int32_t> predict_next_shards(int32_t current_shard_id,
                                             size_t top_k = 2) const;

    std::vector<AccessPattern> get_patterns() const;

    void clear();

private:
    struct ShardAccess {
        int32_t shard_id;
        double timestamp_ms;
    };

    struct ShardStats {
        uint64_t count = 0;
        double last_time_ms = 0;
        double total_interval_ms = 0;
        std::unordered_map<int32_t, uint64_t> transition_counts;
    };

    mutable std::mutex mutex_;
    size_t window_size_;
    size_t lookahead_;
    std::deque<ShardAccess> access_window_;
    std::unordered_map<int32_t, ShardStats> shard_stats_;
};

}  // namespace inference
