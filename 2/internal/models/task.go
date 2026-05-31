package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type TaskType string
type ScheduleType string
type TaskStatus string

const (
	TaskTypeShell    TaskType = "shell"
	TaskTypeHTTP     TaskType = "http"
	TaskTypeScript   TaskType = "script"

	ScheduleTypeOnce      ScheduleType = "once"
	ScheduleTypeCron      ScheduleType = "cron"
	ScheduleTypeInterval  ScheduleType = "interval"

	TaskStatusPending    TaskStatus = "pending"
	TaskStatusScheduled  TaskStatus = "scheduled"
	TaskStatusRunning    TaskStatus = "running"
	TaskStatusSuccess    TaskStatus = "success"
	TaskStatusFailed     TaskStatus = "failed"
	TaskStatusCancelled  TaskStatus = "cancelled"
	TaskStatusTimeout    TaskStatus = "timeout"
)

type HTTPHeaders map[string]string

type Task struct {
	ID               string         `db:"id" json:"id"`
	TaskGroupID      *string        `db:"task_group_id" json:"task_group_id"`
	Name             string         `db:"name" json:"name"`
	Description      string         `db:"description" json:"description"`
	TaskType         TaskType       `db:"task_type" json:"task_type"`
	Command          string         `db:"command" json:"command"`
	HTTPMethod       string         `db:"http_method" json:"http_method"`
	HTTPURL          string         `db:"http_url" json:"http_url"`
	HTTPHeaders      HTTPHeaders    `db:"http_headers" json:"http_headers"`
	HTTPBody         string         `db:"http_body" json:"http_body"`
	ScheduleType     ScheduleType   `db:"schedule_type" json:"schedule_type"`
	CronExpression   string         `db:"cron_expression" json:"cron_expression"`
	ExecuteAt        *time.Time     `db:"execute_at" json:"execute_at"`
	IntervalSeconds  int            `db:"interval_seconds" json:"interval_seconds"`
	TimeoutSeconds   int            `db:"timeout_seconds" json:"timeout_seconds"`
	MaxRetries       int            `db:"max_retries" json:"max_retries"`
	RetryBackoff     int            `db:"retry_backoff" json:"retry_backoff"`
	Status           TaskStatus     `db:"status" json:"status"`
	CurrentRetry     int            `db:"current_retry" json:"current_retry"`
	NextExecuteAt    *time.Time     `db:"next_execute_at" json:"next_execute_at"`
	LastExecuteAt    *time.Time     `db:"last_execute_at" json:"last_execute_at"`
	MaxCPUPercent    float64        `db:"max_cpu_percent" json:"max_cpu_percent"`
	MaxMemoryMB      int            `db:"max_memory_mb" json:"max_memory_mb"`
	CreatedAt        time.Time      `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time      `db:"updated_at" json:"updated_at"`
	Dependencies     []string       `db:"-" json:"dependencies"`
}

type TaskLog struct {
	ID            int64      `db:"id" json:"id"`
	TaskID        string     `db:"task_id" json:"task_id"`
	ExecutionID   string     `db:"execution_id" json:"execution_id"`
	Status        string     `db:"status" json:"status"`
	ExitCode      int        `db:"exit_code" json:"exit_code"`
	Output        string     `db:"output" json:"output"`
	ErrorMessage  string     `db:"error_message" json:"error_message"`
	StartTime     *time.Time `db:"start_time" json:"start_time"`
	EndTime       *time.Time `db:"end_time" json:"end_time"`
	DurationMs    int64      `db:"duration_ms" json:"duration_ms"`
	ExecutorID    string     `db:"executor_id" json:"executor_id"`
	RetryCount    int        `db:"retry_count" json:"retry_count"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
}

type TaskDependency struct {
	ID               int64     `db:"id" json:"id"`
	TaskID           string    `db:"task_id" json:"task_id"`
	DependencyTaskID string    `db:"dependency_task_id" json:"dependency_task_id"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

type CreateTaskRequest struct {
	TaskGroupID      *string      `json:"task_group_id"`
	Name             string       `json:"name" binding:"required"`
	Description      string       `json:"description"`
	TaskType         TaskType     `json:"task_type" binding:"required"`
	Command          string       `json:"command"`
	HTTPMethod       string       `json:"http_method"`
	HTTPURL          string       `json:"http_url"`
	HTTPHeaders      HTTPHeaders  `json:"http_headers"`
	HTTPBody         string       `json:"http_body"`
	ScheduleType     ScheduleType `json:"schedule_type" binding:"required"`
	CronExpression   string       `json:"cron_expression"`
	ExecuteAt        *time.Time   `json:"execute_at"`
	IntervalSeconds  int          `json:"interval_seconds"`
	TimeoutSeconds   int          `json:"timeout_seconds"`
	MaxRetries       int          `json:"max_retries"`
	RetryBackoff     int          `json:"retry_backoff"`
	MaxCPUPercent    float64      `json:"max_cpu_percent"`
	MaxMemoryMB      int          `json:"max_memory_mb"`
	Dependencies     []string     `json:"dependencies"`
}

type UpdateTaskRequest struct {
	TaskGroupID      *string       `json:"task_group_id"`
	Name             *string       `json:"name"`
	Description      *string       `json:"description"`
	TaskType         *TaskType     `json:"task_type"`
	Command          *string       `json:"command"`
	HTTPMethod       *string       `json:"http_method"`
	HTTPURL          *string       `json:"http_url"`
	HTTPHeaders      *HTTPHeaders  `json:"http_headers"`
	HTTPBody         *string       `json:"http_body"`
	ScheduleType     *ScheduleType `json:"schedule_type"`
	CronExpression   *string       `json:"cron_expression"`
	ExecuteAt        *time.Time    `json:"execute_at"`
	IntervalSeconds  *int          `json:"interval_seconds"`
	TimeoutSeconds   *int          `json:"timeout_seconds"`
	MaxRetries       *int          `json:"max_retries"`
	RetryBackoff     *int          `json:"retry_backoff"`
	Status           *TaskStatus   `json:"status"`
	MaxCPUPercent    *float64      `json:"max_cpu_percent"`
	MaxMemoryMB      *int          `json:"max_memory_mb"`
	Dependencies     *[]string     `json:"dependencies"`
}

type TaskExecutionResult struct {
	TaskID        string `json:"task_id"`
	ExecutionID   string `json:"execution_id"`
	Status        string `json:"status"`
	ExitCode      int    `json:"exit_code"`
	Output        string `json:"output"`
	ErrorMessage  string `json:"error_message"`
	StartTime     int64  `json:"start_time"`
	EndTime       int64  `json:"end_time"`
	ExecutorID    string `json:"executor_id"`
	RetryCount    int    `json:"retry_count"`
}

func (h *HTTPHeaders) Scan(value interface{}) error {
	if value == nil {
		*h = make(HTTPHeaders)
		return nil
	}

	var data []byte
	switch v := value.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("unsupported type for HTTPHeaders: %T", value)
	}

	if len(data) == 0 {
		*h = make(HTTPHeaders)
		return nil
	}

	temp := make(HTTPHeaders)
	if err := json.Unmarshal(data, &temp); err != nil {
		return fmt.Errorf("failed to unmarshal HTTPHeaders: %w", err)
	}

	*h = temp
	return nil
}

func (h HTTPHeaders) Value() (driver.Value, error) {
	if h == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(h)
}
