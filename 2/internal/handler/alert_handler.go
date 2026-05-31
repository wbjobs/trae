package handler

import (
	"net/http"
	"strconv"

	"github.com/distributed-scheduler/internal/models"
	"github.com/distributed-scheduler/internal/repository"
	"github.com/gin-gonic/gin"
)

type AlertHandler struct {
	alertRepo *repository.AlertRepository
}

func NewAlertHandler() *AlertHandler {
	return &AlertHandler{
		alertRepo: repository.NewAlertRepository(),
	}
}

func (h *AlertHandler) CreateAlertConfig(c *gin.Context) {
	var req models.CreateAlertConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	if req.TaskID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	config, err := h.alertRepo.CreateAlertConfig(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to create alert config: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, Response{
		Code:    201,
		Message: "Alert config created successfully",
		Data:    config,
	})
}

func (h *AlertHandler) GetAlertConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Alert config ID is required",
		})
		return
	}

	config, err := h.alertRepo.GetAlertConfigByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get alert config: " + err.Error(),
		})
		return
	}

	if config == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Alert config not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    config,
	})
}

func (h *AlertHandler) GetAlertConfigByTask(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task ID is required",
		})
		return
	}

	config, err := h.alertRepo.GetAlertConfigByTaskID(taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get alert config: " + err.Error(),
		})
		return
	}

	if config == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Alert config not found for this task",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    config,
	})
}

func (h *AlertHandler) UpdateAlertConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Alert config ID is required",
		})
		return
	}

	var req models.UpdateAlertConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	config, err := h.alertRepo.UpdateAlertConfig(id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to update alert config: " + err.Error(),
		})
		return
	}

	if config == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Alert config not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Alert config updated successfully",
		Data:    config,
	})
}

func (h *AlertHandler) DeleteAlertConfig(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Alert config ID is required",
		})
		return
	}

	if err := h.alertRepo.DeleteAlertConfig(id); err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to delete alert config: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Alert config deleted successfully",
	})
}

func (h *AlertHandler) ListAlertConfigs(c *gin.Context) {
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

	configs, total, err := h.alertRepo.ListAlertConfigs(pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to list alert configs: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"configs":   configs,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *AlertHandler) GetTaskAlertRecords(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
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

	records, total, err := h.alertRepo.GetTaskAlertRecords(taskID, pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get alert records: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data: gin.H{
			"records":   records,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}
