package balancer

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/mqtt-shared-sub/lb/internal/dedup"
	"github.com/mqtt-shared-sub/lb/internal/model"
	"github.com/mqtt-shared-sub/lb/internal/parser"
	"github.com/mqtt-shared-sub/lb/internal/strategy"
)

type MessageHandler func(sub *model.Subscriber, msg *model.MQTTMessage) error

type LoadBalancer struct {
	groups        map[string]*model.SubscriptionGroup
	strategies    map[string]strategy.Strategy
	config        *model.BalancerConfig
	handler       MessageHandler
	mu            sync.RWMutex
	workerPool    chan struct{}
	wg            sync.WaitGroup
	shutdownCh    chan struct{}
	metrics       *Metrics
	dedupTracker  *dedup.Tracker
}

type Metrics struct {
	TotalMessages     int64
	Dispatched        int64
	Failed            int64
	Retried           int64
	DeadLetterCount   int64
	DedupHits         int64
	DedupMisses       int64
	AvgDispatchTime   time.Duration
	TotalDispatchTime time.Duration
	mu                sync.RWMutex
}

func (m *Metrics) MutexRLock() {
	m.mu.RLock()
}

func (m *Metrics) MutexRUnlock() {
	m.mu.RUnlock()
}

func NewLoadBalancer(cfg *model.BalancerConfig) *LoadBalancer {
	lb := &LoadBalancer{
		groups:     make(map[string]*model.SubscriptionGroup),
		strategies: make(map[string]strategy.Strategy),
		config:     cfg,
		workerPool: make(chan struct{}, cfg.WorkerPoolSize),
		shutdownCh: make(chan struct{}),
		metrics:    &Metrics{},
	}
	if cfg.DeduplicationConfig.Enabled {
		lb.dedupTracker = dedup.NewTracker(cfg.DeduplicationConfig.TTL)
	}
	return lb
}

func (lb *LoadBalancer) SetMessageHandler(handler MessageHandler) {
	lb.handler = handler
}

func (lb *LoadBalancer) GetMetrics() *Metrics {
	return lb.metrics
}

func (lb *LoadBalancer) GetDedupTracker() *dedup.Tracker {
	return lb.dedupTracker
}

func (lb *LoadBalancer) GetDedupStats() (enabled bool, hitCount, missCount int64, size int) {
	if lb.dedupTracker == nil {
		return false, 0, 0, 0
	}
	hit, miss, sz := lb.dedupTracker.GetStats()
	return true, hit, miss, sz
}

func (lb *LoadBalancer) ClearDedupCache() {
	if lb.dedupTracker != nil {
		lb.dedupTracker.Clear()
	}
}

func (lb *LoadBalancer) RegisterGroup(name, topicFilter string, strat model.DistributionStrategy) error {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	if _, exists := lb.groups[name]; exists {
		return fmt.Errorf("group %s already registered", name)
	}

	group := model.NewSubscriptionGroup(name, topicFilter, strat, lb.config.QueueSize)
	lb.groups[name] = group
	lb.strategies[name] = strategy.NewStrategy(strat)

	log.Printf("[Balancer] Registered group: %s (topic: %s, strategy: %s)", name, topicFilter, strat)
	return nil
}

func (lb *LoadBalancer) UnregisterGroup(name string) error {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	group, exists := lb.groups[name]
	if !exists {
		return fmt.Errorf("group %s not found", name)
	}

	close(group.MessageQueue)
	close(group.RetryQueue)
	delete(lb.groups, name)
	delete(lb.strategies, name)

	log.Printf("[Balancer] Unregistered group: %s", name)
	return nil
}

func (lb *LoadBalancer) GetGroup(name string) (*model.SubscriptionGroup, error) {
	lb.mu.RLock()
	defer lb.mu.RUnlock()

	group, exists := lb.groups[name]
	if !exists {
		return nil, fmt.Errorf("group %s not found", name)
	}
	return group, nil
}

func (lb *LoadBalancer) GetAllGroups() []*model.SubscriptionGroup {
	lb.mu.RLock()
	defer lb.mu.RUnlock()

	groups := make([]*model.SubscriptionGroup, 0, len(lb.groups))
	for _, g := range lb.groups {
		groups = append(groups, g)
	}
	return groups
}

func (lb *LoadBalancer) ChangeStrategy(groupName string, strat model.DistributionStrategy) error {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	group, exists := lb.groups[groupName]
	if !exists {
		return fmt.Errorf("group %s not found", groupName)
	}

	group.SetStrategy(strat)
	lb.strategies[groupName] = strategy.NewStrategy(strat)

	log.Printf("[Balancer] Strategy changed for group %s to %s", groupName, strat)
	return nil
}

func (lb *LoadBalancer) AddSubscriber(sub *model.Subscriber) error {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	group, exists := lb.groups[sub.Group]
	if !exists {
		return fmt.Errorf("group %s not found", sub.Group)
	}

	sub.MaxFailCount = lb.config.RetryConfig.MaxFailPerSubscriber
	group.AddSubscriber(sub)
	log.Printf("[Balancer] Subscriber %s added to group %s", sub.ClientID, sub.Group)
	return nil
}

func (lb *LoadBalancer) RemoveSubscriber(groupName, subID string) error {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	group, exists := lb.groups[groupName]
	if !exists {
		return fmt.Errorf("group %s not found", groupName)
	}

	group.RemoveSubscriber(subID)
	log.Printf("[Balancer] Subscriber %s removed from group %s", subID, groupName)
	return nil
}

func (lb *LoadBalancer) Publish(topic string, payload []byte, qos byte, retain bool) error {
	msg := model.NewMQTTMessage(topic, payload, qos, retain)
	msg.MaxRetries = lb.config.RetryConfig.MaxRetries

	lb.metrics.mu.Lock()
	lb.metrics.TotalMessages++
	lb.metrics.mu.Unlock()

	lb.mu.RLock()
	groupsToDispatch := make([]*model.SubscriptionGroup, 0)
	for _, group := range lb.groups {
		if parser.TopicMatchesFilter(topic, group.TopicFilter) {
			groupsToDispatch = append(groupsToDispatch, group)
		}
	}
	lb.mu.RUnlock()

	if len(groupsToDispatch) == 0 {
		log.Printf("[Balancer] No matching group for topic: %s", topic)
		return nil
	}

	for _, group := range groupsToDispatch {
		if !group.EnqueueMessage(msg) {
			log.Printf("[Balancer] Queue full for group %s, dropping message", group.Name)
			lb.metrics.mu.Lock()
			lb.metrics.Failed++
			lb.metrics.mu.Unlock()
		}
	}

	return nil
}

func (lb *LoadBalancer) Start(ctx context.Context) error {
	log.Println("[Balancer] Starting load balancer...")

	if lb.dedupTracker != nil {
		lb.dedupTracker.Start(ctx)
		log.Printf("[Balancer] Deduplication enabled, TTL: %s", lb.config.DeduplicationConfig.TTL)
	}

	lb.mu.RLock()
	for _, group := range lb.groups {
		lb.wg.Add(1)
		go lb.processGroupMessages(ctx, group)
		if lb.config.RetryConfig.Enabled {
			lb.wg.Add(1)
			go lb.processRetryMessages(ctx, group)
		}
	}
	lb.mu.RUnlock()

	if lb.config.RetryConfig.Enabled && lb.config.RetryConfig.AutoRemoveFailed {
		lb.wg.Add(1)
		go lb.healthCheckRoutine(ctx)
	}

	return nil
}

func (lb *LoadBalancer) processGroupMessages(ctx context.Context, group *model.SubscriptionGroup) {
	defer lb.wg.Done()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Balancer] Stopping message processing for group %s", group.Name)
			return
		case <-lb.shutdownCh:
			return
		case msg, ok := <-group.MessageQueue:
			if !ok {
				return
			}
			lb.dispatchMessage(ctx, group, msg, false)
		}
	}
}

func (lb *LoadBalancer) processRetryMessages(ctx context.Context, group *model.SubscriptionGroup) {
	defer lb.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case <-lb.shutdownCh:
			return
		case msg, ok := <-group.RetryQueue:
			if !ok {
				return
			}
			time.Sleep(lb.config.RetryConfig.RetryInterval)
			lb.dispatchMessage(ctx, group, msg, true)
		}
	}
}

func (lb *LoadBalancer) healthCheckRoutine(ctx context.Context) {
	defer lb.wg.Done()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-lb.shutdownCh:
			return
		case <-ticker.C:
			lb.checkAndRemoveFailedSubscribers()
		}
	}
}

func (lb *LoadBalancer) checkAndRemoveFailedSubscribers() {
	lb.mu.RLock()
	groups := make([]*model.SubscriptionGroup, 0, len(lb.groups))
	for _, g := range lb.groups {
		groups = append(groups, g)
	}
	lb.mu.RUnlock()

	for _, group := range groups {
		subs := group.GetSubscribers()
		for _, sub := range subs {
			if !sub.IsHealthy() {
				log.Printf("[Balancer] Removing unhealthy subscriber %s from group %s (failures: %d)",
					sub.ClientID, group.Name, sub.GetFailCount())
				group.RemoveSubscriber(sub.ID)
			}
		}
	}
}

func (lb *LoadBalancer) dispatchMessage(ctx context.Context, group *model.SubscriptionGroup, msg *model.MQTTMessage, isRetry bool) {
	if lb.dedupTracker != nil {
		if !lb.dedupTracker.TryMark(msg.ID) {
			lb.metrics.mu.Lock()
			lb.metrics.DedupHits++
			lb.metrics.mu.Unlock()
			log.Printf("[Balancer] Message %s already consumed, skipping duplicate dispatch (group: %s)", msg.ID, group.Name)
			return
		}
		lb.metrics.mu.Lock()
		lb.metrics.DedupMisses++
		lb.metrics.mu.Unlock()
	}

	subs := group.GetHealthySubscribers()
	if len(subs) == 0 {
		log.Printf("[Balancer] No healthy subscribers for group %s, queueing for retry", group.Name)
		if lb.config.RetryConfig.Enabled && msg.CanRetry() {
			msg.RecordRetry(fmt.Errorf("no healthy subscribers"), "")
			group.EnqueueRetry(msg)
			lb.metrics.mu.Lock()
			lb.metrics.Retried++
			lb.metrics.mu.Unlock()
		} else {
			group.AddToDeadLetter(msg, "no healthy subscribers available")
			lb.metrics.mu.Lock()
			lb.metrics.DeadLetterCount++
			lb.metrics.mu.Unlock()
		}
		return
	}

	lb.mu.RLock()
	strat := lb.strategies[group.Name]
	lb.mu.RUnlock()

	selected := strat.SelectSubscriber(subs, msg)
	if selected == nil {
		log.Printf("[Balancer] No subscriber selected for group %s", group.Name)
		if lb.config.RetryConfig.Enabled && msg.CanRetry() {
			msg.RecordRetry(fmt.Errorf("no subscriber selected"), "")
			group.EnqueueRetry(msg)
			lb.metrics.mu.Lock()
			lb.metrics.Retried++
			lb.metrics.mu.Unlock()
		} else {
			group.AddToDeadLetter(msg, "no subscriber could be selected")
			lb.metrics.mu.Lock()
			lb.metrics.DeadLetterCount++
			lb.metrics.mu.Unlock()
		}
		return
	}

	select {
	case lb.workerPool <- struct{}{}:
		go func() {
			defer func() { <-lb.workerPool }()

			dispatchStart := time.Now()

			if lb.handler != nil {
				if err := lb.handler(selected, msg); err != nil {
					log.Printf("[Balancer] Error dispatching message to %s (group %s): %v",
						selected.ClientID, group.Name, err)

					selected.RecordFailure()

					if lb.config.RetryConfig.Enabled && msg.CanRetry() {
						msg.RecordRetry(err, selected.ID)
						if !group.EnqueueRetry(msg) {
							log.Printf("[Balancer] Retry queue full for group %s, moving to dead letter", group.Name)
							group.AddToDeadLetter(msg, fmt.Sprintf("retry queue full after %d retries", msg.RetryCount))
							lb.metrics.mu.Lock()
							lb.metrics.DeadLetterCount++
							lb.metrics.mu.Unlock()
						} else {
							lb.metrics.mu.Lock()
							lb.metrics.Retried++
							lb.metrics.mu.Unlock()
						}
					} else {
						group.AddToDeadLetter(msg, fmt.Sprintf("max retries (%d) exceeded: %v", msg.MaxRetries, err))
						lb.metrics.mu.Lock()
						lb.metrics.DeadLetterCount++
						lb.metrics.mu.Unlock()
					}

					if lb.config.RetryConfig.AutoRemoveFailed && !selected.IsHealthy() {
						log.Printf("[Balancer] Subscriber %s marked unhealthy (%d failures), removing from group %s",
							selected.ClientID, selected.GetFailCount(), group.Name)
						group.RemoveSubscriber(selected.ID)
					}
					return
				}
			}

			latency := time.Since(dispatchStart)
			selected.RecordMessage(latency)

			lb.metrics.mu.Lock()
			lb.metrics.Dispatched++
			lb.metrics.TotalDispatchTime += latency
			lb.metrics.AvgDispatchTime = lb.metrics.TotalDispatchTime / time.Duration(lb.metrics.Dispatched)
			lb.metrics.mu.Unlock()

		}()
	default:
		log.Printf("[Balancer] Worker pool full, dropping message for group %s", group.Name)
		if lb.config.RetryConfig.Enabled && msg.CanRetry() {
			msg.RecordRetry(fmt.Errorf("worker pool full"), "")
			group.EnqueueRetry(msg)
			lb.metrics.mu.Lock()
			lb.metrics.Retried++
			lb.metrics.mu.Unlock()
		} else {
			group.AddToDeadLetter(msg, "worker pool full")
			lb.metrics.mu.Lock()
			lb.metrics.DeadLetterCount++
			lb.metrics.mu.Unlock()
		}
	}
}

func (lb *LoadBalancer) GetDeadLetterMessages(groupName string) ([]*model.DeadLetterMessage, error) {
	group, err := lb.GetGroup(groupName)
	if err != nil {
		return nil, err
	}
	return group.GetDeadLetterMessages(), nil
}

func (lb *LoadBalancer) ClearDeadLetter(groupName string) error {
	group, err := lb.GetGroup(groupName)
	if err != nil {
		return err
	}
	group.ClearDeadLetter()
	return nil
}

func (lb *LoadBalancer) ResendDeadLetter(groupName string, msgID string) error {
	group, err := lb.GetGroup(groupName)
	if err != nil {
		return err
	}

	dlms := group.GetDeadLetterMessages()
	for _, dlm := range dlms {
		if dlm.Message.ID == msgID {
			dlm.Message.RetryCount = 0
			dlm.Message.LastError = ""
			group.EnqueueMessage(dlm.Message)
			log.Printf("[Balancer] Resending dead letter message %s to group %s", msgID, groupName)
			return nil
		}
	}
	return fmt.Errorf("dead letter message %s not found", msgID)
}

func (lb *LoadBalancer) Shutdown() {
	log.Println("[Balancer] Shutting down...")
	close(lb.shutdownCh)

	if lb.dedupTracker != nil {
		lb.dedupTracker.Stop()
	}

	lb.mu.RLock()
	for _, group := range lb.groups {
		close(group.MessageQueue)
		if lb.config.RetryConfig.Enabled {
			close(group.RetryQueue)
		}
	}
	lb.mu.RUnlock()

	lb.wg.Wait()
	log.Println("[Balancer] Shutdown complete")
}
