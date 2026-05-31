package storage

import (
	"encoding/binary"
	"encoding/json"
	"eventstore/model"
	"fmt"
	"time"

	fdb "github.com/apple/foundationdb/bindings/go/src/fdb"
	fdbkey "github.com/apple/foundationdb/bindings/go/src/fdb/key"
)

const (
	MaxVersionsPerEntity = 10000

	eventsKeyPrefix      = "events"
	versionKeyPrefix     = "version"
	timestampKeyPrefix   = "index"
	metadataKeyPrefix    = "metadata"
)

type EventStore struct {
	db fdb.Database
}

func NewEventStore(clusterFile string) (*EventStore, error) {
	fdb.MustAPIVersion(720)
	
	var db fdb.Database
	var err error
	
	if clusterFile != "" {
		db, err = fdb.OpenDatabase(clusterFile)
	} else {
		db, err = fdb.OpenDefault()
	}
	
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	
	return &EventStore{db: db}, nil
}

func (s *EventStore) eventKey(entityID string, version int64) fdb.Key {
	key := fdbkey.FromParts(eventsKeyPrefix, entityID, version)
	return fdb.Key(key.Bytes())
}

func (s *EventStore) versionKey(entityID string) fdb.Key {
	key := fdbkey.FromParts(versionKeyPrefix, entityID)
	return fdb.Key(key.Bytes())
}

func (s *EventStore) timestampKey(entityID string, timestamp int64, version int64) fdb.Key {
	key := fdbkey.FromParts(timestampKeyPrefix, entityID, timestamp, version)
	return fdb.Key(key.Bytes())
}

func (s *EventStore) metadataKey(entityID string) fdb.Key {
	key := fdbkey.FromParts(metadataKeyPrefix, entityID)
	return fdb.Key(key.Bytes())
}

func int64ToBytes(n int64) []byte {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(n))
	return buf
}

func bytesToInt64(b []byte) (int64, error) {
	if len(b) != 8 {
		return 0, fmt.Errorf("invalid bytes length: %d", len(b))
	}
	return int64(binary.BigEndian.Uint64(b)), nil
}

func (s *EventStore) AppendEvent(event model.Event) (int64, error) {
	result, err := s.db.Transact(func(tr fdb.Transaction) (interface{}, error) {
		currentVersionBytes := tr.Get(s.versionKey(event.EntityID)).MustGet()
		
		var expectedVersion int64
		if currentVersionBytes != nil {
			expectedVersion, _ = bytesToInt64(currentVersionBytes)
		} else {
			expectedVersion = 0
		}
		
		if event.Version != 0 && event.Version != expectedVersion+1 {
			return nil, &model.VersionConflictError{
				EntityID:        event.EntityID,
				ExpectedVersion: expectedVersion + 1,
				ActualVersion:   event.Version,
			}
		}
		
		newVersion := expectedVersion + 1
		
		if newVersion > MaxVersionsPerEntity {
			return nil, fmt.Errorf("entity %s has reached maximum version limit (%d)", event.EntityID, MaxVersionsPerEntity)
		}
		
		if event.Timestamp == 0 {
			event.Timestamp = time.Now().UnixNano()
		}
		event.Version = newVersion
		
		eventBytes, err := json.Marshal(event)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal event: %w", err)
		}
		
		tr.Set(s.eventKey(event.EntityID, newVersion), eventBytes)
		tr.Set(s.versionKey(event.EntityID), int64ToBytes(newVersion))
		tr.Set(s.timestampKey(event.EntityID, event.Timestamp, newVersion), []byte{1})
		
		if newVersion == 1 {
			metadata := map[string]interface{}{
				"earliestVersion": newVersion,
				"createdAt":       event.Timestamp,
			}
			metadataBytes, _ := json.Marshal(metadata)
			tr.Set(s.metadataKey(event.EntityID), metadataBytes)
		}
		
		return newVersion, nil
	})
	
	if err != nil {
		return 0, err
	}
	
	return result.(int64), nil
}

func (s *EventStore) GetTimeline(entityID string) ([]model.Event, error) {
	result, err := s.db.ReadTransact(func(tr fdb.ReadTransaction) (interface{}, error) {
		rangeStart := fdbkey.FromParts(eventsKeyPrefix, entityID).Bytes()
		rangeEnd := fdbkey.FromParts(eventsKeyPrefix, entityID, 0xFF).Bytes()
		rangeObj := fdb.SelectorRange{
			Begin: fdb.FirstGreaterOrEqual(rangeStart),
			End:   fdb.FirstGreaterOrEqual(rangeEnd),
		}
		
		iter := tr.GetRange(rangeObj, fdb.RangeOptions{}).Iterator()
		
		var events []model.Event
		for iter.Advance() {
			kv := iter.MustGet()
			var event model.Event
			if err := json.Unmarshal(kv.Value, &event); err != nil {
				return nil, fmt.Errorf("failed to unmarshal event: %w", err)
			}
			events = append(events, event)
		}
		
		return events, nil
	})
	
	if err != nil {
		return nil, err
	}
	
	return result.([]model.Event), nil
}

func (s *EventStore) GetEventsUpToVersion(entityID string, upToVersion int64) ([]model.Event, error) {
	result, err := s.db.ReadTransact(func(tr fdb.ReadTransaction) (interface{}, error) {
		rangeStart := fdbkey.FromParts(eventsKeyPrefix, entityID).Bytes()
		rangeEnd := fdbkey.FromParts(eventsKeyPrefix, entityID, upToVersion+1).Bytes()
		rangeObj := fdb.SelectorRange{
			Begin: fdb.FirstGreaterOrEqual(rangeStart),
			End:   fdb.FirstGreaterOrEqual(rangeEnd),
		}
		
		iter := tr.GetRange(rangeObj, fdb.RangeOptions{}).Iterator()
		
		var events []model.Event
		for iter.Advance() {
			kv := iter.MustGet()
			var event model.Event
			if err := json.Unmarshal(kv.Value, &event); err != nil {
				return nil, fmt.Errorf("failed to unmarshal event: %w", err)
			}
			if event.Version <= upToVersion {
				events = append(events, event)
			}
		}
		
		return events, nil
	})
	
	if err != nil {
		return nil, err
	}
	
	return result.([]model.Event), nil
}

func (s *EventStore) GetCurrentVersion(entityID string) (int64, error) {
	result, err := s.db.ReadTransact(func(tr fdb.ReadTransaction) (interface{}, error) {
		versionBytes := tr.Get(s.versionKey(entityID)).MustGet()
		if versionBytes == nil {
			return int64(0), nil
		}
		version, err := bytesToInt64(versionBytes)
		if err != nil {
			return nil, err
		}
		return version, nil
	})
	
	if err != nil {
		return 0, err
	}
	
	return result.(int64), nil
}

func (s *EventStore) GarbageCollect(days int64) (int64, error) {
	cutoffTime := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixNano()
	cutoffKey := fdbkey.FromParts(timestampKeyPrefix).Bytes()
	endKey := fdbkey.FromParts(timestampKeyPrefix, 0xFF).Bytes()
	rangeObj := fdb.SelectorRange{
		Begin: fdb.FirstGreaterOrEqual(cutoffKey),
		End:   fdb.FirstGreaterOrEqual(endKey),
	}
	
	var totalDeleted int64
	
	_, err := s.db.Transact(func(tr fdb.Transaction) (interface{}, error) {
		iter := tr.GetRange(rangeObj, fdb.RangeOptions{}).Iterator()
		
		for iter.Advance() {
			kv := iter.MustGet()
			
			keyTuple, err := fdbkey.Unpack(kv.Key)
			if err != nil {
				continue
			}
			
			if len(keyTuple) != 4 {
				continue
			}
			
			entityID, ok := keyTuple[1].(string)
			if !ok {
				continue
			}
			
			timestamp, ok := keyTuple[2].(int64)
			if !ok {
				continue
			}
			
			if timestamp >= cutoffTime {
				continue
			}
			
			version, ok := keyTuple[3].(int64)
			if !ok {
				continue
			}
			
			currentVersionBytes := tr.Get(s.versionKey(entityID)).MustGet()
			if currentVersionBytes == nil {
				continue
			}
			currentVersion, _ := bytesToInt64(currentVersionBytes)
			
			if version >= currentVersion {
				continue
			}
			
			tr.Clear(s.eventKey(entityID, version))
			tr.Clear(kv.Key)
			totalDeleted++
		}
		
		return nil, nil
	})
	
	return totalDeleted, err
}

func (s *EventStore) CounterfactualSimulation(entityID string, assumedVersion int64, newEvent model.CounterfactualEvent) (*model.CounterfactualResponse, error) {
	result, err := s.db.ReadTransact(func(tr fdb.ReadTransaction) (interface{}, error) {
		versionBytes := tr.Get(s.versionKey(entityID)).MustGet()
		if versionBytes == nil {
			return nil, fmt.Errorf("entity %s has no events", entityID)
		}
		
		currentVersion, err := bytesToInt64(versionBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse version: %w", err)
		}
		
		if assumedVersion <= 0 || assumedVersion > currentVersion {
			return nil, fmt.Errorf("assumed version must be between 1 and %d", currentVersion)
		}
		
		rangeStart := fdbkey.FromParts(eventsKeyPrefix, entityID).Bytes()
		rangeEnd := fdbkey.FromParts(eventsKeyPrefix, entityID, assumedVersion+1).Bytes()
		rangeObj := fdb.SelectorRange{
			Begin: fdb.FirstGreaterOrEqual(rangeStart),
			End:   fdb.FirstGreaterOrEqual(rangeEnd),
		}
		
		iter := tr.GetRange(rangeObj, fdb.RangeOptions{}).Iterator()
		
		var events []model.Event
		for iter.Advance() {
			kv := iter.MustGet()
			var event model.Event
			if err := json.Unmarshal(kv.Value, &event); err != nil {
				return nil, fmt.Errorf("failed to unmarshal event: %w", err)
			}
			if event.Version <= assumedVersion {
				events = append(events, event)
			}
		}
		
		state := make(map[string]interface{})
		for _, ev := range events {
			applyEvent(state, ev)
		}
		
		newTimestamp := time.Now().UnixNano()
		generatedEvent := model.Event{
			EntityID:  entityID,
			Version:   assumedVersion + 1,
			EventType: newEvent.EventType,
			Payload:   deepCopyEventPayload(newEvent.Payload),
			Timestamp: newTimestamp,
		}
		
		generatedEvents := []model.Event{generatedEvent}
		applyEvent(state, generatedEvent)
		
		eventResponses := make([]model.EventResponse, len(generatedEvents))
		for i, ev := range generatedEvents {
			eventResponses[i] = model.EventResponse{
				EntityID:  ev.EntityID,
				Version:   ev.Version,
				EventType: ev.EventType,
				Payload:   deepCopyEventPayload(ev.Payload),
				Timestamp: ev.Timestamp,
			}
		}
		
		return &model.CounterfactualResponse{
			EntityID:        entityID,
			AssumedVersion:  assumedVersion,
			FinalState:      deepCopyMap(state),
			GeneratedEvents: eventResponses,
		}, nil
	})
	
	if err != nil {
		return nil, err
	}
	
	return result.(*model.CounterfactualResponse), nil
}

func applyEvent(state map[string]interface{}, event model.Event) {
	for key, value := range event.Payload {
		state[key] = deepCopyValue(value)
	}
}

func (s *EventStore) AnalyzeCausalClusters() (*model.CausalClusterResponse, error) {
	edgeFrequency := make(map[string]map[string]int64)
	edgeEntityCount := make(map[string]map[string]int64)
	nodeOccurrences := make(map[string]int64)
	nodeInDegree := make(map[string]int64)
	nodeOutDegree := make(map[string]int64)
	nodeEntityCount := make(map[string]int64)
	entityEdgeSet := make(map[string]map[string]map[string]bool)
	
	var totalEvents int64
	var totalEntities int64
	var currentEntityID string
	var lastEventType string
	var firstEntityEvent bool = true
	
	_, err := s.db.ReadTransact(func(tr fdb.ReadTransaction) (interface{}, error) {
		rangeStart := fdbkey.FromParts(eventsKeyPrefix).Bytes()
		rangeEnd := fdbkey.FromParts(eventsKeyPrefix, 0xFF).Bytes()
		rangeObj := fdb.SelectorRange{
			Begin: fdb.FirstGreaterOrEqual(rangeStart),
			End:   fdb.FirstGreaterOrEqual(rangeEnd),
		}
		
		iter := tr.GetRange(rangeObj, fdb.RangeOptions{}).Iterator()
		
		for iter.Advance() {
			kv := iter.MustGet()
			
			keyTuple, err := fdbkey.Unpack(kv.Key)
			if err != nil {
				continue
			}
			
			if len(keyTuple) < 3 {
				continue
			}
			
			entityID, ok := keyTuple[1].(string)
			if !ok {
				continue
			}
			
			var event model.Event
			if err := json.Unmarshal(kv.Value, &event); err != nil {
				continue
			}
			
			if entityID != currentEntityID {
				currentEntityID = entityID
				lastEventType = ""
				firstEntityEvent = true
				totalEntities++
			}
			
			totalEvents++
			currentEventType := event.EventType
			
			nodeOccurrences[currentEventType]++
			if entityEdgeSet[entityID] == nil {
				entityEdgeSet[entityID] = make(map[string]map[string]bool)
			}
			if _, exists := entityEdgeSet[entityID][currentEventType]; !exists {
				nodeEntityCount[currentEventType]++
			}
			
			if !firstEntityEvent && lastEventType != "" {
				if edgeFrequency[lastEventType] == nil {
					edgeFrequency[lastEventType] = make(map[string]int64)
				}
				edgeFrequency[lastEventType][currentEventType]++
				nodeOutDegree[lastEventType]++
				nodeInDegree[currentEventType]++
				
				if entityEdgeSet[entityID][lastEventType] == nil {
					entityEdgeSet[entityID][lastEventType] = make(map[string]bool)
				}
				if !entityEdgeSet[entityID][lastEventType][currentEventType] {
					entityEdgeSet[entityID][lastEventType][currentEventType] = true
					if edgeEntityCount[lastEventType] == nil {
						edgeEntityCount[lastEventType] = make(map[string]int64)
					}
					edgeEntityCount[lastEventType][currentEventType]++
				}
			}
			
			lastEventType = currentEventType
			firstEntityEvent = false
		}
		
		return nil, nil
	})
	
	if err != nil {
		return nil, err
	}
	
	nodes := make([]model.CausalNode, 0)
	for eventType, occurrences := range nodeOccurrences {
		nodes = append(nodes, model.CausalNode{
			EventType:   eventType,
			InDegree:    nodeInDegree[eventType],
			OutDegree:   nodeOutDegree[eventType],
			EntityCount: nodeEntityCount[eventType],
			Occurrences: occurrences,
		})
	}
	
	edges := make([]model.CausalEdge, 0)
	for from, toMap := range edgeFrequency {
		for to, frequency := range toMap {
			edges = append(edges, model.CausalEdge{
				From:        from,
				To:          to,
				Frequency:   frequency,
				EntityCount: edgeEntityCount[from][to],
			})
		}
	}
	
	clusters := buildClusters(nodes, edges)
	
	return &model.CausalClusterResponse{
		Nodes:       nodes,
		Edges:       edges,
		EntityCount: totalEntities,
		EventCount:  totalEvents,
		Clusters:    clusters,
	}, nil
}

func buildClusters(nodes []model.CausalNode, edges []model.CausalEdge) []model.CausalCluster {
	if len(nodes) == 0 {
		return []model.CausalCluster{}
	}
	
	eventTypeToIdx := make(map[string]int)
	for i, node := range nodes {
		eventTypeToIdx[node.EventType] = i
	}
	
	adjList := make([]map[int]bool, len(nodes))
	reverseAdjList := make([]map[int]bool, len(nodes))
	for i := range adjList {
		adjList[i] = make(map[int]bool)
		reverseAdjList[i] = make(map[int]bool)
	}
	
	for _, edge := range edges {
		fromIdx, okFrom := eventTypeToIdx[edge.From]
		toIdx, okTo := eventTypeToIdx[edge.To]
		if okFrom && okTo {
			adjList[fromIdx][toIdx] = true
			reverseAdjList[toIdx][fromIdx] = true
		}
	}
	
	visited := make([]bool, len(nodes))
	clusters := make([]model.CausalCluster, 0)
	clusterID := 0
	
	for i := range nodes {
		if !visited[i] {
			clusterMembers := make([]int, 0)
			queue := []int{i}
			visited[i] = true
			
			for len(queue) > 0 {
				curr := queue[0]
				queue = queue[1:]
				clusterMembers = append(clusterMembers, curr)
				
				for neighbor := range adjList[curr] {
					if !visited[neighbor] {
						visited[neighbor] = true
						queue = append(queue, neighbor)
					}
				}
				for neighbor := range reverseAdjList[curr] {
					if !visited[neighbor] {
						visited[neighbor] = true
						queue = append(queue, neighbor)
					}
				}
			}
			
			if len(clusterMembers) > 0 {
				eventTypes := make([]string, 0, len(clusterMembers))
				for _, idx := range clusterMembers {
					eventTypes = append(eventTypes, nodes[idx].EventType)
				}
				
				clusters = append(clusters, model.CausalCluster{
					ClusterID:   clusterID,
					EventTypes:  eventTypes,
					Description: fmt.Sprintf("Causal cluster with %d event types", len(eventTypes)),
				})
				clusterID++
			}
		}
	}
	
	return clusters
}
