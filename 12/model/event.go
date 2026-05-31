package model

import "strconv"

type Event struct {
	EntityID  string                 `json:"entityId"`
	Version   int64                  `json:"version"`
	EventType string                 `json:"eventType"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp int64                  `json:"timestamp"`
}

type EventResponse struct {
	EntityID  string                 `json:"entityId"`
	Version   int64                  `json:"version"`
	EventType string                 `json:"eventType"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp int64                  `json:"timestamp"`
}

type CounterfactualRequest struct {
	EntityID       string              `json:"entityId"`
	AssumedVersion int64               `json:"assumedVersion"`
	NewEvent       CounterfactualEvent `json:"newEvent"`
}

type CounterfactualEvent struct {
	EventType string                 `json:"eventType"`
	Payload   map[string]interface{} `json:"payload"`
}

type CounterfactualResponse struct {
	EntityID        string                 `json:"entityId"`
	AssumedVersion  int64                  `json:"assumedVersion"`
	FinalState      map[string]interface{} `json:"finalState"`
	GeneratedEvents []EventResponse        `json:"generatedEvents"`
}

type GCRequest struct {
	Days int64 `json:"days"`
}

type GCResponse struct {
	DeletedCount int64  `json:"deletedCount"`
	Message      string `json:"message"`
}

type AggregateState struct {
	EntityID string                 `json:"entityId"`
	Version  int64                  `json:"version"`
	State    map[string]interface{} `json:"state"`
}

type VersionConflictError struct {
	EntityID        string
	ExpectedVersion int64
	ActualVersion   int64
}

func (e *VersionConflictError) Error() string {
	return "version conflict: entity=" + e.EntityID + ", expected=" + strconv.FormatInt(e.ExpectedVersion, 10) + ", actual=" + strconv.FormatInt(e.ActualVersion, 10)
}

type CausalClusterResponse struct {
	Nodes       []CausalNode       `json:"nodes"`
	Edges       []CausalEdge       `json:"edges"`
	EntityCount int64              `json:"entityCount"`
	EventCount  int64              `json:"eventCount"`
	Clusters    []CausalCluster    `json:"clusters"`
}

type CausalNode struct {
	EventType    string `json:"eventType"`
	InDegree     int64  `json:"inDegree"`
	OutDegree    int64  `json:"outDegree"`
	EntityCount  int64  `json:"entityCount"`
	Occurrences  int64  `json:"occurrences"`
}

type CausalEdge struct {
	From          string `json:"from"`
	To            string `json:"to"`
	Frequency     int64  `json:"frequency"`
	EntityCount   int64  `json:"entityCount"`
}

type CausalCluster struct {
	ClusterID   int      `json:"clusterId"`
	EventTypes  []string `json:"eventTypes"`
	Description string   `json:"description"`
}
