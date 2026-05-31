package config

import (
	"fmt"
	"os"
	"sync"

	"gopkg.in/yaml.v3"
)

// MethodConfig describes how a mocked method should behave.
type MethodConfig struct {
	Response *string `yaml:"response"`
	Error    *struct {
		Code    string `yaml:"code"`
		Message string `yaml:"message"`
	} `yaml:"error"`
	DelayMs int                    `yaml:"delay_ms"`
	Match   map[string]interface{} `yaml:"match"`
}

// ServiceConfig is the set of mocked methods for a service.
type ServiceConfig struct {
	Methods map[string]MethodConfig `yaml:"methods"`
}

// Config is the root of the YAML document.
type Config struct {
	Services map[string]ServiceConfig `yaml:"services"`
}

// Store provides concurrent-safe access to the parsed YAML config and
// supports hot reloading of the underlying file.
type Store struct {
	path string
	mu   sync.RWMutex
	cfg  *Config
}

// NewStore loads the YAML file at path and returns a Store.
func NewStore(path string) (*Store, error) {
	s := &Store{path: path}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
}

// Reload re-reads the YAML file and swaps the active config atomically.
func (s *Store) Reload() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return fmt.Errorf("read mock config %q: %w", s.path, err)
	}
	var next Config
	if err := yaml.Unmarshal(data, &next); err != nil {
		return fmt.Errorf("parse mock config %q: %w", s.path, err)
	}
	s.mu.Lock()
	s.cfg = &next
	s.mu.Unlock()
	return nil
}

// Path returns the watched YAML file path.
func (s *Store) Path() string { return s.path }

// Get returns the currently active config (read-only).
func (s *Store) Get() *Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

// Method looks up the mock config for a fully-qualified service + method.
func (s *Store) Method(service, method string) (MethodConfig, bool) {
	cfg := s.Get()
	if cfg == nil {
		return MethodConfig{}, false
	}
	svc, ok := cfg.Services[service]
	if !ok {
		return MethodConfig{}, false
	}
	m, ok := svc.Methods[method]
	return m, ok
}
