#pragma once

#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace inference {

struct ShapeKey {
    int32_t batch;
    int32_t height;
    int32_t width;
    bool use_fp16;

    bool operator==(const ShapeKey& other) const {
        return batch == other.batch && height == other.height &&
               width == other.width && use_fp16 == other.use_fp16;
    }
};

struct ShapeKeyHash {
    std::size_t operator()(const ShapeKey& k) const {
        std::size_t h1 = std::hash<int32_t>{}(k.batch);
        std::size_t h2 = std::hash<int32_t>{}(k.height);
        std::size_t h3 = std::hash<int32_t>{}(k.width);
        std::size_t h4 = std::hash<bool>{}(k.use_fp16);
        return h1 ^ (h2 << 1) ^ (h3 << 2) ^ (h4 << 3);
    }
};

struct BufferView {
    uint8_t* data;
    size_t size;
    size_t class_idx;
    ShapeKey key;
};

class MemoryPool {
public:
    static constexpr size_t NUM_SIZE_CLASSES = 12;

    static constexpr std::array<size_t, NUM_SIZE_CLASSES> SIZE_CLASS_BYTES = {
        1ULL << 18,
        1ULL << 19,
        1ULL << 20,
        1ULL << 21,
        1ULL << 22,
        1ULL << 23,
        1ULL << 24,
        1ULL << 25,
        1ULL << 26,
        1ULL << 27,
        1ULL << 28,
        1ULL << 29,
    };

    explicit MemoryPool(size_t max_total_bytes = 8ULL << 30,
                        size_t soft_watermark_bytes = 6ULL << 30);
    ~MemoryPool();

    MemoryPool(const MemoryPool&) = delete;
    MemoryPool& operator=(const MemoryPool&) = delete;

    BufferView acquire(int32_t batch, int32_t height, int32_t width,
                       bool use_fp16, bool& cache_hit);
    BufferView acquire_raw(size_t exact_bytes, bool use_fp16, bool& cache_hit);
    void release(const ShapeKey& key);

    void clear();
    void compact();

    size_t total_allocated_bytes() const;
    size_t total_used_bytes() const;
    size_t num_slabs() const;

    static size_t compute_exact_size(int32_t batch, int32_t height,
                                     int32_t width, bool use_fp16);
    static size_t round_to_size_class(size_t exact_bytes, size_t& class_idx);

private:
    struct Slab {
        size_t class_idx;
        size_t slab_bytes;
        uint8_t* memory;
        ShapeKey key;
        bool in_use;
        std::chrono::steady_clock::time_point last_used;
    };

    size_t find_size_class(size_t bytes) const;
    void allocate_slab(size_t class_idx);
    void free_slab(Slab* slab);
    void try_evict_until_fit(size_t needed_bytes);

    mutable std::mutex mutex_;
    std::vector<std::unique_ptr<Slab>> all_slabs_;
    std::unordered_map<ShapeKey, Slab*, ShapeKeyHash> key_to_slab_;
    std::array<std::vector<Slab*>, NUM_SIZE_CLASSES> free_slabs_;

    size_t max_total_bytes_;
    size_t soft_watermark_bytes_;
    size_t total_allocated_ = 0;
    size_t total_used_ = 0;
};

class BufferCache {
public:
    BufferCache(size_t max_total_bytes = 8ULL << 30,
                size_t soft_watermark_bytes = 6ULL << 30);
    ~BufferCache();

    BufferCache(const BufferCache&) = delete;
    BufferCache& operator=(const BufferCache&) = delete;

    BufferView acquire(int32_t batch, int32_t height, int32_t width,
                       bool use_fp16, bool& cache_hit);
    BufferView acquire_raw(size_t exact_bytes, bool use_fp16, bool& cache_hit);
    void release(const ShapeKey& key);

    void clear();
    void compact();
    size_t total_allocated_bytes() const;

private:
    MemoryPool pool_;
};

}  // namespace inference
