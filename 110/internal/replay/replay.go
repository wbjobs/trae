package replay

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"http-mirror/internal/config"
	"http-mirror/internal/stats"
)

type OriginalRequest struct {
	ID        string            `json:"id"`
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Headers   map[string]string `json:"headers"`
	BodyHash  string            `json:"body_hash"`
	Timestamp time.Time         `json:"timestamp"`
}

type ReplayResult struct {
	ID         string      `json:"id"`
	Matched    bool        `json:"matched"`
	ReceivedAt time.Time   `json:"received_at"`
	Diff       string      `json:"diff,omitempty"`
	ServerResp interface{} `json:"server_response,omitempty"`
}

type Store struct {
	requests sync.Map
	results  sync.Map
	cfg      *config.Config
	stats    *stats.Stats
}

func NewStore(cfg *config.Config, s *stats.Stats) *Store {
	return &Store{
		cfg:   cfg,
		stats: s,
	}
}

func GenerateID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating random ID: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func (s *Store) StoreRequest(method, path string, headers map[string]string, bodyHash string) (string, error) {
	id, err := GenerateID()
	if err != nil {
		return "", err
	}

	req := &OriginalRequest{
		ID:        id,
		Method:    method,
		Path:      path,
		Headers:   headers,
		BodyHash:  bodyHash,
		Timestamp: time.Now(),
	}

	s.requests.Store(id, req)
	return id, nil
}

func (s *Store) GetOriginalRequest(id string) (*OriginalRequest, bool) {
	val, ok := s.requests.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*OriginalRequest), true
}

func (s *Store) RecordResult(result *ReplayResult) {
	s.results.Store(result.ID, result)
	
	if result.Matched {
		s.stats.IncrReplayMatch()
	} else {
		s.stats.IncrReplayMismatch()
	}
}

func (s *Store) GetResult(id string) (*ReplayResult, bool) {
	val, ok := s.results.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*ReplayResult), true
}

func (s *Store) Cleanup(ttl time.Duration) {
	cutoff := time.Now().Add(-ttl)
	
	s.requests.Range(func(key, value interface{}) bool {
		req := value.(*OriginalRequest)
		if req.Timestamp.Before(cutoff) {
			s.requests.Delete(key)
		}
		return true
	})
	
	s.results.Range(func(key, value interface{}) bool {
		result := value.(*ReplayResult)
		if result.ReceivedAt.Before(cutoff) {
			s.results.Delete(key)
		}
		return true
	})
}

func (s *Store) StartCleanupLoop(ttl time.Duration, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			s.Cleanup(ttl)
		}
	}()
}

func Validate(original *OriginalRequest, serverResp map[string]interface{}) *ReplayResult {
	result := &ReplayResult{
		ID:         original.ID,
		ReceivedAt: time.Now(),
		Matched:    true,
		Diff:       "",
		ServerResp: serverResp,
	}

	serverMethod, _ := serverResp["method"].(string)
	if serverMethod != "" && serverMethod != original.Method {
		result.Matched = false
		result.Diff += fmt.Sprintf("method mismatch: expected %s, got %s; ", original.Method, serverMethod)
	}

	serverPath, _ := serverResp["path"].(string)
	if serverPath != "" && serverPath != original.Path {
		result.Matched = false
		result.Diff += fmt.Sprintf("path mismatch: expected %s, got %s; ", original.Path, serverPath)
	}

	return result
}
