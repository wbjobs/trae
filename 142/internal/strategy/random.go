package strategy

import (
	"math/rand"

	"github.com/mqtt-shared-sub/lb/internal/model"
)

type Random struct{}

func NewRandom() *Random {
	return &Random{}
}

func (r *Random) Name() model.DistributionStrategy {
	return model.StrategyRandom
}

func (r *Random) SelectSubscriber(subs []*model.Subscriber, msg *model.MQTTMessage) *model.Subscriber {
	if len(subs) == 0 {
		return nil
	}
	idx := rand.Intn(len(subs))
	return subs[idx]
}
