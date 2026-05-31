package cache

import (
	"rtsp-hls-server/internal/index"
	"sync"
	"time"
)

type MemoryCache struct {
	entries   []index.IndexEntry
	mu        sync.RWMutex
	retention time.Duration
}

func NewMemoryCache(retention time.Duration) *MemoryCache {
	cache := &MemoryCache{
		entries:   make([]index.IndexEntry, 0),
		retention: retention,
	}

	go cache.cleanup()

	return cache
}

func (c *MemoryCache) Add(entry index.IndexEntry) {
	c.mu.Lock()
	c.entries = append(c.entries, entry)
	c.mu.Unlock()
}

func (c *MemoryCache) FindByTimestamp(targetTime time.Time) *index.IndexEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(c.entries) == 0 {
		return nil
	}

	targetUnix := targetTime.UnixNano()

	left, right := 0, len(c.entries)
	for left < right {
		mid := (left + right) / 2
		if c.entries[mid].Timestamp <= targetUnix {
			left = mid + 1
		} else {
			right = mid
		}
	}

	if left > 0 {
		result := c.entries[left-1]
		return &result
	}

	return nil
}

func (c *MemoryCache) FindLatest() *index.IndexEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(c.entries) == 0 {
		return nil
	}

	result := c.entries[len(c.entries)-1]
	return &result
}

func (c *MemoryCache) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.purgeOldEntries()
	}
}

func (c *MemoryCache) purgeOldEntries() {
	c.mu.Lock()
	defer c.mu.Unlock()

	cutoff := time.Now().Add(-c.retention).UnixNano()

	idx := 0
	for i := range c.entries {
		if c.entries[i].Timestamp >= cutoff {
			idx = i
			break
		}
	}

	if idx > 0 {
		c.entries = c.entries[idx:]
	}
}

func (c *MemoryCache) Warmup(entries []index.IndexEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	cutoff := time.Now().Add(-c.retention).UnixNano()

	for i := range entries {
		if entries[i].Timestamp >= cutoff {
			c.entries = append(c.entries, entries[i])
		}
	}
}

func (c *MemoryCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}
