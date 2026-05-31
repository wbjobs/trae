#include "buffer_cache.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace inference {

size_t MemoryPool::compute_exact_size(int32_t batch, int32_t height,
                                       int32_t width, bool use_fp16) {
    size_t element_size = use_fp16 ? 2 : 4;
    return static_cast<size_t>(batch) * 3 * height * width * element_size;
}

size_t MemoryPool::round_to_size_class(size_t exact_bytes, size_t& class_idx) {
    for (size_t i = 0; i < NUM_SIZE_CLASSES; ++i) {
        if (exact_bytes <= SIZE_CLASS_BYTES[i]) {
            class_idx = i;
            return SIZE_CLASS_BYTES[i];
        }
    }
    class_idx = NUM_SIZE_CLASSES - 1;
    return SIZE_CLASS_BYTES[NUM_SIZE_CLASSES - 1];
}

MemoryPool::MemoryPool(size_t max_total_bytes, size_t soft_watermark_bytes)
    : max_total_bytes_(max_total_bytes),
      soft_watermark_bytes_(soft_watermark_bytes) {}

MemoryPool::~MemoryPool() {
    clear();
}

size_t MemoryPool::find_size_class(size_t bytes) const {
    for (size_t i = 0; i < NUM_SIZE_CLASSES; ++i) {
        if (bytes <= SIZE_CLASS_BYTES[i]) return i;
    }
    return NUM_SIZE_CLASSES - 1;
}

void MemoryPool::allocate_slab(size_t class_idx) {
    size_t slab_bytes = SIZE_CLASS_BYTES[class_idx];
    if (total_allocated_ + slab_bytes > max_total_bytes_) {
        throw std::runtime_error(
            "MemoryPool: exceeded max_total_bytes limit (" +
            std::to_string(total_allocated_) + " + " +
            std::to_string(slab_bytes) + " > " +
            std::to_string(max_total_bytes_) + ")");
    }

    auto slab = std::make_unique<Slab>();
    slab->class_idx = class_idx;
    slab->slab_bytes = slab_bytes;
    slab->memory = static_cast<uint8_t*>(std::malloc(slab_bytes));
    if (!slab->memory) {
        throw std::runtime_error("MemoryPool: malloc failed for " +
                                 std::to_string(slab_bytes) + " bytes");
    }
    slab->in_use = false;
    slab->last_used = std::chrono::steady_clock::now();

    total_allocated_ += slab_bytes;
    free_slabs_[class_idx].push_back(slab.get());
    all_slabs_.push_back(std::move(slab));
}

void MemoryPool::free_slab(Slab* slab) {
    total_allocated_ -= slab->slab_bytes;
    free_slabs_[slab->class_idx].erase(
        std::remove(free_slabs_[slab->class_idx].begin(),
                    free_slabs_[slab->class_idx].end(), slab),
        free_slabs_[slab->class_idx].end());

    auto it = std::find_if(
        all_slabs_.begin(), all_slabs_.end(),
        [slab](const std::unique_ptr<Slab>& s) { return s.get() == slab; });
    if (it != all_slabs_.end()) {
        std::free((*it)->memory);
        all_slabs_.erase(it);
    }
}

void MemoryPool::try_evict_until_fit(size_t needed_bytes) {
    while (total_allocated_ + needed_bytes > soft_watermark_bytes_) {
        Slab* oldest = nullptr;
        auto oldest_time = std::chrono::steady_clock::time_point::max();

        for (size_t i = 0; i < NUM_SIZE_CLASSES; ++i) {
            for (auto* slab : free_slabs_[i]) {
                if (!slab->in_use && slab->last_used < oldest_time) {
                    oldest = slab;
                    oldest_time = slab->last_used;
                }
            }
        }

        if (!oldest) break;

        auto it = key_to_slab_.find(oldest->key);
        if (it != key_to_slab_.end()) {
            key_to_slab_.erase(it);
        }
        free_slab(oldest);
    }
}

BufferView MemoryPool::acquire(int32_t batch, int32_t height, int32_t width,
                                bool use_fp16, bool& cache_hit) {
    std::lock_guard<std::mutex> lock(mutex_);

    ShapeKey key{batch, height, width, use_fp16};
    auto it = key_to_slab_.find(key);

    if (it != key_to_slab_.end()) {
        Slab* slab = it->second;
        slab->in_use = true;
        slab->last_used = std::chrono::steady_clock::now();

        free_slabs_[slab->class_idx].erase(
            std::remove(free_slabs_[slab->class_idx].begin(),
                        free_slabs_[slab->class_idx].end(), slab),
            free_slabs_[slab->class_idx].end());

        total_used_ += slab->slab_bytes;
        cache_hit = true;

        BufferView view;
        view.data = slab->memory;
        view.size = slab->slab_bytes;
        view.class_idx = slab->class_idx;
        view.key = key;
        return view;
    }

    size_t exact_bytes = compute_exact_size(batch, height, width, use_fp16);
    size_t class_idx;
    size_t class_bytes = round_to_size_class(exact_bytes, class_idx);

    if (!free_slabs_[class_idx].empty()) {
        Slab* slab = free_slabs_[class_idx].back();
        free_slabs_[class_idx].pop_back();

        key_to_slab_.erase(slab->key);
        slab->key = key;
        slab->in_use = true;
        slab->last_used = std::chrono::steady_clock::now();

        key_to_slab_[key] = slab;
        total_used_ += slab->slab_bytes;
        cache_hit = true;

        BufferView view;
        view.data = slab->memory;
        view.size = slab->slab_bytes;
        view.class_idx = slab->class_idx;
        view.key = key;
        return view;
    }

    try_evict_until_fit(class_bytes);

    allocate_slab(class_idx);
    Slab* slab = free_slabs_[class_idx].back();
    free_slabs_[class_idx].pop_back();

    slab->key = key;
    slab->in_use = true;
    slab->last_used = std::chrono::steady_clock::now();

    key_to_slab_[key] = slab;
    total_used_ += slab->slab_bytes;
    cache_hit = false;

    BufferView view;
    view.data = slab->memory;
    view.size = slab->slab_bytes;
    view.class_idx = slab->class_idx;
    view.key = key;
    return view;
}

BufferView MemoryPool::acquire_raw(size_t exact_bytes, bool use_fp16,
                                    bool& cache_hit) {
    std::lock_guard<std::mutex> lock(mutex_);

    ShapeKey key{static_cast<int32_t>(exact_bytes), 0, 0, use_fp16};
    auto it = key_to_slab_.find(key);

    if (it != key_to_slab_.end()) {
        Slab* slab = it->second;
        slab->in_use = true;
        slab->last_used = std::chrono::steady_clock::now();

        free_slabs_[slab->class_idx].erase(
            std::remove(free_slabs_[slab->class_idx].begin(),
                        free_slabs_[slab->class_idx].end(), slab),
            free_slabs_[slab->class_idx].end());

        total_used_ += slab->slab_bytes;
        cache_hit = true;

        BufferView view;
        view.data = slab->memory;
        view.size = slab->slab_bytes;
        view.class_idx = slab->class_idx;
        view.key = key;
        return view;
    }

    size_t class_idx;
    size_t class_bytes = round_to_size_class(exact_bytes, class_idx);

    if (!free_slabs_[class_idx].empty()) {
        Slab* slab = free_slabs_[class_idx].back();
        free_slabs_[class_idx].pop_back();

        key_to_slab_.erase(slab->key);
        slab->key = key;
        slab->in_use = true;
        slab->last_used = std::chrono::steady_clock::now();

        key_to_slab_[key] = slab;
        total_used_ += slab->slab_bytes;
        cache_hit = true;

        BufferView view;
        view.data = slab->memory;
        view.size = slab->slab_bytes;
        view.class_idx = slab->class_idx;
        view.key = key;
        return view;
    }

    try_evict_until_fit(class_bytes);

    allocate_slab(class_idx);
    Slab* slab = free_slabs_[class_idx].back();
    free_slabs_[class_idx].pop_back();

    slab->key = key;
    slab->in_use = true;
    slab->last_used = std::chrono::steady_clock::now();

    key_to_slab_[key] = slab;
    total_used_ += slab->slab_bytes;
    cache_hit = false;

    BufferView view;
    view.data = slab->memory;
    view.size = slab->slab_bytes;
    view.class_idx = slab->class_idx;
    view.key = key;
    return view;
}

void MemoryPool::release(const ShapeKey& key) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = key_to_slab_.find(key);
    if (it == key_to_slab_.end()) return;

    Slab* slab = it->second;
    if (!slab->in_use) return;

    slab->in_use = false;
    slab->last_used = std::chrono::steady_clock::now();

    free_slabs_[slab->class_idx].push_back(slab);
    total_used_ -= slab->slab_bytes;
}

void MemoryPool::clear() {
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto& slab : all_slabs_) {
        std::free(slab->memory);
    }
    all_slabs_.clear();
    key_to_slab_.clear();
    for (auto& vec : free_slabs_) {
        vec.clear();
    }
    total_allocated_ = 0;
    total_used_ = 0;
}

void MemoryPool::compact() {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<Slab*> to_free;
    for (auto& slab : all_slabs_) {
        if (!slab->in_use && total_allocated_ > soft_watermark_bytes_) {
            to_free.push_back(slab.get());
        }
    }

    for (auto* slab : to_free) {
        auto it = key_to_slab_.find(slab->key);
        if (it != key_to_slab_.end()) {
            key_to_slab_.erase(it);
        }
        free_slab(slab);
    }
}

size_t MemoryPool::total_allocated_bytes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return total_allocated_;
}

size_t MemoryPool::total_used_bytes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return total_used_;
}

size_t MemoryPool::num_slabs() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return all_slabs_.size();
}

BufferCache::BufferCache(size_t max_total_bytes, size_t soft_watermark_bytes)
    : pool_(max_total_bytes, soft_watermark_bytes) {}

BufferCache::~BufferCache() = default;

BufferView BufferCache::acquire(int32_t batch, int32_t height, int32_t width,
                                 bool use_fp16, bool& cache_hit) {
    return pool_.acquire(batch, height, width, use_fp16, cache_hit);
}

BufferView BufferCache::acquire_raw(size_t exact_bytes, bool use_fp16,
                                     bool& cache_hit) {
    return pool_.acquire_raw(exact_bytes, use_fp16, cache_hit);
}

void BufferCache::release(const ShapeKey& key) {
    pool_.release(key);
}

void BufferCache::clear() {
    pool_.clear();
}

void BufferCache::compact() {
    pool_.compact();
}

size_t BufferCache::total_allocated_bytes() const {
    return pool_.total_allocated_bytes();
}

}  // namespace inference
