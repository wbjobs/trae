package store

import (
	"fmt"
	"hash/fnv"
	"sync"

	pb "order-workflow/api/proto"
)

const shardCount = 256

type shard struct {
	mu      sync.RWMutex
	orders  map[string]*pb.Order
	history map[string][]*pb.StateTransition
}

type OrderStore struct {
	shards [shardCount]*shard
}

func NewOrderStore() *OrderStore {
	s := &OrderStore{}
	for i := 0; i < shardCount; i++ {
		s.shards[i] = &shard{
			orders:  make(map[string]*pb.Order),
			history: make(map[string][]*pb.StateTransition),
		}
	}
	return s
}

func (s *OrderStore) getShard(key string) *shard {
	h := fnv.New32a()
	h.Write([]byte(key))
	return s.shards[h.Sum32()%shardCount]
}

func (s *OrderStore) Save(order *pb.Order) {
	sh := s.getShard(order.OrderId)
	sh.mu.Lock()
	defer sh.mu.Unlock()
	sh.orders[order.OrderId] = order
}

func (s *OrderStore) Get(orderID string) (*pb.Order, error) {
	sh := s.getShard(orderID)
	sh.mu.RLock()
	defer sh.mu.RUnlock()
	o, ok := sh.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("order %s not found", orderID)
	}
	return o, nil
}

func (s *OrderStore) GetAll() []*pb.Order {
	result := make([]*pb.Order, 0)
	for i := 0; i < shardCount; i++ {
		sh := s.shards[i]
		sh.mu.RLock()
		for _, o := range sh.orders {
			result = append(result, o)
		}
		sh.mu.RUnlock()
	}
	return result
}

func (s *OrderStore) AddTransition(orderID string, from, to pb.OrderState, event pb.OrderEvent, reason string, ts int64) {
	sh := s.getShard(orderID)
	sh.mu.Lock()
	defer sh.mu.Unlock()
	t := &pb.StateTransition{
		FromState: from,
		ToState:   to,
		Event:     event,
		Timestamp: ts,
		Reason:    reason,
	}
	sh.history[orderID] = append(sh.history[orderID], t)
}

func (s *OrderStore) GetHistory(orderID string) ([]*pb.StateTransition, error) {
	sh := s.getShard(orderID)
	sh.mu.RLock()
	defer sh.mu.RUnlock()
	h, ok := sh.history[orderID]
	if !ok {
		return nil, fmt.Errorf("order %s not found", orderID)
	}
	return h, nil
}

func (s *OrderStore) Count() int {
	total := 0
	for i := 0; i < shardCount; i++ {
		sh := s.shards[i]
		sh.mu.RLock()
		total += len(sh.orders)
		sh.mu.RUnlock()
	}
	return total
}
