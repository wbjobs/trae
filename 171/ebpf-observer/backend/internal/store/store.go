package store

import (
	"sync"
	"time"

	"ebpf-observer/backend/internal/model"
)

type Store struct {
	mu         sync.RWMutex
	health     map[string]*model.ServiceHealth
	topology   map[string]map[string]*model.TopologyEdge
	httpStats  map[string]*model.HttpStats
	httpRecent []model.HttpObservation
	eventTTL   time.Duration
	maxRecent  int
}

func New(eventTTL time.Duration) *Store {
	return &Store{
		health:     make(map[string]*model.ServiceHealth),
		topology:   make(map[string]map[string]*model.TopologyEdge),
		httpStats:  make(map[string]*model.HttpStats),
		httpRecent: make([]model.HttpObservation, 0),
		eventTTL:   eventTTL,
		maxRecent:  200,
	}
}

func (s *Store) RecordEvent(ev *model.TcpEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.updateServiceHealth(ev)
	s.updateTopology(ev)
}

func (s *Store) updateServiceHealth(ev *model.TcpEvent) {
	now := time.Now().Unix()

	for _, svc := range []string{ev.SrcService, ev.DstService} {
		if svc == "" {
			continue
		}
		h, ok := s.health[svc]
		if !ok {
			h = &model.ServiceHealth{ServiceName: svc}
			s.health[svc] = h
		}
		h.TotalConns++
		h.LastUpdate = now

		if ev.EventType == "retransmit" {
			h.RetransmitRate = rollingAvg(h.RetransmitRate,
				float64(ev.Retransmits)/float64(maxUint32(ev.TotalPackets, 1)))
		}
		if ev.EventType == "packet_loss" {
			h.LossRate = rollingAvg(h.LossRate,
				float64(ev.PacketLosses)/float64(maxUint32(ev.TotalPackets, 1)))
		}
		if ev.EventType == "rtt_update" && ev.Srtt > 0 {
			h.AvgRtt = rollingAvg(h.AvgRtt, float64(ev.Srtt)/1000.0)
		}

		h.HealthScore = computeHealthScore(h.RetransmitRate, h.LossRate, h.AvgRtt)
	}
}

func (s *Store) updateTopology(ev *model.TcpEvent) {
	if ev.SrcService == "" || ev.DstService == "" {
		return
	}
	if _, ok := s.topology[ev.SrcService]; !ok {
		s.topology[ev.SrcService] = make(map[string]*model.TopologyEdge)
	}
	edge, ok := s.topology[ev.SrcService][ev.DstService]
	if !ok {
		edge = &model.TopologyEdge{SrcService: ev.SrcService, DstService: ev.DstService}
		s.topology[ev.SrcService][ev.DstService] = edge
	}
	if ev.EventType == "retransmit" {
		edge.RetransmitRate = rollingAvg(edge.RetransmitRate,
			float64(ev.Retransmits)/float64(maxUint32(ev.TotalPackets, 1)))
	}
	if ev.EventType == "rtt_update" && ev.Srtt > 0 {
		edge.AvgRtt = rollingAvg(edge.AvgRtt, float64(ev.Srtt)/1000.0)
	}
	edge.HealthScore = computeHealthScore(edge.RetransmitRate, 0, edge.AvgRtt)
}

func (s *Store) GetAllHealth() []model.ServiceHealth {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]model.ServiceHealth, 0, len(s.health))
	for _, h := range s.health {
		result = append(result, *h)
	}
	return result
}

func (s *Store) GetTopology() model.Topology {
	s.mu.RLock()
	defer s.mu.RUnlock()
	nodes := make(map[string]bool)
	var edges []model.TopologyEdge

	for src, dsts := range s.topology {
		nodes[src] = true
		for dst, edge := range dsts {
			nodes[dst] = true
			edges = append(edges, *edge)
		}
	}

	var nodeList []model.TopologyNode
	for n := range nodes {
		score := 100.0
		if h, ok := s.health[n]; ok {
			score = h.HealthScore
		}
		nodeList = append(nodeList, model.TopologyNode{ServiceName: n, HealthScore: score})
	}

	return model.Topology{Nodes: nodeList, Edges: edges}
}

func computeHealthScore(retransRate, lossRate, rttMs float64) float64 {
	score := 100.0
	score -= retransRate * 500
	score -= lossRate * 300
	if rttMs > 100 {
		score -= (rttMs - 100) * 0.2
	}
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score
}

func rollingAvg(old, newVal float64) float64 {
	if old == 0 {
		return newVal
	}
	return old*0.7 + newVal*0.3
}

func maxUint32(a, b uint32) uint32 {
	if a > b {
		return a
	}
	return b
}

func (s *Store) RecordHttpObservation(obs *model.HttpObservation) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.httpRecent = append(s.httpRecent, *obs)
	if len(s.httpRecent) > s.maxRecent {
		s.httpRecent = s.httpRecent[len(s.httpRecent)-s.maxRecent:]
	}

	svc := obs.ServiceName
	if svc == "" {
		svc = "unknown"
	}
	stats, ok := s.httpStats[svc]
	if !ok {
		stats = &model.HttpStats{
			ServiceName:  svc,
			MethodCounts: make(map[string]int64),
			PathCounts:   make(map[string]int64),
		}
		s.httpStats[svc] = stats
	}
	stats.MethodCounts[obs.Method]++
	stats.PathCounts[obs.Path]++
	stats.TotalRequests++
	stats.LastUpdate = time.Now().Unix()
}

func (s *Store) GetHttpStats() []model.HttpStats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]model.HttpStats, 0, len(s.httpStats))
	for _, st := range s.httpStats {
		stCopy := *st
		stCopy.MethodCounts = make(map[string]int64)
		stCopy.PathCounts = make(map[string]int64)
		for k, v := range st.MethodCounts {
			stCopy.MethodCounts[k] = v
		}
		for k, v := range st.PathCounts {
			stCopy.PathCounts[k] = v
		}
		result = append(result, stCopy)
	}
	return result
}

func (s *Store) GetRecentHttp() []model.HttpObservation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]model.HttpObservation, len(s.httpRecent))
	copy(result, s.httpRecent)
	return result
}
