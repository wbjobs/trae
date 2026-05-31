package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"data-cleanse-service/internal/lock"
	"data-cleanse-service/internal/models"
)

type Dispatcher interface {
	TriggerDispatch()
}

type TaskService struct {
	db         *gorm.DB
	locker     *lock.RedisLock
	dispatcher Dispatcher
}

func NewTaskService(db *gorm.DB, locker *lock.RedisLock) *TaskService {
	return &TaskService{
		db:     db,
		locker: locker,
	}
}

func (s *TaskService) SetDispatcher(d Dispatcher) {
	s.dispatcher = d
}

type SubmitTaskRequest struct {
	RequestID   string                `json:"request_id" binding:"required"`
	Priority    string                `json:"priority" binding:"omitempty,oneof=high medium low"`
	CallbackURL string                `json:"callback_url" binding:"required,url"`
	Records     []models.UserRecord   `json:"records" binding:"required,len=1000"`
}

type TaskResponse struct {
	TaskID    string            `json:"task_id"`
	RequestID string            `json:"request_id"`
	Priority  string            `json:"priority"`
	Status    models.TaskStatus `json:"status"`
	Message   string            `json:"message"`
}

func (s *TaskService) SubmitTask(ctx context.Context, req *SubmitTaskRequest) (*TaskResponse, error) {
	handle, locked, err := s.locker.TryLock(ctx, req.RequestID)
	if err != nil {
		return nil, fmt.Errorf("lock error: %w", err)
	}
	if !locked {
		existingTask, err := s.GetTaskByRequestID(ctx, req.RequestID)
		if err == nil {
			return &TaskResponse{
				TaskID:    existingTask.ID,
				RequestID: existingTask.RequestID,
				Priority:  existingTask.Priority.String(),
				Status:    existingTask.Status,
				Message:   "task already submitted",
			}, nil
		}
		return nil, errors.New("task is being processed by another request")
	}
	defer s.locker.Unlock(ctx, handle)

	existingTask, err := s.GetTaskByRequestID(ctx, req.RequestID)
	if err == nil {
		return &TaskResponse{
			TaskID:    existingTask.ID,
			RequestID: existingTask.RequestID,
			Priority:  existingTask.Priority.String(),
			Status:    existingTask.Status,
			Message:   "task already exists",
		}, nil
	}

	priority := models.ParsePriority(req.Priority)
	taskID := uuid.New().String()
	now := time.Now()

	task := &models.Task{
		ID:           taskID,
		RequestID:    req.RequestID,
		Status:       models.StatusPending,
		Priority:     priority,
		CallbackURL:  req.CallbackURL,
		TotalRecords: len(req.Records),
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	for i := range req.Records {
		req.Records[i].TaskID = taskID
		req.Records[i].CreatedAt = now
		req.Records[i].UpdatedAt = now
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(task).Error; err != nil {
			return err
		}
		batchSize := 100
		if err := tx.CreateInBatches(req.Records, batchSize).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	if s.dispatcher != nil {
		s.dispatcher.TriggerDispatch()
	}

	return &TaskResponse{
		TaskID:    taskID,
		RequestID: req.RequestID,
		Priority:  priority.String(),
		Status:    models.StatusPending,
		Message:   "task submitted successfully",
	}, nil
}

func (s *TaskService) GetTaskByRequestID(ctx context.Context, requestID string) (*models.Task, error) {
	var task models.Task
	err := s.db.WithContext(ctx).Where("request_id = ?", requestID).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *TaskService) GetTaskByID(ctx context.Context, taskID string) (*models.Task, error) {
	var task models.Task
	err := s.db.WithContext(ctx).Where("id = ?", taskID).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *TaskService) UpdateTaskStatus(ctx context.Context, taskID string, status models.TaskStatus, errorMsg ...string) error {
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}

	if status == models.StatusRunning {
		now := time.Now()
		updates["started_at"] = &now
	}

	if status == models.StatusDone || status == models.StatusFailed {
		now := time.Now()
		updates["completed_at"] = &now
	}

	if len(errorMsg) > 0 {
		updates["error_msg"] = errorMsg[0]
	}

	return s.db.WithContext(ctx).Model(&models.Task{}).Where("id = ?", taskID).Updates(updates).Error
}

func (s *TaskService) GetPendingTasks(ctx context.Context, limit int) ([]models.Task, error) {
	var tasks []models.Task
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusPending).
		Order("priority DESC, created_at ASC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

func (s *TaskService) GetTaskRecords(ctx context.Context, taskID string) ([]models.UserRecord, error) {
	var records []models.UserRecord
	err := s.db.WithContext(ctx).Where("task_id = ?", taskID).Find(&records).Error
	return records, err
}

func (s *TaskService) UpdateRecord(ctx context.Context, record *models.UserRecord) error {
	record.UpdatedAt = time.Now()
	return s.db.WithContext(ctx).Save(record).Error
}

func (s *TaskService) IncrementProcessedCount(ctx context.Context, taskID string) error {
	return s.db.WithContext(ctx).Model(&models.Task{}).
		Where("id = ?", taskID).
		UpdateColumn("processed_count", gorm.Expr("processed_count + ?", 1)).Error
}

func (s *TaskService) TryLockTask(ctx context.Context, taskID string) (*lock.LockHandle, bool, error) {
	return s.locker.TryLock(ctx, taskID)
}

func (s *TaskService) RenewTaskLock(ctx context.Context, handle *lock.LockHandle) (bool, error) {
	return s.locker.Renew(ctx, handle)
}

func (s *TaskService) UnlockTask(ctx context.Context, handle *lock.LockHandle) error {
	return s.locker.Unlock(ctx, handle)
}

func (s *TaskService) TrySetTaskRunning(ctx context.Context, taskID string) (bool, error) {
	now := time.Now()
	result := s.db.WithContext(ctx).Model(&models.Task{}).
		Where("id = ? AND status = ?", taskID, models.StatusPending).
		Updates(map[string]interface{}{
			"status":     models.StatusRunning,
			"started_at": &now,
			"updated_at": now,
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}
