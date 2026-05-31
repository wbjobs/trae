#include "access_predictor.h"

#include <algorithm>

namespace inference {

AccessPatternPredictor::AccessPatternPredictor(size_t window_size,
                                                 size_t lookahead)
    : window_size_(window_size), lookahead_(lookahead) {}

void AccessPatternPredictor::record_access(int32_t shard_id,
                                            double current_time_ms) {
    std::lock_guard<std::mutex> lock(mutex_);

    ShardAccess access{shard_id, current_time_ms};
    access_window_.push_back(access);

    if (access_window_.size() > window_size_) {
        access_window_.pop_front();
    }

    auto& stats = shard_stats_[shard_id];
    if (stats.last_time_ms > 0) {
        stats.total_interval_ms += (current_time_ms - stats.last_time_ms);
    }
    stats.last_time_ms = current_time_ms;
    stats.count++;

    if (access_window_.size() >= 2) {
        int32_t prev_shard = access_window_[access_window_.size() - 2].shard_id;
        if (prev_shard != shard_id) {
            shard_stats_[prev_shard].transition_counts[shard_id]++;
        }
    }
}

std::vector<int32_t> AccessPatternPredictor::predict_next_shards(
    int32_t current_shard_id, size_t top_k) const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<std::pair<int32_t, uint64_t>> candidates;

    auto it = shard_stats_.find(current_shard_id);
    if (it != shard_stats_.end()) {
        for (const auto& [next_shard, count] : it->second.transition_counts) {
            candidates.emplace_back(next_shard, count);
        }
    }

    for (const auto& [shard_id, stats] : shard_stats_) {
        if (shard_id == current_shard_id) continue;
        bool in_transitions = false;
        for (const auto& [c, _] : candidates) {
            if (c == shard_id) {
                in_transitions = true;
                break;
            }
        }
        if (!in_transitions && stats.count > 0) {
            double avg_interval = stats.last_time_ms > 0
                                      ? stats.total_interval_ms / stats.count
                                      : 1e9;
            candidates.emplace_back(shard_id,
                                    static_cast<uint64_t>(1.0 / (avg_interval + 1) * 1000));
        }
    }

    std::sort(candidates.begin(), candidates.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });

    std::vector<int32_t> result;
    for (size_t i = 0; i < std::min(top_k, candidates.size()); ++i) {
        result.push_back(candidates[i].first);
    }

    return result;
}

std::vector<AccessPattern> AccessPatternPredictor::get_patterns() const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<AccessPattern> patterns;
    for (const auto& [shard_id, stats] : shard_stats_) {
        AccessPattern p;
        p.shard_id = shard_id;
        p.access_count = stats.count;
        p.avg_interval_ms =
            stats.count > 1 ? stats.total_interval_ms / (stats.count - 1) : 0;
        p.last_access_time_ms = stats.last_time_ms;
        patterns.push_back(p);
    }

    std::sort(patterns.begin(), patterns.end(),
              [](const AccessPattern& a, const AccessPattern& b) {
                  return a.access_count > b.access_count;
              });

    return patterns;
}

void AccessPatternPredictor::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    access_window_.clear();
    shard_stats_.clear();
}

}  // namespace inference
