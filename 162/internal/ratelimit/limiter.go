package ratelimit

import (
	"context"
	"sync"

	"golang.org/x/time/rate"
)

type RateLimiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
	rate     rate.Limit
	burst    int
	enabled  bool
}

func New(rps float64, burst int, enabled bool) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rate:     rate.Limit(rps),
		burst:    burst,
		enabled:  enabled,
	}
}

func (rl *RateLimiter) getLimiter(key string) *rate.Limiter {
	rl.mu.RLock()
	limiter, exists := rl.limiters[key]
	rl.mu.RUnlock()

	if exists {
		return limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	limiter, exists = rl.limiters[key]
	if exists {
		return limiter
	}

	limiter = rate.NewLimiter(rl.rate, rl.burst)
	rl.limiters[key] = limiter
	return limiter
}

func (rl *RateLimiter) Allow(key string) bool {
	if !rl.enabled {
		return true
	}
	return rl.getLimiter(key).Allow()
}

func (rl *RateLimiter) Wait(ctx context.Context, key string) error {
	if !rl.enabled {
		return nil
	}
	return rl.getLimiter(key).Wait(ctx)
}

func (rl *RateLimiter) Reserve(key string) *Reservation {
	if !rl.enabled {
		return &Reservation{ok: true}
	}
	r := rl.getLimiter(key).Reserve()
	return &Reservation{r: r, ok: r.OK()}
}

type Reservation struct {
	r  rate.Reservation
	ok bool
}

func (r *Reservation) OK() bool { return r.ok }
func (r *Reservation) Cancel() {
	if r.ok {
		r.r.Cancel()
	}
}

func (rl *RateLimiter) SetRate(rps float64, burst int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.rate = rate.Limit(rps)
	rl.burst = burst
	for _, l := range rl.limiters {
		l.SetLimit(rl.rate)
		l.SetBurst(rl.burst)
	}
}

func (rl *RateLimiter) Enabled() bool {
	return rl.enabled
}

func (rl *RateLimiter) Purge() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.limiters = make(map[string]*rate.Limiter)
}
