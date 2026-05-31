package strategy

import (
	"time"

	"github.com/mqtt-shared-sub/lb/internal/model"
)

type LRU struct{}

func NewLRU() *LRU {
	return &LRU{}
}

func (l *LRU) Name() model.DistributionStrategy {
	return model.StrategyLRU
}

func (l *LRU) SelectSubscriber(subs []*model.Subscriber, msg *model.MQTTMessage) *model.Subscriber {
	if len(subs) == 0 {
		return nil
	}
	var oldest *model.Subscriber
	oldestTime := time.Now()
	for _, s := range subs {
		lastActive := s.GetLastActiveAt()
		if lastActive.Before(oldestTime) {
			oldestTime = lastActive
			oldest = s
		}
	}
	return oldest
}
