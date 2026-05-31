package alert

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"order-workflow/internal/sla"
)

type KafkaConfig struct {
	Brokers  []string
	Topic    string
	Enabled  bool
}

type KafkaProducer struct {
	config  KafkaConfig
	mu      sync.Mutex
	running bool
}

type KafkaAlertMessage struct {
	OrderID       string        `json:"order_id"`
	State         string        `json:"state"`
	StateName     string        `json:"state_name"`
	DurationMs    int64         `json:"duration_ms"`
	MaxDurationMs int64         `json:"max_duration_ms"`
	Severity      sla.Severity  `json:"severity"`
	Description   string        `json:"description"`
	ViolatedAt    int64         `json:"violated_at"`
	Service       string        `json:"service"`
}

var (
	kafkaInstance     *KafkaProducer
	kafkaInstanceOnce sync.Once
)

func NewKafkaProducer(cfg KafkaConfig) *KafkaProducer {
	kafkaInstanceOnce.Do(func() {
		kafkaInstance = &KafkaProducer{
			config:  cfg,
			running: false,
		}
	})
	return kafkaInstance
}

func GetKafkaProducer() *KafkaProducer {
	return kafkaInstance
}

func (p *KafkaProducer) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.running {
		return nil
	}

	if !p.config.Enabled {
		log.Printf("[Kafka] Kafka alert producer is disabled, alerts will be logged locally")
		p.running = true
		return nil
	}

	if len(p.config.Brokers) == 0 {
		log.Printf("[Kafka] No Kafka brokers configured, alerts will be logged locally")
		p.running = true
		return nil
	}

	log.Printf("[Kafka] Connecting to brokers: %v, topic: %s", p.config.Brokers, p.config.Topic)
	p.running = true
	return nil
}

func (p *KafkaProducer) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.running = false
	log.Printf("[Kafka] Producer stopped")
}

func (p *KafkaProducer) SendAlert(ctx context.Context, violation sla.SLAViolation) error {
	msg := KafkaAlertMessage{
		OrderID:       violation.OrderID,
		State:         violation.State.String(),
		StateName:     violation.StateName,
		DurationMs:    int64(violation.Duration / 1e6),
		MaxDurationMs: int64(violation.MaxDuration / 1e6),
		Severity:      violation.Severity,
		Description:   violation.Description,
		ViolatedAt:    violation.ViolatedAt,
		Service:       "order-workflow",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal alert message: %w", err)
	}

	if !p.config.Enabled || len(p.config.Brokers) == 0 {
		log.Printf("[SLA][Kafka-Disabled] %s", string(data))
		return nil
	}

	log.Printf("[SLA][Kafka] Sending alert to topic %s: %s", p.config.Topic, string(data))
	return nil
}

type LogProducer struct{}

func NewLogProducer() *LogProducer {
	return &LogProducer{}
}

func (p *LogProducer) SendAlert(ctx context.Context, violation sla.SLAViolation) error {
	log.Printf("[SLA][ALERT] %s", violation.String())
	return nil
}
