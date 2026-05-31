package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/dapr-wasm/middleware/pkg/engine"
	"gopkg.in/yaml.v3"
)

type Store struct {
	path     string
	Filters  []engine.FilterMeta `yaml:"filters" json:"filters"`
	mu       sync.RWMutex
}

func NewStore(configPath string) *Store {
	return &Store{
		path:    configPath,
		Filters: make([]engine.FilterMeta, 0),
	}
}

func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return s.Save()
		}
		return err
	}

	ext := filepath.Ext(s.path)
	if ext == ".yaml" || ext == ".yml" {
		return yaml.Unmarshal(data, s)
	}
	return json.Unmarshal(data, s)
}

func (s *Store) Save() error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0644)
}

func (s *Store) List() []engine.FilterMeta {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]engine.FilterMeta, len(s.Filters))
	copy(result, s.Filters)
	return result
}

func (s *Store) Get(name string) (engine.FilterMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, f := range s.Filters {
		if f.Name == name {
			return f, nil
		}
	}
	return engine.FilterMeta{}, fmt.Errorf("filter %s not found", name)
}

func (s *Store) Add(meta engine.FilterMeta) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, f := range s.Filters {
		if f.Name == meta.Name {
			return fmt.Errorf("filter %s already exists", meta.Name)
		}
	}

	s.Filters = append(s.Filters, meta)
	return s.saveLocked()
}

func (s *Store) Update(meta engine.FilterMeta) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.Filters {
		if f.Name == meta.Name {
			s.Filters[i] = meta
			return s.saveLocked()
		}
	}
	return fmt.Errorf("filter %s not found", meta.Name)
}

func (s *Store) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.Filters {
		if f.Name == name {
			s.Filters = append(s.Filters[:i], s.Filters[i+1:]...)
			return s.saveLocked()
		}
	}
	return fmt.Errorf("filter %s not found", name)
}

func (s *Store) Reorder(names []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	nameSet := make(map[string]int)
	for i, name := range names {
		nameSet[name] = i
	}

	for i := range s.Filters {
		if order, ok := nameSet[s.Filters[i].Name]; ok {
			s.Filters[i].Order = order
		}
	}

	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}
