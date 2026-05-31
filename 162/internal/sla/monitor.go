package sla

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	pb "order-workflow/api/proto"
)

type AlertProducer interface {
	SendAlert(ctx context.Context, violation SLAViolation) error
}

type Monitor struct {
	mu            sync.RWMutex
	stateEntry    map[string]stateEntry
	config        Config
	producer      AlertProducer
	violations    map[string]bool
	scanInterval  time.Duration
	scanStopCh    chan struct{}
	scanRunning   bool
}

type stateEntry struct {
	state     pb.OrderState
	enteredAt int64
}

func NewMonitor(cfg Config, producer AlertProducer) *Monitor {
	return &Monitor{
		stateEntry:   make(map[string]stateEntry),
		config:       cfg,
		producer:     producer,
		violations:   make(map[string]bool),
		scanInterval: 10 * time.Second,
	}
}

func (m *Monitor) RecordState(orderID string, state pb.OrderState, timestamp int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	prev, exists := m.stateEntry[orderID]
	if exists {
		now := timestamp
		violation := CheckStateDuration(orderID, prev.state, prev.enteredAt, now, m.config)
		if violation != nil {
			key := fmt.Sprintf("%s-%s", orderID, prev.state.String())
			if !m.violations[key] {
				m.violations[key] = true
				go m.sendAlert(*violation)
			}
		}
	}

	m.stateEntry[orderID] = stateEntry{
		state:     state,
		enteredAt: timestamp,
	}
}

func (m *Monitor) sendAlert(violation SLAViolation) {
	if m.producer == nil {
		log.Printf("[SLA] %s", violation.String())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := m.producer.SendAlert(ctx, violation); err != nil {
		log.Printf("[SLA] Failed to send alert for order %s: %v", violation.OrderID, err)
	} else {
		log.Printf("[SLA] Alert sent: %s", violation.String())
	}
}

func (m *Monitor) StartPeriodicScan() {
	m.mu.Lock()
	if m.scanRunning {
		m.mu.Unlock()
		return
	}
	m.scanRunning = true
	m.scanStopCh = make(chan struct{})
	stopCh := m.scanStopCh
	m.mu.Unlock()

	go func() {
		ticker := time.NewTicker(m.scanInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				m.scan()
			case <-stopCh:
				return
			}
		}
	}()

	log.Printf("[SLA] Periodic scan started (interval=%v)", m.scanInterval)
}

func (m *Monitor) StopPeriodicScan() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.scanRunning {
		close(m.scanStopCh)
		m.scanRunning = false
		log.Printf("[SLA] Periodic scan stopped")
	}
}

func (m *Monitor) scan() {
	m.mu.RLock()
	now := time.Now().Unix()
	snapshot := make(map[string]stateEntry, len(m.stateEntry))
	for k, v := range m.stateEntry {
		snapshot[k] = v
	}
	violations := make(map[string]bool, len(m.violations))
	for k, v := range m.violations {
		violations[k] = v
	}
	m.mu.RUnlock()

	for orderID, entry := range snapshot {
		violation := CheckStateDuration(orderID, entry.state, entry.enteredAt, now, m.config)
		if violation != nil {
			key := fmt.Sprintf("%s-%s", orderID, entry.state.String())
			m.mu.Lock()
			alreadySent := m.violations[key]
			m.mu.Unlock()

			if !alreadySent {
				m.mu.Lock()
				m.violations[key] = true
				m.mu.Unlock()
				go m.sendAlert(*violation)
			}
		}
	}
}

func (m *Monitor) Remove(orderID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.stateEntry, orderID)
	for k := range m.violations {
		if len(k) > len(orderID) && k[:len(orderID)] == orderID {
			delete(m.violations, k)
		}
	}
}

func (m *Monitor) Stats() (total int, violations int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.stateEntry), len(m.violations)
}

func (m *Monitor) SetScanInterval(interval time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scanInterval = interval
}
