package sla

import (
	"fmt"
	"time"

	pb "order-workflow/api/proto"
	"order-workflow/internal/config"
)

type SLAThreshold struct {
	State       pb.OrderState
	MaxDuration time.Duration
	Description string
}

type Config struct {
	Thresholds map[pb.OrderState]SLAThreshold
	Enabled    bool
}

func ConfigFromAppConfig(cfg config.SLAConfig) Config {
	thresholds := map[pb.OrderState]SLAThreshold{
		pb.OrderState_CREATED: {
			State:       pb.OrderState_CREATED,
			MaxDuration: cfg.CreatedTimeout,
			Description: "订单创建后应快速进入待支付",
		},
		pb.OrderState_PENDING_PAYMENT: {
			State:       pb.OrderState_PENDING_PAYMENT,
			MaxDuration: cfg.PendingPaymentTimeout,
			Description: "待支付超时（30分钟未支付自动取消）",
		},
		pb.OrderState_PAYING: {
			State:       pb.OrderState_PAYING,
			MaxDuration: cfg.PayingTimeout,
			Description: "支付处理超时",
		},
		pb.OrderState_PAID: {
			State:       pb.OrderState_PAID,
			MaxDuration: cfg.PaidTimeout,
			Description: "已支付待发货超时",
		},
		pb.OrderState_SHIPPED: {
			State:       pb.OrderState_SHIPPED,
			MaxDuration: cfg.ShippedTimeout,
			Description: "已发货待收货超时",
		},
	}

	return Config{
		Thresholds: thresholds,
		Enabled:    cfg.Enabled,
	}
}

func DefaultConfig() Config {
	return Config{
		Thresholds: map[pb.OrderState]SLAThreshold{
			pb.OrderState_CREATED:         {State: pb.OrderState_CREATED, MaxDuration: 5 * time.Second, Description: "订单创建后应快速进入待支付"},
			pb.OrderState_PENDING_PAYMENT: {State: pb.OrderState_PENDING_PAYMENT, MaxDuration: 30 * time.Minute, Description: "待支付超时（30分钟未支付自动取消）"},
			pb.OrderState_PAYING:          {State: pb.OrderState_PAYING, MaxDuration: 10 * time.Second, Description: "支付处理超时"},
			pb.OrderState_PAID:            {State: pb.OrderState_PAID, MaxDuration: 5 * time.Minute, Description: "已支付待发货超时"},
			pb.OrderState_SHIPPED:         {State: pb.OrderState_SHIPPED, MaxDuration: 30 * time.Minute, Description: "已发货待收货超时"},
		},
		Enabled: true,
	}
}

func (c Config) GetThreshold(state pb.OrderState) (SLAThreshold, bool) {
	t, ok := c.Thresholds[state]
	return t, ok
}

type SLAViolation struct {
	OrderID       string
	State         pb.OrderState
	StateName     string
	Duration      time.Duration
	MaxDuration   time.Duration
	Description   string
	ThresholdDesc string
	ViolatedAt    int64
	Severity      Severity
}

type Severity string

const (
	SeverityWarning  Severity = "WARNING"
	SeverityCritical Severity = "CRITICAL"
)

func (v SLAViolation) String() string {
	return fmt.Sprintf("[%s] Order %s in state %s for %v (limit: %v) - %s",
		v.Severity, v.OrderID, v.StateName, v.Duration, v.MaxDuration, v.Description)
}

func CheckStateDuration(orderID string, state pb.OrderState, enteredAt, now int64, cfg Config) *SLAViolation {
	if !cfg.Enabled {
		return nil
	}

	threshold, ok := cfg.GetThreshold(state)
	if !ok {
		return nil
	}

	duration := time.Duration(now-enteredAt) * time.Second

	if duration > threshold.MaxDuration {
		severity := SeverityWarning
		if duration > threshold.MaxDuration*2 {
			severity = SeverityCritical
		}

		return &SLAViolation{
			OrderID:       orderID,
			State:         state,
			StateName:     state.String(),
			Duration:      duration,
			MaxDuration:   threshold.MaxDuration,
			Description:   threshold.Description,
			ThresholdDesc: threshold.Description,
			ViolatedAt:    now,
			Severity:      severity,
		}
	}
	return nil
}
