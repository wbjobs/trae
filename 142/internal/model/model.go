package model

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type SubscriberStatus string

const (
	SubscriberActive   SubscriberStatus = "active"
	SubscriberInactive SubscriberStatus = "inactive"
	SubscriberError    SubscriberStatus = "error"
)

type DistributionStrategy string

const (
	StrategyRoundRobin DistributionStrategy = "round_robin"
	StrategyRandom     DistributionStrategy = "random"
	StrategyLRU        DistributionStrategy = "lru"
)

type Subscriber struct {
	ID           string           `json:"id"`
	ClientID     string           `json:"client_id"`
	Group        string           `json:"group"`
	TopicFilter  string           `json:"topic_filter"`
	Status       SubscriberStatus `json:"status"`
	ConnectedAt  time.Time        `json:"connected_at"`
	LastActiveAt time.Time        `json:"last_active_at"`
	mu           sync.RWMutex
	MsgCount     int64         `json:"msg_count"`
	Latency      time.Duration `json:"latency"`
	AvgLatency   time.Duration `json:"avg_latency"`
	TotalLatency time.Duration `json:"-"`
	FailCount    int64         `json:"fail_count"`
	MaxFailCount int64         `json:"max_fail_count"`
}

func NewSubscriber(clientID, group, topicFilter string) *Subscriber {
	return &Subscriber{
		ID:           uuid.New().String(),
		ClientID:     clientID,
		Group:        group,
		TopicFilter:  topicFilter,
		Status:       SubscriberActive,
		ConnectedAt:  time.Now(),
		LastActiveAt: time.Now(),
		MaxFailCount: 5,
	}
}

func (s *Subscriber) RecordMessage(latency time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.MsgCount++
	s.Latency = latency
	s.TotalLatency += latency
	s.AvgLatency = s.TotalLatency / time.Duration(s.MsgCount)
	s.LastActiveAt = time.Now()
}

func (s *Subscriber) RecordFailure() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.FailCount++
	if s.FailCount >= s.MaxFailCount {
		s.Status = SubscriberError
	}
}

func (s *Subscriber) IsHealthy() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Status == SubscriberActive
}

func (s *Subscriber) GetFailCount() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.FailCount
}

func (s *Subscriber) GetMsgCount() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.MsgCount
}

func (s *Subscriber) GetLastActiveAt() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.LastActiveAt
}

type MQTTMessage struct {
	ID          string    `json:"id"`
	Topic       string    `json:"topic"`
	Payload     []byte    `json:"payload"`
	QoS         byte      `json:"qos"`
	Retain      bool      `json:"retain"`
	Timestamp   time.Time `json:"timestamp"`
	RetryCount  int       `json:"retry_count"`
	MaxRetries  int       `json:"max_retries"`
	LastError   string    `json:"last_error,omitempty"`
	LastSubID   string    `json:"last_subscriber_id,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

func NewMQTTMessage(topic string, payload []byte, qos byte, retain bool) *MQTTMessage {
	return &MQTTMessage{
		ID:        uuid.New().String(),
		Topic:     topic,
		Payload:   payload,
		QoS:       qos,
		Retain:    retain,
		Timestamp: time.Now(),
		CreatedAt: time.Now(),
		MaxRetries: 3,
	}
}

func (m *MQTTMessage) RecordRetry(err error, subID string) {
	m.RetryCount++
	m.LastError = err.Error()
	m.LastSubID = subID
}

func (m *MQTTMessage) CanRetry() bool {
	return m.RetryCount < m.MaxRetries
}

type DeadLetterMessage struct {
	Message    *MQTTMessage `json:"message"`
	Reason     string       `json:"reason"`
	Group      string       `json:"group"`
	RetriedAt  time.Time    `json:"retried_at"`
}

type RetryConfig struct {
	Enabled            bool          `yaml:"enabled"`
	MaxRetries         int           `yaml:"max_retries"`
	RetryInterval      time.Duration `yaml:"retry_interval"`
	DeadLetterQueueSize int          `yaml:"dead_letter_queue_size"`
	AutoRemoveFailed   bool          `yaml:"auto_remove_failed"`
	MaxFailPerSubscriber int64       `yaml:"max_fail_per_subscriber"`
}

type SubscriptionGroup struct {
	Name             string                     `json:"name"`
	TopicFilter      string                     `json:"topic_filter"`
	Strategy         DistributionStrategy       `json:"strategy"`
	Subscribers      map[string]*Subscriber     `json:"subscribers"`
	MessageQueue     chan *MQTTMessage          `json:"-"`
	RetryQueue       chan *MQTTMessage          `json:"-"`
	DeadLetterQueue  []*DeadLetterMessage       `json:"dead_letter_queue"`
	CreatedAt        time.Time                  `json:"created_at"`
	mu               sync.RWMutex
	dlqMu            sync.RWMutex
}

func NewSubscriptionGroup(name, topicFilter string, strategy DistributionStrategy, queueSize int) *SubscriptionGroup {
	return &SubscriptionGroup{
		Name:            name,
		TopicFilter:     topicFilter,
		Strategy:        strategy,
		Subscribers:     make(map[string]*Subscriber),
		MessageQueue:    make(chan *MQTTMessage, queueSize),
		RetryQueue:      make(chan *MQTTMessage, queueSize),
		DeadLetterQueue: make([]*DeadLetterMessage, 0),
		CreatedAt:       time.Now(),
	}
}

func (sg *SubscriptionGroup) AddSubscriber(sub *Subscriber) {
	sg.mu.Lock()
	defer sg.mu.Unlock()
	sg.Subscribers[sub.ID] = sub
}

func (sg *SubscriptionGroup) RemoveSubscriber(subID string) {
	sg.mu.Lock()
	defer sg.mu.Unlock()
	delete(sg.Subscribers, subID)
}

func (sg *SubscriptionGroup) GetSubscribers() []*Subscriber {
	sg.mu.RLock()
	defer sg.mu.RUnlock()
	subs := make([]*Subscriber, 0, len(sg.Subscribers))
	for _, s := range sg.Subscribers {
		subs = append(subs, s)
	}
	return subs
}

func (sg *SubscriptionGroup) SetStrategy(strategy DistributionStrategy) {
	sg.mu.Lock()
	defer sg.mu.Unlock()
	sg.Strategy = strategy
}

func (sg *SubscriptionGroup) GetStrategy() DistributionStrategy {
	sg.mu.RLock()
	defer sg.mu.RUnlock()
	return sg.Strategy
}

func (sg *SubscriptionGroup) EnqueueMessage(msg *MQTTMessage) bool {
	select {
	case sg.MessageQueue <- msg:
		return true
	default:
		return false
	}
}

func (sg *SubscriptionGroup) EnqueueRetry(msg *MQTTMessage) bool {
	select {
	case sg.RetryQueue <- msg:
		return true
	default:
		return false
	}
}

func (sg *SubscriptionGroup) AddToDeadLetter(msg *MQTTMessage, reason string) {
	sg.dlqMu.Lock()
	defer sg.dlqMu.Unlock()
	dlm := &DeadLetterMessage{
		Message:   msg,
		Reason:    reason,
		Group:     sg.Name,
		RetriedAt: time.Now(),
	}
	sg.DeadLetterQueue = append(sg.DeadLetterQueue, dlm)
}

func (sg *SubscriptionGroup) GetDeadLetterMessages() []*DeadLetterMessage {
	sg.dlqMu.RLock()
	defer sg.dlqMu.RUnlock()
	result := make([]*DeadLetterMessage, len(sg.DeadLetterQueue))
	copy(result, sg.DeadLetterQueue)
	return result
}

func (sg *SubscriptionGroup) ClearDeadLetter() {
	sg.dlqMu.Lock()
	defer sg.dlqMu.Unlock()
	sg.DeadLetterQueue = sg.DeadLetterQueue[:0]
}

func (sg *SubscriptionGroup) GetHealthySubscribers() []*Subscriber {
	sg.mu.RLock()
	defer sg.mu.RUnlock()
	subs := make([]*Subscriber, 0)
	for _, s := range sg.Subscribers {
		if s.IsHealthy() {
			subs = append(subs, s)
		}
	}
	return subs
}

type DeduplicationConfig struct {
	Enabled bool          `yaml:"enabled"`
	TTL     time.Duration `yaml:"ttl"`
}

type BalancerConfig struct {
	ListenAddr          string                 `yaml:"listen_addr"`
	APIAddr             string                 `yaml:"api_addr"`
	MetricsAddr         string                 `yaml:"metrics_addr"`
	DefaultStrategy     DistributionStrategy   `yaml:"default_strategy"`
	QueueSize           int                    `yaml:"queue_size"`
	WorkerPoolSize      int                    `yaml:"worker_pool_size"`
	MosquittoPlugin     MosquittoConfig        `yaml:"mosquitto_plugin"`
	MonitorConfig       MonitorConfig          `yaml:"monitor"`
	RetryConfig         RetryConfig            `yaml:"retry"`
	DeduplicationConfig DeduplicationConfig    `yaml:"deduplication"`
}

type MosquittoConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Endpoint string `yaml:"endpoint"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type MonitorConfig struct {
	Enabled     bool `yaml:"enabled"`
	RetentionDays int `yaml:"retention_days"`
}

func DefaultConfig() *BalancerConfig {
	return &BalancerConfig{
		ListenAddr:      ":1883",
		APIAddr:         ":8080",
		MetricsAddr:     ":9090",
		DefaultStrategy: StrategyRoundRobin,
		QueueSize:       10000,
		WorkerPoolSize:  10,
		MosquittoPlugin: MosquittoConfig{
			Enabled:  false,
			Endpoint: ":8081",
		},
		MonitorConfig: MonitorConfig{
			Enabled:       true,
			RetentionDays: 7,
		},
		RetryConfig: RetryConfig{
			Enabled:              true,
			MaxRetries:           3,
			RetryInterval:        1 * time.Second,
			DeadLetterQueueSize:  1000,
			AutoRemoveFailed:     true,
			MaxFailPerSubscriber: 5,
		},
		DeduplicationConfig: DeduplicationConfig{
			Enabled: true,
			TTL:     30 * time.Second,
		},
	}
}
