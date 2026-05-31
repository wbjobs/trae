package handler

import (
	"net/http"
	"strconv"

	"github.com/distributed-scheduler/internal/models"
	"github.com/distributed-scheduler/internal/repository"
	"github.com/distributed-scheduler/internal/scheduler"
	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	taskRepo *repository.TaskRepository
	logRepo  *repository.LogRepository
}

func NewTaskHandler() *TaskHandler {
	return &TaskHandler{
		taskRepo: repository.NewTaskRepository(),
		logRepo:  repository.NewLogRepository(),
	}
}

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req models.CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	if err := validateCreateTaskRequest(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: err.Error(),
		})
		return
	}

	task, err := h.taskRepo.CreateTask(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to create task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, Response{
		Code:    201,
		Message: "Task created successfully",
		Data:    task,
	})
}

func (h *TaskHandler) GetTask(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	task, err := h.taskRepo.GetTaskByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get task: " + err.Error(),
		})
		return
	}

	if task == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    task,
	})
}

func (h *TaskHandler) ListTasks(c *gin.Context) {
	page := 1
	pageSize := 20

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 100 {
			pageSize = parsed
		}
	}

	offset := (page - 1) * pageSize

	tasks, total, err := h.taskRepo.ListTasks(pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to list tasks: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"tasks":     tasks,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *TaskHandler) UpdateTask(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	var req models.UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	task, err := h.taskRepo.UpdateTask(id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to update task: " + err.Error(),
		})
		return
	}

	if task == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task updated successfully",
		Data:    task,
	})
}

func (h *TaskHandler) DeleteTask(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	if err := h.taskRepo.DeleteTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to delete task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task deleted successfully",
	})
}

func (h *TaskHandler) TriggerTask(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	if err := scheduler.TriggerTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to trigger task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task triggered successfully",
	})
}

func (h *TaskHandler) CancelTask(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	if err := scheduler.CancelTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to cancel task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task cancelled successfully",
	})
}

func (h *TaskHandler) GetTaskStatus(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	task, err := h.taskRepo.GetTaskByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get task status: " + err.Error(),
		})
		return
	}

	if task == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"task_id":        task.ID,
			"status":         task.Status,
			"current_retry":  task.CurrentRetry,
			"max_retries":    task.MaxRetries,
			"last_execute_at": task.LastExecuteAt,
			"next_execute_at": task.NextExecuteAt,
		},
	})
}

func (h *TaskHandler) GetTaskLogs(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	page := 1
	pageSize := 20

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 100 {
			pageSize = parsed
		}
	}

	offset := (page - 1) * pageSize

	logs, total, err := h.logRepo.GetTaskLogs(id, pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get task logs: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"logs":      logs,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *TaskHandler) GetLogDetail(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Log ID is required",
		})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid log ID",
		})
		return
	}

	log, err := h.logRepo.GetLogByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get log detail: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    log,
	})
}

func validateCreateTaskRequest(req *models.CreateTaskRequest) error {
	if req.Name == "" {
		return ErrTaskNameRequired
	}

	switch req.TaskType {
	case models.TaskTypeShell, models.TaskTypeScript:
		if req.Command == "" {
			return ErrCommandRequired
		}
	case models.TaskTypeHTTP:
		if req.HTTPURL == "" {
			return ErrHTTPURLRequired
		}
	default:
		return ErrInvalidTaskType
	}

	switch req.ScheduleType {
	case models.ScheduleTypeOnce:
	case models.ScheduleTypeCron:
		if req.CronExpression == "" {
			return ErrCronExpressionRequired
		}
	case models.ScheduleTypeInterval:
		if req.IntervalSeconds <= 0 {
			return ErrInvalidInterval
		}
	default:
		return ErrInvalidScheduleType
	}

	return nil
}

var (
	ErrTaskNameRequired     = NewValidationError("task name is required")
	ErrCommandRequired      = NewValidationError("command is required for shell/script tasks")
	ErrHTTPURLRequired      = NewValidationError("HTTP URL is required for HTTP tasks")
	ErrInvalidTaskType      = NewValidationError("invalid task type, must be shell, http, or script")
	ErrCronExpressionRequired = NewValidationError("cron expression is required for cron schedule")
	ErrInvalidInterval      = NewValidationError("interval must be greater than 0")
	ErrInvalidScheduleType  = NewValidationError("invalid schedule type, must be once, cron, or interval")
)

type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

func NewValidationError(message string) *ValidationError {
	return &ValidationError{Message: message}
}
