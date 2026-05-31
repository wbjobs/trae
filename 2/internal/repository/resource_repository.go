package repository

import (
	"fmt"
	"time"

	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/models"
)

type ResourceRepository struct{}

func NewResourceRepository() *ResourceRepository {
	return &ResourceRepository{}
}

func (r *ResourceRepository) SaveResourceMetric(metric *models.TaskResourceMetrics) error {
	db := database.GetDB()

	query := `
	INSERT INTO task_resource_metrics (task_id, execution_id, timestamp, cpu_percent, memory_mb)
	VALUES (?, ?, ?, ?, ?)
	`

	_, err := db.Exec(query,
		metric.TaskID, metric.ExecutionID,
		metric.Timestamp, metric.CPUPercent, metric.MemoryMB,
	)
	if err != nil {
		return fmt.Errorf("failed to save resource metric: %w", err)
	}

	return nil
}

func (r *ResourceRepository) GetExecutionMetrics(taskID, executionID string) ([]*models.TaskResourceMetrics, error) {
	db := database.GetDB()
	var metrics []*models.TaskResourceMetrics

	query := `
	SELECT * FROM task_resource_metrics 
	WHERE task_id = ? AND execution_id = ? 
	ORDER BY timestamp ASC
	`
	if err := db.Select(&metrics, query, taskID, executionID); err != nil {
		return nil, fmt.Errorf("failed to get execution metrics: %w", err)
	}

	return metrics, nil
}

func (r *ResourceRepository) GetTaskMetrics(taskID string, limit, offset int) ([]*models.TaskResourceMetrics, int, error) {
	db := database.GetDB()
	var metrics []*models.TaskResourceMetrics

	countQuery := `SELECT COUNT(*) FROM task_resource_metrics WHERE task_id = ?`
	var total int
	if err := db.Get(&total, countQuery, taskID); err != nil {
		return nil, 0, fmt.Errorf("failed to count task metrics: %w", err)
	}

	query := `
	SELECT * FROM task_resource_metrics 
	WHERE task_id = ? 
	ORDER BY timestamp DESC 
	LIMIT ? OFFSET ?
	`
	if err := db.Select(&metrics, query, taskID, limit, offset); err != nil {
		return nil, 0, fmt.Errorf("failed to get task metrics: %w", err)
	}

	return metrics, total, nil
}

func (r *ResourceRepository) GetExecutionResourceUsage(taskID, executionID string) (*models.TaskResourceUsage, error) {
	metrics, err := r.GetExecutionMetrics(taskID, executionID)
	if err != nil {
		return nil, err
	}

	if len(metrics) == 0 {
		return nil, nil
	}

	var peakCPU, peakMemory float64
	var totalCPU, totalMemory float64

	for _, m := range metrics {
		if m.CPUPercent > peakCPU {
			peakCPU = m.CPUPercent
		}
		if m.MemoryMB > peakMemory {
			peakMemory = m.MemoryMB
		}
		totalCPU += m.CPUPercent
		totalMemory += m.MemoryMB
	}

	usage := &models.TaskResourceUsage{
		TaskID:        taskID,
		ExecutionID:   executionID,
		PeakCPU:       peakCPU,
		PeakMemory:    peakMemory,
		AverageCPU:    totalCPU / float64(len(metrics)),
		AverageMemory: totalMemory / float64(len(metrics)),
		StartTime:     metrics[0].Timestamp,
		EndTime:       metrics[len(metrics)-1].Timestamp,
	}

	return usage, nil
}

func (r *ResourceRepository) ClearTaskMetrics(taskID string) error {
	db := database.GetDB()
	query := `DELETE FROM task_resource_metrics WHERE task_id = ?`
	_, err := db.Exec(query, taskID)
	return err
}

func (r *ResourceRepository) ClearExecutionMetrics(taskID, executionID string) error {
	db := database.GetDB()
	query := `DELETE FROM task_resource_metrics WHERE task_id = ? AND execution_id = ?`
	_, err := db.Exec(query, taskID, executionID)
	return err
}
