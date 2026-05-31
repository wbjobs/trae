package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/models"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type TaskRepository struct{}

func NewTaskRepository() *TaskRepository {
	return &TaskRepository{}
}

func (r *TaskRepository) CreateTask(req *models.CreateTaskRequest) (*models.Task, error) {
	db := database.GetDB()
	tx, err := db.Beginx()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	taskID := uuid.New().String()
	task := &models.Task{
		ID:              taskID,
		TaskGroupID:     req.TaskGroupID,
		Name:            req.Name,
		Description:     req.Description,
		TaskType:        req.TaskType,
		Command:         req.Command,
		HTTPMethod:      req.HTTPMethod,
		HTTPURL:         req.HTTPURL,
		HTTPHeaders:     req.HTTPHeaders,
		HTTPBody:        req.HTTPBody,
		ScheduleType:    req.ScheduleType,
		CronExpression:  req.CronExpression,
		ExecuteAt:       req.ExecuteAt,
		IntervalSeconds: req.IntervalSeconds,
		TimeoutSeconds:  req.TimeoutSeconds,
		MaxRetries:      req.MaxRetries,
		RetryBackoff:    req.RetryBackoff,
		Status:          models.TaskStatusPending,
		CurrentRetry:    0,
		MaxCPUPercent:   req.MaxCPUPercent,
		MaxMemoryMB:     req.MaxMemoryMB,
	}

	if task.TimeoutSeconds == 0 {
		task.TimeoutSeconds = 30
	}
	if task.RetryBackoff == 0 {
		task.RetryBackoff = 1
	}

	nextExecuteAt, err := calculateNextExecuteTime(task)
	if err != nil {
		return nil, err
	}
	task.NextExecuteAt = nextExecuteAt

	query := `
	INSERT INTO tasks (id, task_group_id, name, description, task_type, command, http_method, http_url, http_headers, http_body,
		schedule_type, cron_expression, execute_at, interval_seconds, timeout_seconds, max_retries, retry_backoff,
		status, current_retry, next_execute_at, max_cpu_percent, max_memory_mb)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err = tx.Exec(query,
		task.ID, task.TaskGroupID, task.Name, task.Description, task.TaskType, task.Command, task.HTTPMethod,
		task.HTTPURL, task.HTTPHeaders, task.HTTPBody, task.ScheduleType, task.CronExpression,
		task.ExecuteAt, task.IntervalSeconds, task.TimeoutSeconds, task.MaxRetries, task.RetryBackoff,
		task.Status, task.CurrentRetry, task.NextExecuteAt, task.MaxCPUPercent, task.MaxMemoryMB,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	if len(req.Dependencies) > 0 {
		if err := r.saveDependencies(tx, taskID, req.Dependencies); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	task.Dependencies = req.Dependencies
	return task, nil
}

func (r *TaskRepository) GetTaskByID(id string) (*models.Task, error) {
	db := database.GetDB()
	task := &models.Task{}

	query := `SELECT * FROM tasks WHERE id = ?`
	if err := db.Get(task, query, id); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	dependencies, err := r.GetTaskDependencies(id)
	if err != nil {
		return nil, err
	}
	task.Dependencies = dependencies

	return task, nil
}

func (r *TaskRepository) GetTaskDependencies(taskID string) ([]string, error) {
	db := database.GetDB()
	var dependencies []string

	query := `SELECT dependency_task_id FROM task_dependencies WHERE task_id = ?`
	rows, err := db.Query(query, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to get dependencies: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var depID string
		if err := rows.Scan(&depID); err != nil {
			return nil, err
		}
		dependencies = append(dependencies, depID)
	}

	return dependencies, nil
}

func (r *TaskRepository) UpdateTask(id string, req *models.UpdateTaskRequest) (*models.Task, error) {
	task, err := r.GetTaskByID(id)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, nil
	}

	db := database.GetDB()
	tx, err := db.Beginx()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if req.Name != nil {
		task.Name = *req.Name
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.TaskType != nil {
		task.TaskType = *req.TaskType
	}
	if req.Command != nil {
		task.Command = *req.Command
	}
	if req.HTTPMethod != nil {
		task.HTTPMethod = *req.HTTPMethod
	}
	if req.HTTPURL != nil {
		task.HTTPURL = *req.HTTPURL
	}
	if req.HTTPHeaders != nil {
		task.HTTPHeaders = *req.HTTPHeaders
	}
	if req.HTTPBody != nil {
		task.HTTPBody = *req.HTTPBody
	}
	if req.ScheduleType != nil {
		task.ScheduleType = *req.ScheduleType
	}
	if req.CronExpression != nil {
		task.CronExpression = *req.CronExpression
	}
	if req.ExecuteAt != nil {
		task.ExecuteAt = req.ExecuteAt
	}
	if req.IntervalSeconds != nil {
		task.IntervalSeconds = *req.IntervalSeconds
	}
	if req.TimeoutSeconds != nil {
		task.TimeoutSeconds = *req.TimeoutSeconds
	}
	if req.MaxRetries != nil {
		task.MaxRetries = *req.MaxRetries
	}
	if req.RetryBackoff != nil {
		task.RetryBackoff = *req.RetryBackoff
	}
	if req.Status != nil {
		task.Status = *req.Status
	}
	if req.MaxCPUPercent != nil {
		task.MaxCPUPercent = *req.MaxCPUPercent
	}
	if req.MaxMemoryMB != nil {
		task.MaxMemoryMB = *req.MaxMemoryMB
	}
	if req.TaskGroupID != nil {
		task.TaskGroupID = req.TaskGroupID
	}

	query := `
	UPDATE tasks SET task_group_id=?, name=?, description=?, task_type=?, command=?, http_method=?, http_url=?, 
		http_headers=?, http_body=?, schedule_type=?, cron_expression=?, execute_at=?, interval_seconds=?,
		timeout_seconds=?, max_retries=?, retry_backoff=?, status=?, max_cpu_percent=?, max_memory_mb=?
	WHERE id=?
	`

	_, err = tx.Exec(query,
		task.TaskGroupID, task.Name, task.Description, task.TaskType, task.Command, task.HTTPMethod,
		task.HTTPURL, task.HTTPHeaders, task.HTTPBody, task.ScheduleType, task.CronExpression,
		task.ExecuteAt, task.IntervalSeconds, task.TimeoutSeconds, task.MaxRetries,
		task.RetryBackoff, task.Status, task.MaxCPUPercent, task.MaxMemoryMB, task.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update task: %w", err)
	}

	if req.Dependencies != nil {
		if err := r.clearDependencies(tx, task.ID); err != nil {
			return nil, err
		}
		if len(*req.Dependencies) > 0 {
			if err := r.saveDependencies(tx, task.ID, *req.Dependencies); err != nil {
				return nil, err
			}
		}
		task.Dependencies = *req.Dependencies
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return task, nil
}

func (r *TaskRepository) DeleteTask(id string) error {
	db := database.GetDB()
	tx, err := db.Beginx()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM task_dependencies WHERE task_id = ? OR dependency_task_id = ?`, id, id); err != nil {
		return fmt.Errorf("failed to delete dependencies: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM task_logs WHERE task_id = ?`, id); err != nil {
		return fmt.Errorf("failed to delete task logs: %w", err)
	}

	result, err := tx.Exec(`DELETE FROM tasks WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return nil
	}

	return tx.Commit()
}

func (r *TaskRepository) ListTasks(limit, offset int) ([]*models.Task, int, error) {
	db := database.GetDB()
	var tasks []*models.Task

	countQuery := `SELECT COUNT(*) FROM tasks`
	var total int
	if err := db.Get(&total, countQuery); err != nil {
		return nil, 0, fmt.Errorf("failed to count tasks: %w", err)
	}

	query := `SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?`
	if err := db.Select(&tasks, query, limit, offset); err != nil {
		return nil, 0, fmt.Errorf("failed to list tasks: %w", err)
	}

	for _, task := range tasks {
		dependencies, err := r.GetTaskDependencies(task.ID)
		if err != nil {
			return nil, 0, err
		}
		task.Dependencies = dependencies
	}

	return tasks, total, nil
}

func (r *TaskRepository) GetPendingTasks(now time.Time) ([]*models.Task, error) {
	db := database.GetDB()
	var tasks []*models.Task

	query := `
	SELECT * FROM tasks 
	WHERE status IN (?, ?) 
	AND next_execute_at <= ?
	ORDER BY next_execute_at ASC
	`

	if err := db.Select(&tasks, query, models.TaskStatusPending, models.TaskStatusScheduled, now); err != nil {
		return nil, fmt.Errorf("failed to get pending tasks: %w", err)
	}

	return tasks, nil
}

func (r *TaskRepository) UpdateTaskStatus(taskID string, status models.TaskStatus) error {
	db := database.GetDB()
	query := `UPDATE tasks SET status = ? WHERE id = ?`
	_, err := db.Exec(query, status, taskID)
	if err != nil {
		return fmt.Errorf("failed to update task status: %w", err)
	}
	return nil
}

func (r *TaskRepository) UpdateTaskForExecution(taskID, executionID string, now time.Time) error {
	db := database.GetDB()
	query := `
	UPDATE tasks SET 
		status = ?, 
		current_retry = current_retry,
		last_execute_at = ?
	WHERE id = ?
	`
	_, err := db.Exec(query, models.TaskStatusRunning, now, taskID)
	if err != nil {
		return fmt.Errorf("failed to update task for execution: %w", err)
	}
	return nil
}

func (r *TaskRepository) UpdateTaskAfterExecution(taskID string, success bool, now time.Time) error {
	db := database.GetDB()
	task, err := r.GetTaskByID(taskID)
	if err != nil {
		return err
	}
	if task == nil {
		return nil
	}

	var status models.TaskStatus
	var nextExecuteAt *time.Time

	if success {
		if task.ScheduleType == models.ScheduleTypeOnce {
			status = models.TaskStatusSuccess
			nextExecuteAt = nil
		} else {
			status = models.TaskStatusScheduled
			nextExecuteAt, err = calculateNextExecuteTime(task)
			if err != nil {
				return err
			}
		}

		query := `
		UPDATE tasks SET 
			status = ?, 
			current_retry = 0,
			next_execute_at = ?
		WHERE id = ?
		`
		_, err = db.Exec(query, status, nextExecuteAt, taskID)
	} else {
		if task.CurrentRetry >= task.MaxRetries {
			status = models.TaskStatusFailed
			query := `UPDATE tasks SET status = ? WHERE id = ?`
			_, err = db.Exec(query, status, taskID)
		} else {
			status = models.TaskStatusScheduled
			backoffSeconds := task.RetryBackoff * (1 << task.CurrentRetry)
			nextTime := now.Add(time.Duration(backoffSeconds) * time.Second)
			query := `
			UPDATE tasks SET 
				status = ?, 
				current_retry = current_retry + 1,
				next_execute_at = ?
			WHERE id = ?
			`
			_, err = db.Exec(query, status, nextTime, taskID)
		}
	}

	if err != nil {
		return fmt.Errorf("failed to update task after execution: %w", err)
	}
	return nil
}

func (r *TaskRepository) saveDependencies(tx *sqlx.Tx, taskID string, dependencies []string) error {
	query := `INSERT IGNORE INTO task_dependencies (task_id, dependency_task_id) VALUES (?, ?)`
	for _, depID := range dependencies {
		if _, err := tx.Exec(query, taskID, depID); err != nil {
			return fmt.Errorf("failed to save dependency: %w", err)
		}
	}
	return nil
}

func (r *TaskRepository) clearDependencies(tx *sqlx.Tx, taskID string) error {
	query := `DELETE FROM task_dependencies WHERE task_id = ?`
	if _, err := tx.Exec(query, taskID); err != nil {
		return fmt.Errorf("failed to clear dependencies: %w", err)
	}
	return nil
}

func calculateNextExecuteTime(task *models.Task) (*time.Time, error) {
	now := time.Now()

	switch task.ScheduleType {
	case models.ScheduleTypeOnce:
		if task.ExecuteAt != nil {
			return task.ExecuteAt, nil
		}
		return &now, nil

	case models.ScheduleTypeInterval:
		if task.IntervalSeconds > 0 {
			nextTime := now.Add(time.Duration(task.IntervalSeconds) * time.Second)
			return &nextTime, nil
		}
		return &now, nil

	case models.ScheduleTypeCron:
		return &now, nil

	default:
		return &now, nil
	}
}

func (r *TaskRepository) BatchPauseTasks(taskIDs []string) *models.BatchOperationResult {
	return r.batchUpdateStatus(taskIDs, models.TaskStatusPending, false)
}

func (r *TaskRepository) BatchResumeTasks(taskIDs []string) *models.BatchOperationResult {
	return r.batchUpdateStatus(taskIDs, models.TaskStatusScheduled, true)
}

func (r *TaskRepository) BatchCancelTasks(taskIDs []string) *models.BatchOperationResult {
	return r.batchUpdateStatus(taskIDs, models.TaskStatusCancelled, false)
}

func (r *TaskRepository) batchUpdateStatus(taskIDs []string, targetStatus models.TaskStatus, resetNextExecute bool) *models.BatchOperationResult {
	if len(taskIDs) == 0 {
		return &models.BatchOperationResult{SuccessCount: 0, FailedCount: 0}
	}

	db := database.GetDB()
	result := &models.BatchOperationResult{FailedIDs: make([]string, 0)}

	placeholders := make([]string, len(taskIDs))
	args := make([]interface{}, 0, len(taskIDs)+2)

	for i := range taskIDs {
		placeholders[i] = "?"
		args = append(args, taskIDs[i])
	}

	var query string
	if resetNextExecute {
		query = fmt.Sprintf(`
			UPDATE tasks SET status = ?, next_execute_at = NOW()
			WHERE id IN (%s) AND status != ?
		`, strings.Join(placeholders, ","))
		args = append([]interface{}{targetStatus}, args...)
		args = append(args, models.TaskStatusRunning)
	} else {
		query = fmt.Sprintf(`
			UPDATE tasks SET status = ?
			WHERE id IN (%s) AND status != ?
		`, strings.Join(placeholders, ","))
		args = append([]interface{}{targetStatus}, args...)
		args = append(args, models.TaskStatusRunning)
	}

	execResult, err := db.Exec(query, args...)
	if err != nil {
		result.FailedCount = len(taskIDs)
		result.FailedIDs = taskIDs
		return result
	}

	affected, _ := execResult.RowsAffected()
	result.SuccessCount = int(affected)
	result.FailedCount = len(taskIDs) - result.SuccessCount

	return result
}

func (r *TaskRepository) BatchPauseTasksByGroup(groupID string) *models.BatchOperationResult {
	tasks, err := r.getTaskIDsByGroup(groupID)
	if err != nil {
		return &models.BatchOperationResult{FailedCount: 0}
	}
	return r.BatchPauseTasks(tasks)
}

func (r *TaskRepository) BatchResumeTasksByGroup(groupID string) *models.BatchOperationResult {
	tasks, err := r.getTaskIDsByGroup(groupID)
	if err != nil {
		return &models.BatchOperationResult{FailedCount: 0}
	}
	return r.BatchResumeTasks(tasks)
}

func (r *TaskRepository) BatchCancelTasksByGroup(groupID string) *models.BatchOperationResult {
	tasks, err := r.getTaskIDsByGroup(groupID)
	if err != nil {
		return &models.BatchOperationResult{FailedCount: 0}
	}
	return r.BatchCancelTasks(tasks)
}

func (r *TaskRepository) getTaskIDsByGroup(groupID string) ([]string, error) {
	db := database.GetDB()
	var taskIDs []string

	query := `SELECT id FROM tasks WHERE task_group_id = ?`
	if err := db.Select(&taskIDs, query, groupID); err != nil {
		return nil, err
	}

	return taskIDs, nil
}
