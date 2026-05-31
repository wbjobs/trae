package main

import (
	"log"
	"os"
	"task-scheduler/config"
	"task-scheduler/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	config.InitDB()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	taskHandler := handlers.NewTaskHandler()

	api := r.Group("/api")
	{
		tasks := api.Group("/tasks")
		{
			tasks.POST("", taskHandler.CreateTask)
			tasks.GET("", taskHandler.GetAllTasks)
			tasks.GET("/:id", taskHandler.GetTask)
			tasks.PUT("/:id", taskHandler.UpdateTask)
			tasks.DELETE("/:id", taskHandler.DeleteTask)
			tasks.PATCH("/:id/position", taskHandler.UpdateTaskPosition)
			tasks.GET("/:id/dependencies", taskHandler.GetTaskDependencies)
			tasks.GET("/:id/downstream", taskHandler.GetTaskDownstream)
		}

		dependencies := api.Group("/dependencies")
		{
			dependencies.POST("", taskHandler.AddDependency)
			dependencies.DELETE("/:taskId/:upstreamTaskId", taskHandler.RemoveDependency)
		}

		api.GET("/graph", taskHandler.GetGraphData)
		api.GET("/graph/history", taskHandler.GetHistoricalGraph)
		api.GET("/timeline", taskHandler.GetTimeline)
		api.GET("/timeline/range", taskHandler.GetTimelineRange)
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s...", port)
	log.Fatal(r.Run(":" + port))
}
