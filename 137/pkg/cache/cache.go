package cache

import (
	"fmt"
	"time"

	"github.com/patrickmn/go-cache"
	"github.com/prometheus/common/model"
)

type Service struct {
	cache      *cache.Cache
	enabled    bool
	defaultTTL time.Duration
}

type CacheKey struct {
	Query      string
	Start      time.Time
	End        time.Time
	Step       time.Duration
	Granularity string
}

func (k CacheKey) String() string {
	return fmt.Sprintf("%s|%d|%d|%d|%s",
		k.Query,
		k.Start.Unix(),
		k.End.Unix(),
		k.Seconds(),
		k.Granularity,
	)
}

func (k CacheKey) Seconds() int64 {
	return int64(k.Step.Seconds())
}

type CachedResult struct {
	Data       []model.SampleStream
	QueryTime  time.Time
	Downsampled bool
	Granularity string
}

func NewService(enabled bool, defaultTTL time.Duration, maxItems int) *Service {
	c := cache.New(defaultTTL, 10*time.Minute)
	return &Service{
		cache:      c,
		enabled:    enabled,
		defaultTTL: defaultTTL,
	}
}

func (s *Service) Get(key CacheKey) (*CachedResult, bool) {
	if !s.enabled {
		return nil, false
	}

	if value, found := s.cache.Get(key.String()); found {
		if result, ok := value.(*CachedResult); ok {
			return result, true
		}
	}
	return nil, false
}

func (s *Service) Set(key CacheKey, result *CachedResult) {
	if !s.enabled {
		return
	}

	s.cache.Set(key.String(), result, s.defaultTTL)
}

func (s *Service) SetWithTTL(key CacheKey, result *CachedResult, ttl time.Duration) {
	if !s.enabled {
		return
	}

	s.cache.Set(key.String(), result, ttl)
}

func (s *Service) Delete(key CacheKey) {
	s.cache.Delete(key.String())
}

func (s *Service) Clear() {
	s.cache.Flush()
}

func (s *Service) ItemCount() int {
	return s.cache.ItemCount()
}

func (s *Service) Enabled() bool {
	return s.enabled
}
