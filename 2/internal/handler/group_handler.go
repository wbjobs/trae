package handler

import (
	"net/http"

	"github.com/distributed-scheduler/internal/models"
	"github.com/distributed-scheduler/internal/repository"
	"github.com/gin-gonic/gin"
)

type TaskGroupHandler struct {
	groupRepo *repository.TaskGroupRepository
	taskRepo  *repository.TaskRepository
}

func NewTaskGroupHandler() *TaskGroupHandler {
	return &TaskGroupHandler{
		groupRepo: repository.NewTaskGroupRepository(),
		taskRepo:  repository.NewTaskRepository(),
	}
}

func (h *TaskGroupHandler) CreateTaskGroup(c *gin.Context) {
	var req models.CreateTaskGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	if req.Name == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task group name is required",
		})
		return
	}

	group, err := h.groupRepo.CreateTaskGroup(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to create task group: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, Response{
		Code:    201,
		Message: "Task group created successfully",
		Data:    group,
	})
}

func (h *TaskGroupHandler) GetTaskGroup(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task group ID is required",
		})
		return
	}

	group, err := h.groupRepo.GetTaskGroupByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get task group: " + err.Error(),
		})
		return
	}

	if group == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Task group not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    group,
	})
}

func (h *TaskGroupHandler) ListTaskGroups(c *gin.Context) {
	groups, err := h.groupRepo.GetAllTaskGroups()
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to list task groups: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    groups,
	})
}

func (h *TaskGroupHandler) UpdateTaskGroup(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task group ID is required",
		})
		return
	}

	var req models.UpdateTaskGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	group, err := h.groupRepo.UpdateTaskGroup(id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to update task group: " + err.Error(),
		})
		return
	}

	if group == nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "Task group not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task group updated successfully",
		Data:    group,
	})
}

func (h *TaskGroupHandler) DeleteTaskGroup(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task group ID is required",
		})
		return
	}

	if err := h.groupRepo.DeleteTaskGroup(id); err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to delete task group: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Task group deleted successfully",
	})
}

func (h *TaskGroupHandler) GetGroupTasks(c *gin.Context) {
	groupID := c.Param("id")
	if groupID == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Task group ID is required",
		})
		return
	}

	tasks, err := h.groupRepo.GetTasksByGroupID(groupID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get group tasks: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    tasks,
	})
}

func (h *TaskGroupHandler) BatchPause(c *gin.Context) {
	result := h.performBatchOperation(c, func(taskIDs []string) *models.BatchOperationResult {
		return h.taskRepo.BatchPauseTasks(taskIDs)
	}, func(groupID string) *models.BatchOperationResult {
		return h.taskRepo.BatchPauseTasksByGroup(groupID)
	})

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Batch pause operation completed",
		Data:    result,
	})
}

func (h *TaskGroupHandler) BatchResume(c *gin.Context) {
	result := h.performBatchOperation(c, func(taskIDs []string) *models.BatchOperationResult {
		return h.taskRepo.BatchResumeTasks(taskIDs)
	}, func(groupID string) *models.BatchOperationResult {
		return h.taskRepo.BatchResumeTasksByGroup(groupID)
	})

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Batch resume operation completed",
		Data:    result,
	})
}

func (h *TaskGroupHandler) BatchCancel(c *gin.Context) {
	result := h.performBatchOperation(c, func(taskIDs []string) *models.BatchOperationResult {
		return h.taskRepo.BatchCancelTasks(taskIDs)
	}, func(groupID string) *models.BatchOperationResult {
		return h.taskRepo.BatchCancelTasksByGroup(groupID)
	})

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Batch cancel operation completed",
		Data:    result,
	})
}

func (h *TaskGroupHandler) performBatchOperation(
	c *gin.Context,
	byTaskIDs func([]string) *models.BatchOperationResult,
	byGroupID func(string) *models.BatchOperationResult,
) *models.BatchOperationResult {
	var req models.BatchOperationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return &models.BatchOperationResult{
			SuccessCount: 0,
			FailedCount:  0,
		}
	}

	if len(req.TaskIDs) > 0 {
		return byTaskIDs(req.TaskIDs)
	}

	if req.TaskGroupID != nil && *req.TaskGroupID != "" {
		return byGroupID(*req.TaskGroupID)
	}

	return &models.BatchOperationResult{
		SuccessCount: 0,
		FailedCount:  0,
	}
}
