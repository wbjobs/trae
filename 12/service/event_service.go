package service

import (
	"eventstore/model"
	"eventstore/storage"
	"fmt"
)

type EventService struct {
	store *storage.EventStore
}

func NewEventService(store *storage.EventStore) *EventService {
	return &EventService{store: store}
}

func (s *EventService) AppendEvent(event model.Event) (int64, error) {
	if event.EntityID == "" {
		return 0, fmt.Errorf("entityId is required")
	}
	if event.EventType == "" {
		return 0, fmt.Errorf("eventType is required")
	}
	
	return s.store.AppendEvent(event)
}

func (s *EventService) GetTimeline(entityID string) ([]model.EventResponse, error) {
	if entityID == "" {
		return nil, fmt.Errorf("entityId is required")
	}
	
	events, err := s.store.GetTimeline(entityID)
	if err != nil {
		return nil, err
	}
	
	responses := make([]model.EventResponse, len(events))
	for i, ev := range events {
		responses[i] = model.EventResponse{
			EntityID:  ev.EntityID,
			Version:   ev.Version,
			EventType: ev.EventType,
			Payload:   ev.Payload,
			Timestamp: ev.Timestamp,
		}
	}
	
	return responses, nil
}

func (s *EventService) CounterfactualSimulation(req model.CounterfactualRequest) (*model.CounterfactualResponse, error) {
	if req.EntityID == "" {
		return nil, fmt.Errorf("entityId is required")
	}
	if req.AssumedVersion <= 0 {
		return nil, fmt.Errorf("assumedVersion must be positive")
	}
	if req.NewEvent.EventType == "" {
		return nil, fmt.Errorf("newEvent.eventType is required")
	}
	
	return s.store.CounterfactualSimulation(req.EntityID, req.AssumedVersion, req.NewEvent)
}

func (s *EventService) GarbageCollect(days int64) (*model.GCResponse, error) {
	if days <= 0 {
		return nil, fmt.Errorf("days must be positive")
	}
	
	deletedCount, err := s.store.GarbageCollect(days)
	if err != nil {
		return nil, err
	}
	
	return &model.GCResponse{
		DeletedCount: deletedCount,
		Message:      fmt.Sprintf("Successfully deleted %d events older than %d days", deletedCount, days),
	}, nil
}

func (s *EventService) GetCurrentVersion(entityID string) (int64, error) {
	if entityID == "" {
		return 0, fmt.Errorf("entityId is required")
	}
	return s.store.GetCurrentVersion(entityID)
}

func (s *EventService) AnalyzeCausalClusters() (*model.CausalClusterResponse, error) {
	return s.store.AnalyzeCausalClusters()
}
