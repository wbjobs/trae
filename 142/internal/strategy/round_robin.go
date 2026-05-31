package strategy

import (
	"sync/atomic"

	"github.com/mqtt-shared-sub/lb/internal/model"
)

type RoundRobin struct {
	counter uint64
}

func NewRoundRobin() *RoundRobin {
	return &RoundRobin{counter: 0}
}

func (rr *RoundRobin) Name() model.DistributionStrategy {
	return model.StrategyRoundRobin
}

func (rr *RoundRobin) SelectSubscriber(subs []*model.Subscriber, msg *model.MQTTMessage) *model.Subscriber {
	if len(subs) == 0 {
		return nil
	}
	n := atomic.AddUint64(&rr.counter, 1)
	idx := int(n % uint64(len(subs)))
	return subs[idx]
}
