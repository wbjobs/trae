package dedup

import (
	"context"
	"sync"
	"time"
)

type Tracker struct {
	seen     map[string]time.Time
	mu       sync.RWMutex
	ttl      time.Duration
	stopCh   chan struct{}
	wg       sync.WaitGroup
	hitCount  int64
	missCount int64
}

func NewTracker(ttl time.Duration) *Tracker {
	return &Tracker{
		seen:   make(map[string]time.Time),
		ttl:    ttl,
		stopCh: make(chan struct{}),
	}
}

func (t *Tracker) Start(ctx context.Context) {
	t.wg.Add(1)
	go t.cleanupLoop(ctx)
}

func (t *Tracker) cleanupLoop(ctx context.Context) {
	defer t.wg.Done()

	interval := t.ttl / 2
	if interval < 1*time.Second {
		interval = 1 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.stopCh:
			return
		case <-ticker.C:
			t.cleanup()
		}
	}
}

func (t *Tracker) cleanup() {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-t.ttl)
	for id, ts := range t.seen {
		if ts.Before(cutoff) {
			delete(t.seen, id)
		}
	}
}

func (t *Tracker) TryMark(id string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, exists := t.seen[id]; exists {
		t.hitCount++
		return false
	}

	t.seen[id] = time.Now()
	t.missCount++
	return true
}

func (t *Tracker) IsSeen(id string) bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	_, exists := t.seen[id]
	return exists
}

func (t *Tracker) Mark(id string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.seen[id] = time.Now()
}

func (t *Tracker) Remove(id string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.seen, id)
}

func (t *Tracker) GetStats() (hitCount, missCount int64, size int) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.hitCount, t.missCount, len(t.seen)
}

func (t *Tracker) Clear() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.seen = make(map[string]time.Time)
	t.hitCount = 0
	t.missCount = 0
}

func (t *Tracker) Stop() {
	close(t.stopCh)
	t.wg.Wait()
}
