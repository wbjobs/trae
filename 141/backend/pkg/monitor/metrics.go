package monitor

import (
	"sync"
	"time"
)

type Metrics struct {
	mu sync.RWMutex

	TotalRequests   int64
	TotalSuccess    int64
	TotalErrors     int64

	GetCount        int64
	SetCount        int64
	DeleteCount     int64
	BulkGetCount    int64
	BulkSetCount    int64
	BulkDeleteCount int64

	GetLatency      []float64
	SetLatency      []float64
	DeleteLatency   []float64
	BulkGetLatency  []float64
	BulkSetLatency  []float64
	BulkDeleteLatency []float64

	StartTime time.Time
}

var (
	instance *Metrics
	once     sync.Once
)

func GetMetrics() *Metrics {
	once.Do(func() {
		instance = &Metrics{
			StartTime: time.Now(),
		}
	})
	return instance
}

type OperationType string

const (
	OpGet        OperationType = "get"
	OpSet        OperationType = "set"
	OpDelete     OperationType = "delete"
	OpBulkGet    OperationType = "bulk_get"
	OpBulkSet    OperationType = "bulk_set"
	OpBulkDelete OperationType = "bulk_delete"
)

func (m *Metrics) RecordOperation(op OperationType, duration time.Duration, success bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.TotalRequests++
	if success {
		m.TotalSuccess++
	} else {
		m.TotalErrors++
	}

	latency := float64(duration.Milliseconds())

	switch op {
	case OpGet:
		m.GetCount++
		m.GetLatency = append(m.GetLatency, latency)
		if len(m.GetLatency) > 10000 {
			m.GetLatency = m.GetLatency[len(m.GetLatency)-10000:]
		}
	case OpSet:
		m.SetCount++
		m.SetLatency = append(m.SetLatency, latency)
		if len(m.SetLatency) > 10000 {
			m.SetLatency = m.SetLatency[len(m.SetLatency)-10000:]
		}
	case OpDelete:
		m.DeleteCount++
		m.DeleteLatency = append(m.DeleteLatency, latency)
		if len(m.DeleteLatency) > 10000 {
			m.DeleteLatency = m.DeleteLatency[len(m.DeleteLatency)-10000:]
		}
	case OpBulkGet:
		m.BulkGetCount++
		m.BulkGetLatency = append(m.BulkGetLatency, latency)
		if len(m.BulkGetLatency) > 10000 {
			m.BulkGetLatency = m.BulkGetLatency[len(m.BulkGetLatency)-10000:]
		}
	case OpBulkSet:
		m.BulkSetCount++
		m.BulkSetLatency = append(m.BulkSetLatency, latency)
		if len(m.BulkSetLatency) > 10000 {
			m.BulkSetLatency = m.BulkSetLatency[len(m.BulkSetLatency)-10000:]
		}
	case OpBulkDelete:
		m.BulkDeleteCount++
		m.BulkDeleteLatency = append(m.BulkDeleteLatency, latency)
		if len(m.BulkDeleteLatency) > 10000 {
			m.BulkDeleteLatency = m.BulkDeleteLatency[len(m.BulkDeleteLatency)-10000:]
		}
	}
}

type MetricsSnapshot struct {
	TotalRequests   int64              `json:"total_requests"`
	TotalSuccess    int64              `json:"total_success"`
	TotalErrors     int64              `json:"total_errors"`
	SuccessRate     float64            `json:"success_rate"`
	QPS             float64            `json:"qps"`
	Uptime          string             `json:"uptime"`
	OperationCounts map[string]int64   `json:"operation_counts"`
	AvgLatency      map[string]float64 `json:"avg_latency"`
	P50Latency      map[string]float64 `json:"p50_latency"`
	P99Latency      map[string]float64 `json:"p99_latency"`
	RecentLatencies map[string][]float64 `json:"recent_latencies"`
}

func (m *Metrics) GetSnapshot() MetricsSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	uptime := time.Since(m.StartTime)
	qps := float64(m.TotalRequests) / uptime.Seconds()
	if uptime.Seconds() < 1 {
		qps = float64(m.TotalRequests)
	}

	successRate := float64(0)
	if m.TotalRequests > 0 {
		successRate = float64(m.TotalSuccess) / float64(m.TotalRequests) * 100
	}

	calcAvg := func(latencies []float64) float64 {
		if len(latencies) == 0 {
			return 0
		}
		sum := float64(0)
		for _, l := range latencies {
			sum += l
		}
		return sum / float64(len(latencies))
	}

	calcPercentile := func(latencies []float64, percentile float64) float64 {
		if len(latencies) == 0 {
			return 0
		}
		sorted := make([]float64, len(latencies))
		copy(sorted, latencies)
		for i := 0; i < len(sorted); i++ {
			for j := i + 1; j < len(sorted); j++ {
				if sorted[i] > sorted[j] {
					sorted[i], sorted[j] = sorted[j], sorted[i]
				}
			}
		}
		index := int(float64(len(sorted)) * percentile / 100)
		if index >= len(sorted) {
			index = len(sorted) - 1
		}
		return sorted[index]
	}

	getRecent := func(latencies []float64) []float64 {
		count := 50
		if len(latencies) < count {
			count = len(latencies)
		}
		if count == 0 {
			return []float64{}
		}
		return latencies[len(latencies)-count:]
	}

	return MetricsSnapshot{
		TotalRequests: m.TotalRequests,
		TotalSuccess:  m.TotalSuccess,
		TotalErrors:   m.TotalErrors,
		SuccessRate:   successRate,
		QPS:           qps,
		Uptime:        uptime.String(),
		OperationCounts: map[string]int64{
			"get":         m.GetCount,
			"set":         m.SetCount,
			"delete":      m.DeleteCount,
			"bulk_get":    m.BulkGetCount,
			"bulk_set":    m.BulkSetCount,
			"bulk_delete": m.BulkDeleteCount,
		},
		AvgLatency: map[string]float64{
			"get":         calcAvg(m.GetLatency),
			"set":         calcAvg(m.SetLatency),
			"delete":      calcAvg(m.DeleteLatency),
			"bulk_get":    calcAvg(m.BulkGetLatency),
			"bulk_set":    calcAvg(m.BulkSetLatency),
			"bulk_delete": calcAvg(m.BulkDeleteLatency),
		},
		P50Latency: map[string]float64{
			"get":         calcPercentile(m.GetLatency, 50),
			"set":         calcPercentile(m.SetLatency, 50),
			"delete":      calcPercentile(m.DeleteLatency, 50),
			"bulk_get":    calcPercentile(m.BulkGetLatency, 50),
			"bulk_set":    calcPercentile(m.BulkSetLatency, 50),
			"bulk_delete": calcPercentile(m.BulkDeleteLatency, 50),
		},
		P99Latency: map[string]float64{
			"get":         calcPercentile(m.GetLatency, 99),
			"set":         calcPercentile(m.SetLatency, 99),
			"delete":      calcPercentile(m.DeleteLatency, 99),
			"bulk_get":    calcPercentile(m.BulkGetLatency, 99),
			"bulk_set":    calcPercentile(m.BulkSetLatency, 99),
			"bulk_delete": calcPercentile(m.BulkDeleteLatency, 99),
		},
		RecentLatencies: map[string][]float64{
			"get":         getRecent(m.GetLatency),
			"set":         getRecent(m.SetLatency),
			"delete":      getRecent(m.DeleteLatency),
			"bulk_get":    getRecent(m.BulkGetLatency),
			"bulk_set":    getRecent(m.BulkSetLatency),
			"bulk_delete": getRecent(m.BulkDeleteLatency),
		},
	}
}

func (m *Metrics) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.TotalRequests = 0
	m.TotalSuccess = 0
	m.TotalErrors = 0
	m.GetCount = 0
	m.SetCount = 0
	m.DeleteCount = 0
	m.BulkGetCount = 0
	m.BulkSetCount = 0
	m.BulkDeleteCount = 0
	m.GetLatency = m.GetLatency[:0]
	m.SetLatency = m.SetLatency[:0]
	m.DeleteLatency = m.DeleteLatency[:0]
	m.BulkGetLatency = m.BulkGetLatency[:0]
	m.BulkSetLatency = m.BulkSetLatency[:0]
	m.BulkDeleteLatency = m.BulkDeleteLatency[:0]
	m.StartTime = time.Now()
}
