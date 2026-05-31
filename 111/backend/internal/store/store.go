package store

import (
	"fmt"
	"sync"
	"time"

	"chaos-injector/internal/model"
)

type Store interface {
	CreateExperiment(exp *model.ChaosExperiment) error
	GetExperiment(id string) (*model.ChaosExperiment, error)
	ListExperiments() ([]*model.ChaosExperiment, error)
	UpdateExperiment(id string, exp *model.ChaosExperiment) error
	DeleteExperiment(id string) error
	UpdateStatus(id string, status model.ExperimentStatus) error
	GetActiveExperiments() ([]*model.ChaosExperiment, error)

	CreateSLO(slo *model.SLOThreshold) error
	GetSLO(id string) (*model.SLOThreshold, error)
	GetSLOForService(service, namespace string) (*model.SLOThreshold, error)
	ListSLOs() ([]*model.SLOThreshold, error)
	UpdateSLO(id string, slo *model.SLOThreshold) error
	DeleteSLO(id string) error

	AddSafetyEvent(event *model.SafetyEvent)
	ListSafetyEvents(limit int) []*model.SafetyEvent
	ListSafetyEventsForExperiment(experimentID string) []*model.SafetyEvent
}

type MemoryStore struct {
	mu           sync.RWMutex
	experiments  map[string]*model.ChaosExperiment
	sloThresholds map[string]*model.SLOThreshold
	safetyEvents []*model.SafetyEvent
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		experiments:   make(map[string]*model.ChaosExperiment),
		sloThresholds: make(map[string]*model.SLOThreshold),
		safetyEvents:  make([]*model.SafetyEvent, 0),
	}
}

func (s *MemoryStore) CreateExperiment(exp *model.ChaosExperiment) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.experiments[exp.ID]; exists {
		return fmt.Errorf("experiment with ID %s already exists", exp.ID)
	}

	exp.CreatedAt = time.Now()
	exp.UpdatedAt = time.Now()
	s.experiments[exp.ID] = exp
	return nil
}

func (s *MemoryStore) GetExperiment(id string) (*model.ChaosExperiment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	exp, exists := s.experiments[id]
	if !exists {
		return nil, fmt.Errorf("experiment with ID %s not found", id)
	}
	return exp, nil
}

func (s *MemoryStore) ListExperiments() ([]*model.ChaosExperiment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*model.ChaosExperiment, 0, len(s.experiments))
	for _, exp := range s.experiments {
		result = append(result, exp)
	}
	return result, nil
}

func (s *MemoryStore) UpdateExperiment(id string, exp *model.ChaosExperiment) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.experiments[id]; !exists {
		return fmt.Errorf("experiment with ID %s not found", id)
	}

	exp.ID = id
	exp.UpdatedAt = time.Now()
	s.experiments[id] = exp
	return nil
}

func (s *MemoryStore) DeleteExperiment(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.experiments[id]; !exists {
		return fmt.Errorf("experiment with ID %s not found", id)
	}

	delete(s.experiments, id)
	return nil
}

func (s *MemoryStore) UpdateStatus(id string, status model.ExperimentStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	exp, exists := s.experiments[id]
	if !exists {
		return fmt.Errorf("experiment with ID %s not found", id)
	}

	exp.Status = status
	exp.UpdatedAt = time.Now()

	if status == model.StatusRunning && exp.StartedAt == nil {
		now := time.Now()
		exp.StartedAt = &now
	}
	if status == model.StatusCompleted || status == model.StatusFailed {
		now := time.Now()
		exp.CompletedAt = &now
	}

	s.experiments[id] = exp
	return nil
}

func (s *MemoryStore) GetActiveExperiments() ([]*model.ChaosExperiment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*model.ChaosExperiment, 0)
	for _, exp := range s.experiments {
		if exp.Status == model.StatusRunning || exp.Status == model.StatusPaused {
			result = append(result, exp)
		}
	}
	return result, nil
}

func (s *MemoryStore) CreateSLO(slo *model.SLOThreshold) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, existing := range s.sloThresholds {
		if existing.Service == slo.Service && existing.Namespace == slo.Namespace {
			return fmt.Errorf("SLO threshold for %s.%s already exists (ID: %s)", slo.Service, slo.Namespace, existing.ID)
		}
	}

	slo.CreatedAt = time.Now()
	slo.UpdatedAt = time.Now()
	s.sloThresholds[slo.ID] = slo
	return nil
}

func (s *MemoryStore) GetSLO(id string) (*model.SLOThreshold, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	slo, exists := s.sloThresholds[id]
	if !exists {
		return nil, fmt.Errorf("SLO threshold with ID %s not found", id)
	}
	return slo, nil
}

func (s *MemoryStore) GetSLOForService(service, namespace string) (*model.SLOThreshold, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, slo := range s.sloThresholds {
		if slo.Service == service && slo.Namespace == namespace {
			return slo, nil
		}
	}
	return nil, nil
}

func (s *MemoryStore) ListSLOs() ([]*model.SLOThreshold, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*model.SLOThreshold, 0, len(s.sloThresholds))
	for _, slo := range s.sloThresholds {
		result = append(result, slo)
	}
	return result, nil
}

func (s *MemoryStore) UpdateSLO(id string, slo *model.SLOThreshold) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.sloThresholds[id]
	if !exists {
		return fmt.Errorf("SLO threshold with ID %s not found", id)
	}

	slo.ID = id
	slo.CreatedAt = existing.CreatedAt
	slo.UpdatedAt = time.Now()
	s.sloThresholds[id] = slo
	return nil
}

func (s *MemoryStore) DeleteSLO(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.sloThresholds[id]; !exists {
		return fmt.Errorf("SLO threshold with ID %s not found", id)
	}

	delete(s.sloThresholds, id)
	return nil
}

func (s *MemoryStore) AddSafetyEvent(event *model.SafetyEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.safetyEvents = append(s.safetyEvents, event)

	if len(s.safetyEvents) > 1000 {
		s.safetyEvents = s.safetyEvents[len(s.safetyEvents)-500:]
	}
}

func (s *MemoryStore) ListSafetyEvents(limit int) []*model.SafetyEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	start := 0
	if limit > 0 && len(s.safetyEvents) > limit {
		start = len(s.safetyEvents) - limit
	}

	result := make([]*model.SafetyEvent, len(s.safetyEvents)-start)
	for i := start; i < len(s.safetyEvents); i++ {
		result[i-start] = s.safetyEvents[i]
	}

	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result
}

func (s *MemoryStore) ListSafetyEventsForExperiment(experimentID string) []*model.SafetyEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*model.SafetyEvent
	for _, event := range s.safetyEvents {
		if event.ExperimentID == experimentID {
			result = append(result, event)
		}
	}

	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result
}
