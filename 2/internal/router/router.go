package router

import (
	"net/http"
	"time"

	"github.com/distributed-scheduler/internal/handler"
	"github.com/gin-gonic/gin"
)

func NewRouter() *gin.Engine {
	r := gin.Default()

	r.Use(gin.Recovery())
	r.Use(gin.Logger())
	r.Use(corsMiddleware())

	apiV1 := r.Group("/api/v1")

	taskHandler := handler.NewTaskHandler()

	apiV1.GET("/health", healthCheck)

	tasks := apiV1.Group("/tasks")
	{
		tasks.POST("", taskHandler.CreateTask)
		tasks.GET("", taskHandler.ListTasks)
		tasks.GET("/:id", taskHandler.GetTask)
		tasks.PUT("/:id", taskHandler.UpdateTask)
		tasks.DELETE("/:id", taskHandler.DeleteTask)
		tasks.POST("/:id/trigger", taskHandler.TriggerTask)
		tasks.POST("/:id/cancel", taskHandler.CancelTask)
		tasks.GET("/:id/status", taskHandler.GetTaskStatus)
		tasks.GET("/:id/logs", taskHandler.GetTaskLogs)
	}

	logs := apiV1.Group("/logs")
	{
		logs.GET("/:id", taskHandler.GetLogDetail)
	}

	serviceHandler := handler.NewServiceHandler()
	services := apiV1.Group("/services")
	{
		services.GET("", serviceHandler.GetServices)
		services.GET("/schedulers", serviceHandler.GetSchedulers)
		services.GET("/executors", serviceHandler.GetExecutors)
	}

	alertHandler := handler.NewAlertHandler()
	alerts := apiV1.Group("/alerts")
	{
		alerts.POST("", alertHandler.CreateAlertConfig)
		alerts.GET("", alertHandler.ListAlertConfigs)
		alerts.GET("/:id", alertHandler.GetAlertConfig)
		alerts.PUT("/:id", alertHandler.UpdateAlertConfig)
		alerts.DELETE("/:id", alertHandler.DeleteAlertConfig)
		alerts.GET("/task/:task_id", alertHandler.GetAlertConfigByTask)
		alerts.GET("/task/:task_id/records", alertHandler.GetTaskAlertRecords)
	}

	groupHandler := handler.NewTaskGroupHandler()
	groups := apiV1.Group("/groups")
	{
		groups.POST("", groupHandler.CreateTaskGroup)
		groups.GET("", groupHandler.ListTaskGroups)
		groups.GET("/:id", groupHandler.GetTaskGroup)
		groups.PUT("/:id", groupHandler.UpdateTaskGroup)
		groups.DELETE("/:id", groupHandler.DeleteTaskGroup)
		groups.GET("/:id/tasks", groupHandler.GetGroupTasks)
	}

	batch := apiV1.Group("/batch")
	{
		batch.POST("/pause", groupHandler.BatchPause)
		batch.POST("/resume", groupHandler.BatchResume)
		batch.POST("/cancel", groupHandler.BatchCancel)
	}

	resourceHandler := handler.NewResourceHandler()
	resources := apiV1.Group("/resources")
	{
		resources.GET("/task/:task_id/metrics", resourceHandler.GetTaskMetrics)
		resources.GET("/task/:task_id/execution/:execution_id/metrics", resourceHandler.GetExecutionMetrics)
		resources.GET("/task/:task_id/execution/:execution_id/usage", resourceHandler.GetExecutionResourceUsage)
	}

	return r
}

func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"timestamp": time.Now().Unix(),
		"service":   "distributed-task-scheduler",
	})
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
