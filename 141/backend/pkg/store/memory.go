package store

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

type InMemoryStore struct {
	mu       sync.RWMutex
	data     map[string][]byte
	versions map[string][]*StateVersion
	counter  map[string]int64
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		data:     make(map[string][]byte),
		versions: make(map[string][]*StateVersion),
		counter:  make(map[string]int64),
	}
}

func (s *InMemoryStore) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	val, ok := s.data[key]
	if !ok {
		return nil, errors.New("key not found")
	}
	return val, nil
}

func (s *InMemoryStore) Set(_ context.Context, key string, value []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.counter[key]++
	version := s.counter[key]

	sv := &StateVersion{
		Key:       key,
		Value:     make([]byte, len(value)),
		Version:   version,
		Timestamp: time.Now(),
	}
	copy(sv.Value, value)

	s.versions[key] = append(s.versions[key], sv)
	if len(s.versions[key]) > MaxVersions {
		s.versions[key] = s.versions[key][len(s.versions[key])-MaxVersions:]
	}

	s.data[key] = value
	return nil
}

func (s *InMemoryStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, key)
	return nil
}

func (s *InMemoryStore) BulkGet(_ context.Context, keys []string) (map[string][]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string][]byte)
	for _, key := range keys {
		if val, ok := s.data[key]; ok {
			result[key] = val
		}
	}
	return result, nil
}

func (s *InMemoryStore) BulkSet(_ context.Context, items map[string][]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for key, value := range items {
		s.counter[key]++
		version := s.counter[key]

		sv := &StateVersion{
			Key:       key,
			Value:     make([]byte, len(value)),
			Version:   version,
			Timestamp: time.Now(),
		}
		copy(sv.Value, value)

		s.versions[key] = append(s.versions[key], sv)
		if len(s.versions[key]) > MaxVersions {
			s.versions[key] = s.versions[key][len(s.versions[key])-MaxVersions:]
		}

		s.data[key] = value
	}
	return nil
}

func (s *InMemoryStore) BulkDelete(_ context.Context, keys []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, key := range keys {
		delete(s.data, key)
	}
	return nil
}

func (s *InMemoryStore) GetVersion(_ context.Context, key string, version int64) (*StateVersion, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	versions, ok := s.versions[key]
	if !ok {
		return nil, errors.New("key not found")
	}

	for _, v := range versions {
		if v.Version == version {
			result := &StateVersion{
				Key:       v.Key,
				Value:     make([]byte, len(v.Value)),
				Version:   v.Version,
				Timestamp: v.Timestamp,
			}
			copy(result.Value, v.Value)
			return result, nil
		}
	}

	return nil, errors.New("version not found")
}

func (s *InMemoryStore) GetVersionHistory(_ context.Context, key string) ([]*StateVersion, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	versions, ok := s.versions[key]
	if !ok {
		return nil, errors.New("key not found")
	}

	result := make([]*StateVersion, len(versions))
	for i, v := range versions {
		result[i] = &StateVersion{
			Key:       v.Key,
			Value:     make([]byte, len(v.Value)),
			Version:   v.Version,
			Timestamp: v.Timestamp,
		}
		copy(result[i].Value, v.Value)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Version > result[j].Version
	})

	return result, nil
}

func (s *InMemoryStore) GetAtTime(_ context.Context, key string, timestamp time.Time) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	versions, ok := s.versions[key]
	if !ok || len(versions) == 0 {
		return nil, errors.New("key not found")
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].Timestamp.Before(versions[j].Timestamp)
	})

	var result []byte
	for _, v := range versions {
		if v.Timestamp.Before(timestamp) || v.Timestamp.Equal(timestamp) {
			result = make([]byte, len(v.Value))
			copy(result, v.Value)
		} else {
			break
		}
	}

	if result == nil {
		return nil, errors.New("no version found at the specified time")
	}

	return result, nil
}

func (s *InMemoryStore) DeleteOldVersions(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.versions[key]; ok {
		s.versions[key] = s.versions[key][:0]
	}

	return nil
}

func (s *InMemoryStore) Close() error {
	return nil
}
