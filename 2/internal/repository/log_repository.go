package repository

import (
	"fmt"
	"time"

	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/models"
	"github.com/google/uuid"
)

type LogRepository struct{}

func NewLogRepository() *LogRepository {
	return &LogRepository{}
}

func (r *LogRepository) CreateTaskLog(result *models.TaskExecutionResult) (*models.TaskLog, error) {
	db := database.GetDB()

	startTime := time.Unix(0, result.StartTime*int64(time.Millisecond))
	endTime := time.Unix(0, result.EndTime*int64(time.Millisecond))
	durationMs := result.EndTime - result.StartTime

	log := &models.TaskLog{
		TaskID:       result.TaskID,
		ExecutionID:   result.ExecutionID,
		Status:        result.Status,
		ExitCode:      result.ExitCode,
		Output:        result.Output,
		ErrorMessage:  result.ErrorMessage,
		StartTime:     &startTime,
		EndTime:       &endTime,
		DurationMs:    durationMs,
		ExecutorID:    result.ExecutorID,
		RetryCount:    result.RetryCount,
	}

	query := `
	INSERT INTO task_logs (task_id, execution_id, status, exit_code, output, error_message,
		start_time, end_time, duration_ms, executor_id, retry_count)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	resultDB, err := db.Exec(query,
		log.TaskID, log.ExecutionID, log.Status, log.ExitCode, log.Output,
		log.ErrorMessage, log.StartTime, log.EndTime, log.DurationMs,
		log.ExecutorID, log.RetryCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create task log: %w", err)
	}

	id, _ := resultDB.LastInsertId()
	log.ID = id

	return log, nil
}

func (r *LogRepository) GetTaskLogs(taskID string, limit, offset int) ([]*models.TaskLog, int, error) {
	db := database.GetDB()
	var logs []*models.TaskLog

	countQuery := `SELECT COUNT(*) FROM task_logs WHERE task_id = ?`
	var total int
	if err := db.Get(&total, countQuery, taskID); err != nil {
		return nil, 0, fmt.Errorf("failed to count task logs: %w", err)
	}

	query := `
	SELECT * FROM task_logs 
	WHERE task_id = ? 
	ORDER BY created_at DESC 
	LIMIT ? OFFSET ?
	`
	if err := db.Select(&logs, query, taskID, limit, offset); err != nil {
		return nil, 0, fmt.Errorf("failed to get task logs: %w", err)
	}

	return logs, total, nil
}

func (r *LogRepository) GetLogByID(id int64) (*models.TaskLog, error) {
	db := database.GetDB()
	log := &models.TaskLog{}

	query := `SELECT * FROM task_logs WHERE id = ?`
	if err := db.Get(log, query, id); err != nil {
		return nil, fmt.Errorf("failed to get log: %w", err)
	}

	return log, nil
}

func (r *LogRepository) GetLogByExecutionID(executionID string) (*models.TaskLog, error) {
	db := database.GetDB()
	log := &models.TaskLog{}

	query := `SELECT * FROM task_logs WHERE execution_id = ?`
	if err := db.Get(log, query, executionID); err != nil {
		return nil, fmt.Errorf("failed to get log by execution ID: %w", err)
	}

	return log, nil
}

func (r *LogRepository) UpdateTaskLogOutput(executionID, output string) error {
	db := database.GetDB()
	query := `UPDATE task_logs SET output = CONCAT(output, ?) WHERE execution_id = ?`
	_, err := db.Exec(query, output, executionID)
	if err != nil {
		return fmt.Errorf("failed to update task log output: %w", err)
	}
	return nil
}

func GenerateExecutionID() string {
	return uuid.New().String()
}
