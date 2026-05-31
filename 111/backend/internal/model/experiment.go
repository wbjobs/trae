package model

import (
	"time"

	"github.com/google/uuid"
)

type FaultType string

const (
	FaultDelay     FaultType = "delay"
	FaultAbort     FaultType = "abort"
	FaultInterrupt FaultType = "interrupt"
	FaultCompound  FaultType = "compound"
)

type ExperimentStatus string

const (
	StatusPending   ExperimentStatus = "pending"
	StatusRunning   ExperimentStatus = "running"
	StatusPaused    ExperimentStatus = "paused"
	StatusCompleted ExperimentStatus = "completed"
	StatusFailed    ExperimentStatus = "failed"
)

type DelaySpec struct {
	MinMs int     `json:"min_ms" yaml:"min_ms"`
	MaxMs int     `json:"max_ms" yaml:"max_ms"`
	Percent float64 `json:"percent" yaml:"percent"`
}

type AbortSpec struct {
	HTTPStatus int     `json:"http_status" yaml:"http_status"`
	Percent    float64 `json:"percent" yaml:"percent"`
}

type InterruptSpec struct {
	Percent float64 `json:"percent" yaml:"percent"`
}

type TargetSpec struct {
	Service    string   `json:"service" yaml:"service"`
	Namespace  string   `json:"namespace" yaml:"namespace"`
	Version    string   `json:"version,omitempty" yaml:"version,omitempty"`
	Port       int      `json:"port,omitempty" yaml:"port,omitempty"`
	Subset     string   `json:"subset,omitempty" yaml:"subset,omitempty"`
}

type ChaosExperiment struct {
	ID          string            `json:"id" yaml:"id"`
	Name        string            `json:"name" yaml:"name"`
	Description string            `json:"description,omitempty" yaml:"description,omitempty"`
	FaultType   FaultType         `json:"fault_type" yaml:"fault_type"`
	Delay       *DelaySpec        `json:"delay,omitempty" yaml:"delay,omitempty"`
	Abort       *AbortSpec        `json:"abort,omitempty" yaml:"abort,omitempty"`
	Interrupt   *InterruptSpec    `json:"interrupt,omitempty" yaml:"interrupt,omitempty"`
	Targets     []TargetSpec      `json:"targets" yaml:"targets"`
	Duration    string            `json:"duration" yaml:"duration"`
	Status      ExperimentStatus  `json:"status" yaml:"status"`
	CreatedAt   time.Time         `json:"created_at" yaml:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" yaml:"updated_at"`
	StartedAt   *time.Time        `json:"started_at,omitempty" yaml:"started_at,omitempty"`
	CompletedAt *time.Time        `json:"completed_at,omitempty" yaml:"completed_at,omitempty"`
	Labels      map[string]string `json:"labels,omitempty" yaml:"labels,omitempty"`
}

func NewExperiment(name string, faultType FaultType) *ChaosExperiment {
	return &ChaosExperiment{
		ID:        uuid.New().String(),
		Name:      name,
		FaultType: faultType,
		Status:    StatusPending,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Labels:    make(map[string]string),
	}
}

type ExperimentRequest struct {
	Name        string         `json:"name" binding:"required"`
	Description string         `json:"description"`
	FaultType   FaultType      `json:"fault_type" binding:"required"`
	Delay       *DelaySpec     `json:"delay,omitempty"`
	Abort       *AbortSpec     `json:"abort,omitempty"`
	Interrupt   *InterruptSpec `json:"interrupt,omitempty"`
	Targets     []TargetSpec   `json:"targets" binding:"required"`
	Duration    string         `json:"duration" binding:"required"`
	Labels      map[string]string `json:"labels,omitempty"`
}

type GoldenMetrics struct {
	SuccessRate float64 `json:"success_rate"`
	AvgLatency  float64 `json:"avg_latency_ms"`
	P95Latency  float64 `json:"p95_latency_ms"`
	P99Latency  float64 `json:"p99_latency_ms"`
	QPS         float64 `json:"qps"`
	ErrorRate   float64 `json:"error_rate"`
	Timestamp   time.Time `json:"timestamp"`
}

type ServiceNode struct {
	Service    string `json:"service"`
	Namespace  string `json:"namespace"`
	Version    string `json:"version,omitempty"`
	HasFault   bool   `json:"has_fault"`
	FaultType  string `json:"fault_type,omitempty"`
}

type ServiceEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	HasFault bool `json:"has_fault"`
}

type ServiceTopology struct {
	Nodes []ServiceNode `json:"nodes"`
	Edges []ServiceEdge `json:"edges"`
}

type SLOThreshold struct {
	ID           string  `json:"id" yaml:"id"`
	Service      string  `json:"service" yaml:"service"`
	Namespace    string  `json:"namespace" yaml:"namespace"`
	IsCritical   bool    `json:"is_critical" yaml:"is_critical"`
	MaxAvgLatencyMs  float64 `json:"max_avg_latency_ms" yaml:"max_avg_latency_ms"`
	MaxP95LatencyMs  float64 `json:"max_p95_latency_ms" yaml:"max_p95_latency_ms"`
	MaxP99LatencyMs  float64 `json:"max_p99_latency_ms" yaml:"max_p99_latency_ms"`
	MinSuccessRate  float64 `json:"min_success_rate" yaml:"min_success_rate"`
	MaxErrorRate    float64 `json:"max_error_rate" yaml:"max_error_rate"`
	MinQPS          float64 `json:"min_qps" yaml:"min_qps"`
	AutoStopEnabled bool    `json:"auto_stop_enabled" yaml:"auto_stop_enabled"`
	GracePeriodSeconds int  `json:"grace_period_seconds" yaml:"grace_period_seconds"`
	CreatedAt      time.Time `json:"created_at" yaml:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" yaml:"updated_at"`
}

func NewSLOThreshold(service, namespace string) *SLOThreshold {
	return &SLOThreshold{
		ID:                 uuid.New().String(),
		Service:            service,
		Namespace:          namespace,
		IsCritical:         false,
		MaxAvgLatencyMs:    500,
		MaxP95LatencyMs:    1000,
		MaxP99LatencyMs:    2000,
		MinSuccessRate:     95.0,
		MaxErrorRate:       5.0,
		MinQPS:             1.0,
		AutoStopEnabled:    true,
		GracePeriodSeconds: 30,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}
}

type SLOThresholdRequest struct {
	Service      string  `json:"service" binding:"required"`
	Namespace    string  `json:"namespace" binding:"required"`
	IsCritical   bool    `json:"is_critical"`
	MaxAvgLatencyMs  float64 `json:"max_avg_latency_ms"`
	MaxP95LatencyMs  float64 `json:"max_p95_latency_ms"`
	MaxP99LatencyMs  float64 `json:"max_p99_latency_ms"`
	MinSuccessRate  float64 `json:"min_success_rate"`
	MaxErrorRate    float64 `json:"max_error_rate"`
	MinQPS          float64 `json:"min_qps"`
	AutoStopEnabled bool    `json:"auto_stop_enabled"`
	GracePeriodSeconds int  `json:"grace_period_seconds"`
}

type SLOViolation struct {
	Service     string  `json:"service"`
	Namespace   string  `json:"namespace"`
	Metric      string  `json:"metric"`
	Threshold   float64 `json:"threshold"`
	Actual      float64 `json:"actual"`
	Severity    string  `json:"severity"`
	IsCritical  bool    `json:"is_critical"`
}

type SafetyActionType string

const (
	ActionPause    SafetyActionType = "pause"
	ActionStop     SafetyActionType = "stop"
	ActionWarn     SafetyActionType = "warn"
	ActionAutoStop SafetyActionType = "auto_stop"
)

type SafetyEvent struct {
	ID            string           `json:"id"`
	Timestamp     time.Time        `json:"timestamp"`
	ExperimentID  string           `json:"experiment_id"`
	ExperimentName string          `json:"experiment_name"`
	Action        SafetyActionType `json:"action"`
	Reason        string           `json:"reason"`
	Violations    []SLOViolation   `json:"violations"`
	Service       string           `json:"service"`
	Namespace     string           `json:"namespace"`
	MetricsBefore *GoldenMetrics   `json:"metrics_before,omitempty"`
	MetricsAfter  *GoldenMetrics   `json:"metrics_after,omitempty"`
}

type BlastRadiusAssessment struct {
	Service        string         `json:"service"`
	Namespace      string         `json:"namespace"`
	IsCritical     bool           `json:"is_critical"`
	HasSLO         bool           `json:"has_slo"`
	EstimatedImpact string        `json:"estimated_impact"`
	RiskLevel      string         `json:"risk_level"`
	SLOThreshold   *SLOThreshold  `json:"slo_threshold,omitempty"`
}

func NewSafetyEvent(expID, expName string, action SafetyActionType, reason string) *SafetyEvent {
	return &SafetyEvent{
		ID:             uuid.New().String(),
		Timestamp:      time.Now(),
		ExperimentID:   expID,
		ExperimentName: expName,
		Action:         action,
		Reason:         reason,
		Violations:     make([]SLOViolation, 0),
	}
}
