package scheduler

import (
	"encoding/json"
	"log"
	"time"

	"github.com/distributed-scheduler/internal/alert"
	"github.com/distributed-scheduler/internal/config"
	redisClient "github.com/distributed-scheduler/internal/redis"
	"github.com/distributed-scheduler/internal/repository"
	"github.com/distributed-scheduler/internal/models"
	"github.com/go-redis/redis/v8"
)

type Scheduler struct {
	taskRepo *repository.TaskRepository
	logRepo  *repository.LogRepository
	stopCh   chan struct{}
}

var scheduler *Scheduler

func Start() {
	log.Println("Starting scheduler...")

	scheduler = &Scheduler{
		taskRepo: repository.NewTaskRepository(),
		logRepo:  repository.NewLogRepository(),
		stopCh:   make(chan struct{}),
	}

	go scheduler.run()
	go scheduler.processResults()
}

func Stop() {
	if scheduler != nil {
		close(scheduler.stopCh)
	}
}

func (s *Scheduler) run() {
	scanInterval := time.Duration(config.GetConfig().Scheduler.ScanInterval) * time.Second
	ticker := time.NewTicker(scanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			log.Println("Scheduler stopped")
			return
		case <-ticker.C:
			s.scanAndSchedule()
		}
	}
}

func (s *Scheduler) scanAndSchedule() {
	ctx := redisClient.GetContext()

	lock := redisClient.NewDistributedLock("scheduler", 30*time.Second)
	locked, err := lock.Lock(ctx)
	if err != nil {
		log.Printf("Failed to acquire scheduler lock: %v", err)
		return
	}
	if !locked {
		return
	}
	defer lock.Unlock(ctx)

	now := time.Now()
	tasks, err := s.taskRepo.GetPendingTasks(now)
	if err != nil {
		log.Printf("Failed to get pending tasks: %v", err)
		return
	}

	for _, task := range tasks {
		if err := s.scheduleTask(task); err != nil {
			log.Printf("Failed to schedule task %s: %v", task.ID, err)
		}
	}
}

func (s *Scheduler) scheduleTask(task *models.Task) error {
	ctx := redisClient.GetContext()

	isRunning, err := redisClient.IsTaskRunning(ctx, task.ID)
	if err != nil {
		return err
	}
	if isRunning {
		return nil
	}

	ready, err := s.checkDependencies(task)
	if err != nil {
		return err
	}
	if !ready {
		log.Printf("Task %s dependencies not ready, skipping", task.ID)
		return nil
	}

	executionID := repository.GenerateExecutionID()
	item := &redisClient.TaskQueueItem{
		TaskID:      task.ID,
		ExecutionID: executionID,
		Priority:    0,
		ScheduledAt: time.Now().Unix(),
	}

	if err := redisClient.EnqueueTask(ctx, item); err != nil {
		return err
	}

	if err := s.taskRepo.UpdateTaskStatus(task.ID, models.TaskStatusScheduled); err != nil {
		return err
	}

	log.Printf("Task %s scheduled for execution (execution_id: %s)", task.ID, executionID)
	return nil
}

const (
	MaxDependencyDepth = 50
)

func (s *Scheduler) checkDependencies(task *models.Task) (bool, error) {
	visited := make(map[string]bool)
	return s.checkDependenciesRecursive(task, visited, 0)
}

func (s *Scheduler) checkDependenciesRecursive(task *models.Task, visited map[string]bool, depth int) (bool, error) {
	if depth > MaxDependencyDepth {
		log.Printf("Task %s dependency chain too deep (depth: %d), potential circular dependency detected", task.ID, depth)
		return false, nil
	}

	if len(task.Dependencies) == 0 {
		return true, nil
	}

	if visited[task.ID] {
		log.Printf("Circular dependency detected for task %s", task.ID)
		return false, nil
	}
	visited[task.ID] = true
	defer delete(visited, task.ID)

	for _, depID := range task.Dependencies {
		depTask, err := s.taskRepo.GetTaskByID(depID)
		if err != nil {
			return false, err
		}
		if depTask == nil {
			log.Printf("Dependency task %s not found", depID)
			return false, nil
		}

		if depTask.Status != models.TaskStatusSuccess {
			log.Printf("Dependency task %s not completed (status: %s), waiting...", depID, depTask.Status)
			return false, nil
		}

		ready, err := s.checkDependenciesRecursive(depTask, visited, depth+1)
		if err != nil {
			return false, err
		}
		if !ready {
			return false, nil
		}
	}

	return true, nil
}

func (s *Scheduler) processResults() {
	ctx := redisClient.GetContext()

	for {
		select {
		case <-s.stopCh:
			return
		default:
			resultData, err := redisClient.ConsumeTaskResult(ctx, 5*time.Second)
			if err != nil {
				if err != redis.Nil {
					log.Printf("Failed to consume task result: %v", err)
				}
				continue
			}

			if resultData == "" {
				continue
			}

			var result models.TaskExecutionResult
			if err := json.Unmarshal([]byte(resultData), &result); err != nil {
				log.Printf("Failed to parse task result: %v", err)
				continue
			}

			if err := s.handleTaskResult(&result); err != nil {
				log.Printf("Failed to handle task result: %v", err)
			}
		}
	}
}

func (s *Scheduler) handleTaskResult(result *models.TaskExecutionResult) error {
	ctx := redisClient.GetContext()

	if _, err := s.logRepo.CreateTaskLog(result); err != nil {
		log.Printf("Failed to create task log: %v", err)
	}

	success := result.Status == string(models.TaskStatusSuccess)
	if err := s.taskRepo.UpdateTaskAfterExecution(result.TaskID, success, time.Now()); err != nil {
		return err
	}

	if err := redisClient.MarkTaskComplete(ctx, result.TaskID); err != nil {
		log.Printf("Failed to mark task complete: %v", err)
	}

	go s.checkAndTriggerAlerts(result)

	log.Printf("Task %s execution completed with status: %s", result.TaskID, result.Status)
	return nil
}

func (s *Scheduler) checkAndTriggerAlerts(result *models.TaskExecutionResult) {
	task, err := s.taskRepo.GetTaskByID(result.TaskID)
	if err != nil {
		log.Printf("Failed to get task for alert check: %v", err)
		return
	}
	if task == nil {
		return
	}

	var alertType models.AlertType
	shouldAlert := false

	switch result.Status {
	case string(models.TaskStatusFailed):
		alertType = models.AlertTypeTaskFailed
		shouldAlert = result.RetryCount >= task.MaxRetries
	case string(models.TaskStatusTimeout):
		alertType = models.AlertTypeTaskTimeout
		shouldAlert = true
	}

	if shouldAlert {
		log.Printf("Triggering alert for task %s (type: %s)", task.ID, alertType)
		alert.TriggerTaskAlert(task, alertType, result.ExecutionID, result.ErrorMessage)
	}

	if result.RetryCount > 0 && result.RetryCount >= task.MaxRetries {
		alert.TriggerTaskAlert(task, models.AlertTypeRetryLimitExceeded, result.ExecutionID,
			fmt.Sprintf("任务重试次数已达上限 (%d/%d)", result.RetryCount, task.MaxRetries))
	}
}

func TriggerTask(taskID string) error {
	if scheduler == nil {
		return nil
	}

	task, err := scheduler.taskRepo.GetTaskByID(taskID)
	if err != nil {
		return err
	}
	if task == nil {
		return nil
	}

	return scheduler.scheduleTask(task)
}

func CancelTask(taskID string) error {
	if scheduler == nil {
		return nil
	}

	ctx := redisClient.GetContext()

	if err := scheduler.taskRepo.UpdateTaskStatus(taskID, models.TaskStatusCancelled); err != nil {
		return err
	}

	if err := redisClient.MarkTaskComplete(ctx, taskID); err != nil {
		log.Printf("Warning: failed to clear running mark for task %s: %v", taskID, err)
	}

	return nil
}
