package models

import (
	"time"
)

type ResourceLimits struct {
	MaxCPUPercent    float64 `db:"max_cpu_percent" json:"max_cpu_percent"`
	MaxMemoryMB      int     `db:"max_memory_mb" json:"max_memory_mb"`
}

type TaskResourceMetrics struct {
	ID          int64      `db:"id" json:"id"`
	TaskID      string     `db:"task_id" json:"task_id"`
	ExecutionID string     `db:"execution_id" json:"execution_id"`
	Timestamp   time.Time  `db:"timestamp" json:"timestamp"`
	CPUPercent  float64    `db:"cpu_percent" json:"cpu_percent"`
	MemoryMB    float64    `db:"memory_mb" json:"memory_mb"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
}

type TaskResourceUsage struct {
	TaskID        string    `json:"task_id"`
	ExecutionID   string    `json:"execution_id"`
	PeakCPU       float64   `json:"peak_cpu"`
	PeakMemory    float64   `json:"peak_memory"`
	AverageCPU    float64   `json:"average_cpu"`
	AverageMemory float64   `json:"average_memory"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
}
