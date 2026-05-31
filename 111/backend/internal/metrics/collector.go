package metrics

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"chaos-injector/internal/model"
)

type MetricsCollector struct {
	mu           sync.RWMutex
	baseMetrics  map[string]*model.GoldenMetrics
	faultEffects map[string]float64
}

func NewMetricsCollector() *MetricsCollector {
	m := &MetricsCollector{
		baseMetrics:  make(map[string]*model.GoldenMetrics),
		faultEffects: make(map[string]float64),
	}

	m.baseMetrics["default"] = &model.GoldenMetrics{
		SuccessRate: 99.5,
		AvgLatency:  45.0,
		P95Latency:  120.0,
		P99Latency:  250.0,
		QPS:         150.0,
		ErrorRate:   0.5,
		Timestamp:   time.Now(),
	}

	return m
}

func (m *MetricsCollector) GetGoldenMetrics(service string, activeFaults []model.ChaosExperiment) *model.GoldenMetrics {
	m.mu.RLock()
	defer m.mu.RUnlock()

	base := m.baseMetrics["default"]
	result := &model.GoldenMetrics{
		SuccessRate: base.SuccessRate,
		AvgLatency:  base.AvgLatency,
		P95Latency:  base.P95Latency,
		P99Latency:  base.P99Latency,
		QPS:         base.QPS,
		ErrorRate:   base.ErrorRate,
		Timestamp:   time.Now(),
	}

	for _, exp := range activeFaults {
		for _, target := range exp.Targets {
			if target.Service == service || target.Service == "all" {
				m.applyFaultEffect(result, &exp)
			}
		}
	}

	noise := 0.95 + rand.Float64()*0.1
	result.SuccessRate = math.Round(result.SuccessRate*noise*100) / 100
	result.AvgLatency = math.Round(result.AvgLatency*noise*100) / 100
	result.P95Latency = math.Round(result.P95Latency*noise*100) / 100
	result.P99Latency = math.Round(result.P99Latency*noise*100) / 100
	result.QPS = math.Round(result.QPS*noise*100) / 100
	result.ErrorRate = math.Round((100-result.SuccessRate)*100) / 100

	return result
}

func (m *MetricsCollector) applyFaultEffect(metrics *model.GoldenMetrics, exp *model.ChaosExperiment) {
	switch exp.FaultType {
	case model.FaultDelay:
		if exp.Delay != nil {
			avgDelay := float64((exp.Delay.MinMs + exp.Delay.MaxMs) / 2)
			factor := exp.Delay.Percent / 100.0
			metrics.AvgLatency += avgDelay * factor
			metrics.P95Latency += avgDelay * factor * 1.5
			metrics.P99Latency += avgDelay * factor * 2.0
			metrics.SuccessRate -= 0.1 * factor
		}
	case model.FaultAbort:
		if exp.Abort != nil {
			factor := exp.Abort.Percent / 100.0
			metrics.SuccessRate -= 10.0 * factor
			metrics.ErrorRate += 10.0 * factor
			metrics.QPS *= (1.0 - 0.3*factor)
		}
	case model.FaultInterrupt:
		if exp.Interrupt != nil {
			factor := exp.Interrupt.Percent / 100.0
			metrics.SuccessRate -= 15.0 * factor
			metrics.ErrorRate += 15.0 * factor
			metrics.AvgLatency += 50.0 * factor
			metrics.QPS *= (1.0 - 0.5*factor)
		}
	case model.FaultCompound:
		if exp.Delay != nil {
			avgDelay := float64((exp.Delay.MinMs + exp.Delay.MaxMs) / 2)
			factor := exp.Delay.Percent / 100.0
			metrics.AvgLatency += avgDelay * factor
			metrics.P95Latency += avgDelay * factor * 1.5
			metrics.P99Latency += avgDelay * factor * 2.0
			metrics.SuccessRate -= 0.1 * factor
		}
		if exp.Abort != nil {
			factor := exp.Abort.Percent / 100.0
			metrics.SuccessRate -= 10.0 * factor
			metrics.ErrorRate += 10.0 * factor
			metrics.QPS *= (1.0 - 0.3*factor)
		}
	}
}

func (m *MetricsCollector) GetTopology(activeExperiments []*model.ChaosExperiment) model.ServiceTopology {
	m.mu.RLock()
	defer m.mu.RUnlock()

	defaultServices := []struct {
		Service   string
		Namespace string
		Version   string
	}{
		{"api-gateway", "default", "v1"},
		{"user-service", "default", "v1"},
		{"order-service", "default", "v1"},
		{"payment-service", "default", "v1"},
		{"inventory-service", "default", "v1"},
		{"notification-service", "default", "v1"},
	}

	edges := []model.ServiceEdge{
		{From: "api-gateway", To: "user-service"},
		{From: "api-gateway", To: "order-service"},
		{From: "order-service", To: "payment-service"},
		{From: "order-service", To: "inventory-service"},
		{From: "payment-service", To: "notification-service"},
	}

	faultyServices := make(map[string]string)
	for _, exp := range activeExperiments {
		if exp.Status == model.StatusRunning {
			for _, target := range exp.Targets {
				faultyServices[target.Service] = string(exp.FaultType)
			}
		}
	}

	nodes := make([]model.ServiceNode, len(defaultServices))
	for i, svc := range defaultServices {
		faultType, hasFault := faultyServices[svc.Service]
		nodes[i] = model.ServiceNode{
			Service:   svc.Service,
			Namespace: svc.Namespace,
			Version:   svc.Version,
			HasFault:  hasFault,
			FaultType: faultType,
		}
	}

	serviceEdges := make([]model.ServiceEdge, len(edges))
	for i, edge := range edges {
		_, hasFault := faultyServices[edge.To]
		serviceEdges[i] = model.ServiceEdge{
			From:     edge.From,
			To:       edge.To,
			HasFault: hasFault,
		}
	}

	return model.ServiceTopology{
		Nodes: nodes,
		Edges: serviceEdges,
	}
}

func (m *MetricsCollector) GetAllServices() []string {
	return []string{
		"api-gateway",
		"user-service",
		"order-service",
		"payment-service",
		"inventory-service",
		"notification-service",
	}
}
