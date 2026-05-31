package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"data-cleanse-service/internal/service"
)

type Handler struct {
	taskService *service.TaskService
}

func NewHandler(taskService *service.TaskService) *Handler {
	return &Handler{
		taskService: taskService,
	}
}

func (h *Handler) SubmitTask(c *gin.Context) {
	var req service.SubmitTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request body",
			"details": err.Error(),
		})
		return
	}

	resp, err := h.taskService.SubmitTask(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusAccepted, resp)
}

func (h *Handler) GetTaskStatus(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "task_id is required",
		})
		return
	}

	task, err := h.taskService.GetTaskByID(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "task not found",
		})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *Handler) GetTaskByRequestID(c *gin.Context) {
	requestID := c.Param("request_id")
	if requestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "request_id is required",
		})
		return
	}

	task, err := h.taskService.GetTaskByRequestID(c.Request.Context(), requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "task not found",
		})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}
