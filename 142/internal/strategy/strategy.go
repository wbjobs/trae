package strategy

import (
	"github.com/mqtt-shared-sub/lb/internal/model"
)

type Strategy interface {
	Name() model.DistributionStrategy
	SelectSubscriber(subs []*model.Subscriber, msg *model.MQTTMessage) *model.Subscriber
}

func NewStrategy(name model.DistributionStrategy) Strategy {
	switch name {
	case model.StrategyRoundRobin:
		return NewRoundRobin()
	case model.StrategyRandom:
		return NewRandom()
	case model.StrategyLRU:
		return NewLRU()
	default:
		return NewRoundRobin()
	}
}
