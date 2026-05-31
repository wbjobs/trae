package handler

import (
	"net/http"
	"strconv"

	"github.com/distributed-scheduler/internal/repository"
	"github.com/gin-gonic/gin"
)

type ResourceHandler struct {
	resourceRepo *repository.ResourceRepository
}

func NewResourceHandler() *ResourceHandler {
	return &ResourceHandler{
		resourceRepo: repository.NewResourceRepository(),
	}
}

func (h *ResourceHandler) GetTaskMetrics(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	page := 1
	pageSize := 50

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 500 {
			pageSize = parsed
		}
	}

	offset := (page - 1) * pageSize

	metrics, total, err := h.resourceRepo.GetTaskMetrics(taskID, pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get task metrics: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"metrics":   metrics,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *ResourceHandler) GetExecutionMetrics(c *gin.Context) {
	taskID := c.Param("task_id")
	executionID := c.Param("execution_id")

	if taskID == "" || executionID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID and Execution ID are required",
		})
		return
	}

	metrics, err := h.resourceRepo.GetExecutionMetrics(taskID, executionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get execution metrics: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    metrics,
	})
}

func (h *ResourceHandler) GetExecutionResourceUsage(c *gin.Context) {
	taskID := c.Param("task_id")
	executionID := c.Param("execution_id")

	if taskID == "" || executionID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID and Execution ID are required",
		})
		return
	}

	usage, err := h.resourceRepo.GetExecutionResourceUsage(taskID, executionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get resource usage: " + err.Error(),
		})
		return
	}

	if usage == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Resource usage data not found for this execution",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    usage,
	})
}
