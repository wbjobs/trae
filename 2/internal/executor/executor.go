package executor

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/distributed-scheduler/internal/config"
	resourceMonitor "github.com/distributed-scheduler/internal/resource"
	redisClient "github.com/distributed-scheduler/internal/redis"
	"github.com/distributed-scheduler/internal/repository"
	"github.com/distributed-scheduler/internal/models"
	"github.com/google/uuid"
)

type Executor struct {
	taskRepo  *repository.TaskRepository
	workerCount int
	executorID  string
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

var executor *Executor

func Start() {
	log.Println("Starting executor...")

	resourceMonitor.InitMonitor()

	executor = &Executor{
		taskRepo:    repository.NewTaskRepository(),
		workerCount: config.GetConfig().Executor.WorkerCount,
		executorID:  generateExecutorID(),
		stopCh:      make(chan struct{}),
	}

	log.Printf("Executor ID: %s", executor.executorID)
	log.Printf("Starting %d workers...", executor.workerCount)

	for i := 0; i < executor.workerCount; i++ {
		executor.wg.Add(1)
		go executor.worker(i)
	}
}

func Stop() {
	if executor != nil {
		close(executor.stopCh)
		executor.wg.Wait()
	}
}

func GetExecutorID() string {
	if executor != nil {
		return executor.executorID
	}
	return ""
}

func generateExecutorID() string {
	hostname, _ := getHostname()
	return fmt.Sprintf("%s-%s", hostname, uuid.New().String()[:8])
}

func getHostname() (string, error) {
	cmd := exec.Command("hostname")
	output, err := cmd.Output()
	if err != nil {
		return "unknown", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (e *Executor) worker(id int) {
	defer e.wg.Done()
	log.Printf("Worker %d started", id)

	ctx := redisClient.GetContext()

	for {
		select {
		case <-e.stopCh:
			log.Printf("Worker %d stopped", id)
			return
		default:
			item, err := redisClient.DequeueTask(ctx, 5*time.Second)
			if err != nil {
				log.Printf("Worker %d: failed to dequeue task: %v", id, err)
				continue
			}

			if item == nil {
				continue
			}

			log.Printf("Worker %d: processing task %s (execution_id: %s)", id, item.TaskID, item.ExecutionID)
			e.executeTask(item)
		}
	}
}

const (
	LockExpiration = 60 * time.Second
	LockRenewInterval = 30 * time.Second
)

func (e *Executor) executeTask(item *redisClient.TaskQueueItem) {
	ctx := redisClient.GetContext()

	task, err := e.taskRepo.GetTaskByID(item.TaskID)
	if err != nil {
		log.Printf("Failed to get task %s: %v", item.TaskID, err)
		e.reportResult(item.TaskID, item.ExecutionID, string(models.TaskStatusFailed), -1, "", err.Error(), 0)
		return
	}

	if task == nil {
		log.Printf("Task %s not found", item.TaskID)
		e.reportResult(item.TaskID, item.ExecutionID, string(models.TaskStatusFailed), -1, "", "Task not found", 0)
		return
	}

	lock := redisClient.NewDistributedLock("task:execution:"+task.ID, LockExpiration)
	locked, err := lock.Lock(ctx)
	if err != nil {
		log.Printf("Failed to acquire task lock for %s: %v", task.ID, err)
		e.reportResult(item.TaskID, item.ExecutionID, string(models.TaskStatusFailed), -1, "", err.Error(), 0)
		return
	}
	if !locked {
		log.Printf("Task %s is already being executed by another node, skipping", task.ID)
		return
	}

	renewStopCh := make(chan struct{})
	go e.startLockRenewer(lock, renewStopCh)

	defer func() {
		close(renewStopCh)
		if err := lock.Unlock(ctx); err != nil {
			log.Printf("Warning: failed to release task lock for %s: %v", task.ID, err)
		}
	}()

	if err := redisClient.MarkTaskRunning(ctx, task.ID, item.ExecutionID); err != nil {
		log.Printf("Failed to mark task running: %v", err)
	}

	if err := e.taskRepo.UpdateTaskForExecution(task.ID, item.ExecutionID, time.Now()); err != nil {
		log.Printf("Failed to update task for execution: %v", err)
	}

	startTime := time.Now().UnixMilli()

	result := e.runTaskWithRetry(task, item.ExecutionID)

	endTime := time.Now().UnixMilli()

	e.reportResult(
		task.ID,
		item.ExecutionID,
		result.status,
		result.exitCode,
		result.output,
		result.errorMsg,
		result.retryCount,
	)

	_ = startTime
	_ = endTime
}

func (e *Executor) startLockRenewer(lock *redisClient.DistributedLock, stopCh <-chan struct{}) {
	ctx := redisClient.GetContext()
	ticker := time.NewTicker(LockRenewInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			ok, err := lock.Extend(ctx, LockExpiration)
			if err != nil {
				log.Printf("Warning: failed to extend task lock: %v", err)
			}
			if !ok {
				log.Printf("Warning: task lock has expired or been lost")
			}
		}
	}
}

type executionResult struct {
	status     string
	exitCode   int
	output     string
	errorMsg   string
	retryCount int
}

func (e *Executor) runTaskWithRetry(task *models.Task, executionID string) executionResult {
	var lastErr error
	var lastOutput string
	var lastExitCode int

	for attempt := 0; attempt <= task.MaxRetries; attempt++ {
		if attempt > 0 {
			backoffSeconds := task.RetryBackoff * (1 << (attempt - 1))
			log.Printf("Retrying task %s (attempt %d/%d) after %d seconds...",
				task.ID, attempt+1, task.MaxRetries+1, backoffSeconds)
			time.Sleep(time.Duration(backoffSeconds) * time.Second)
		}

		status, exitCode, output, err := e.runTask(task, executionID)
		lastOutput = output
		lastExitCode = exitCode

		if err != nil {
			lastErr = err
			log.Printf("Task %s attempt %d failed: %v", task.ID, attempt+1, err)
			continue
		}

		if status == string(models.TaskStatusSuccess) {
			return executionResult{
				status:     status,
				exitCode:   exitCode,
				output:     output,
				errorMsg:   "",
				retryCount: attempt,
			}
		}

		lastErr = fmt.Errorf("task failed with status: %s", status)
	}

	errorMsg := ""
	if lastErr != nil {
		errorMsg = lastErr.Error()
	}

	return executionResult{
		status:     string(models.TaskStatusFailed),
		exitCode:   lastExitCode,
		output:     lastOutput,
		errorMsg:   errorMsg,
		retryCount: task.MaxRetries,
	}
}

func (e *Executor) runTask(task *models.Task, executionID string) (string, int, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(task.TimeoutSeconds)*time.Second)
	defer cancel()

	switch task.TaskType {
	case models.TaskTypeShell:
		return e.executeShellCommand(ctx, task, executionID)

	case models.TaskTypeHTTP:
		return e.executeHTTPRequest(ctx, task)

	case models.TaskTypeScript:
		return e.executeScript(ctx, task, executionID)

	default:
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("unsupported task type: %s", task.TaskType)
	}
}

func (e *Executor) executeShellCommand(ctx context.Context, task *models.Task, executionID string) (string, int, string, error) {
	if task.Command == "" {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("command is empty")
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", task.Command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", task.Command)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("failed to start command: %v", err)
	}

	if task.MaxCPUPercent > 0 || task.MaxMemoryMB > 0 {
		resourceMonitor.GetMonitor().StartTaskMonitoring(task.ID, executionID, cmd, task.MaxCPUPercent, task.MaxMemoryMB)
		defer resourceMonitor.GetMonitor().StopTaskMonitoring(executionID)
	}

	err := cmd.Wait()
	output := stdout.String() + stderr.String()

	if ctx.Err() == context.DeadlineExceeded {
		return string(models.TaskStatusTimeout), -1, output, fmt.Errorf("task execution timeout")
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return string(models.TaskStatusFailed), exitErr.ExitCode(), output, fmt.Errorf("command failed: %v", err)
		}
		return string(models.TaskStatusFailed), -1, output, fmt.Errorf("command execution failed: %v", err)
	}

	return string(models.TaskStatusSuccess), 0, output, nil
}

func (e *Executor) executeHTTPRequest(ctx context.Context, task *models.Task) (string, int, string, error) {
	if task.HTTPURL == "" {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("HTTP URL is empty")
	}

	method := task.HTTPMethod
	if method == "" {
		method = "GET"
	}

	var body io.Reader
	if task.HTTPBody != "" {
		body = strings.NewReader(task.HTTPBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, task.HTTPURL, body)
	if err != nil {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("failed to create HTTP request: %v", err)
	}

	for key, value := range task.HTTPHeaders {
		req.Header.Set(key, value)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return string(models.TaskStatusTimeout), -1, "", fmt.Errorf("HTTP request timeout")
		}
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("HTTP request failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return string(models.TaskStatusSuccess), resp.StatusCode, string(respBody), nil
	}

	return string(models.TaskStatusFailed), resp.StatusCode, string(respBody),
		fmt.Errorf("HTTP request returned status code: %d", resp.StatusCode)
}

func (e *Executor) executeScript(ctx context.Context, task *models.Task, executionID string) (string, int, string, error) {
	if task.Command == "" {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("script content is empty")
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-Command", task.Command)
	} else {
		cmd = exec.CommandContext(ctx, "bash", "-c", task.Command)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return string(models.TaskStatusFailed), -1, "", fmt.Errorf("failed to start script: %v", err)
	}

	if task.MaxCPUPercent > 0 || task.MaxMemoryMB > 0 {
		resourceMonitor.GetMonitor().StartTaskMonitoring(task.ID, executionID, cmd, task.MaxCPUPercent, task.MaxMemoryMB)
		defer resourceMonitor.GetMonitor().StopTaskMonitoring(executionID)
	}

	err := cmd.Wait()
	output := stdout.String() + stderr.String()

	if ctx.Err() == context.DeadlineExceeded {
		return string(models.TaskStatusTimeout), -1, output, fmt.Errorf("script execution timeout")
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return string(models.TaskStatusFailed), exitErr.ExitCode(), output, fmt.Errorf("script failed: %v", err)
		}
		return string(models.TaskStatusFailed), -1, output, fmt.Errorf("script execution failed: %v", err)
	}

	return string(models.TaskStatusSuccess), 0, output, nil
}

func (e *Executor) reportResult(taskID, executionID, status string, exitCode int, output, errorMsg string, retryCount int) {
	ctx := redisClient.GetContext()

	result := &models.TaskExecutionResult{
		TaskID:       taskID,
		ExecutionID:   executionID,
		Status:        status,
		ExitCode:      exitCode,
		Output:        truncateOutput(output),
		ErrorMessage:  errorMsg,
		StartTime:     time.Now().Add(-1 * time.Second).UnixMilli(),
		EndTime:       time.Now().UnixMilli(),
		ExecutorID:    e.executorID,
		RetryCount:    retryCount,
	}

	if err := redisClient.PublishTaskResult(ctx, result); err != nil {
		log.Printf("Failed to publish task result: %v", err)
	}

	log.Printf("Task %s reported as %s", taskID, status)
}

func truncateOutput(output string) string {
	maxLength := 65535
	if len(output) > maxLength {
		return output[:maxLength] + "...(truncated)"
	}
	return output
}
