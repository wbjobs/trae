package handlers

import (
	"net/http"
	"strconv"
	"task-scheduler/models"
	"task-scheduler/services"
	"time"

	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	service *services.TaskService
}

func NewTaskHandler() *TaskHandler {
	return &TaskHandler{
		service: services.NewTaskService(),
	}
}

type CreateTaskRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description string  `json:"description"`
	CronExpr    string  `json:"cronExpr"`
	PositionX   float64 `json:"positionX"`
	PositionY   float64 `json:"positionY"`
}

func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task := &models.Task{
		Name:        req.Name,
		Description: req.Description,
		CronExpr:    req.CronExpr,
		Status:      models.TaskStatusPending,
		PositionX:   req.PositionX,
		PositionY:   req.PositionY,
	}

	if task.PositionX == 0 {
		task.PositionX = 100
	}
	if task.PositionY == 0 {
		task.PositionY = 100
	}

	if err := h.service.CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, task)
}

func (h *TaskHandler) GetTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	task, err := h.service.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *TaskHandler) GetAllTasks(c *gin.Context) {
	tasks, err := h.service.GetAllTasks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) UpdateTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	task, err := h.service.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	if err := c.ShouldBindJSON(task); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.UpdateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *TaskHandler) DeleteTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.service.DeleteTask(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task deleted"})
}

type AddDependencyRequest struct {
	TaskID         uint `json:"taskId" binding:"required"`
	UpstreamTaskID uint `json:"upstreamTaskId" binding:"required"`
}

func (h *TaskHandler) AddDependency(c *gin.Context) {
	var req AddDependencyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.AddDependency(req.TaskID, req.UpstreamTaskID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "dependency added"})
}

func (h *TaskHandler) RemoveDependency(c *gin.Context) {
	taskID, err := strconv.ParseUint(c.Param("taskId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	upstreamTaskID, err := strconv.ParseUint(c.Param("upstreamTaskId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upstream task id"})
		return
	}

	if err := h.service.RemoveDependency(uint(taskID), uint(upstreamTaskID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "dependency removed"})
}

func (h *TaskHandler) GetGraphData(c *gin.Context) {
	graph, err := h.service.GetGraphData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, graph)
}

func (h *TaskHandler) GetTaskDependencies(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	deps, err := h.service.GetTaskDependencies(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, deps)
}

func (h *TaskHandler) GetTaskDownstream(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	downstream, err := h.service.GetTaskDownstream(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, downstream)
}

type UpdatePositionRequest struct {
	PositionX float64 `json:"positionX" binding:"required"`
	PositionY float64 `json:"positionY" binding:"required"`
}

func (h *TaskHandler) UpdateTaskPosition(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req UpdatePositionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.UpdateTaskPosition(uint(id), req.PositionX, req.PositionY); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "position updated"})
}

func (h *TaskHandler) GetHistoricalGraph(c *gin.Context) {
	timestampStr := c.Query("timestamp")
	var targetTime time.Time
	var err error

	if timestampStr != "" {
		targetTime, err = time.Parse(time.RFC3339, timestampStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid timestamp format, use RFC3339"})
			return
		}
	} else {
		targetTime = time.Now()
	}

	graph, err := h.service.GetHistoricalGraph(targetTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, graph)
}

func (h *TaskHandler) GetTimeline(c *gin.Context) {
	startStr := c.Query("start")
	endStr := c.Query("end")

	var startTime, endTime time.Time
	var err error

	if startStr != "" {
		startTime, err = time.Parse(time.RFC3339, startStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start timestamp format"})
			return
		}
	} else {
		startTime = time.Now().AddDate(0, 0, -7)
	}

	if endStr != "" {
		endTime, err = time.Parse(time.RFC3339, endStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end timestamp format"})
			return
		}
	} else {
		endTime = time.Now()
	}

	timeline, err := h.service.GetTimeline(startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, timeline)
}

func (h *TaskHandler) GetTimelineRange(c *gin.Context) {
	earliest, latest, err := h.service.GetTimelineRange()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"earliest": earliest,
		"latest":   latest,
	})
}
