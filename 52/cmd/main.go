package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"data-cleanse-service/internal/config"
	"data-cleanse-service/internal/db"
	"data-cleanse-service/internal/handler"
	"data-cleanse-service/internal/lock"
	"data-cleanse-service/internal/service"
	"data-cleanse-service/internal/worker"
)

func main() {
	cfg := config.Load()

	database, err := db.Init(cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized successfully")

	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
		DB:       cfg.RedisDB,
	})

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Redis connected successfully")

	redisLock := lock.NewRedisLock(redisClient, cfg.LockTTL)

	taskService := service.NewTaskService(database, redisLock)
	callbackService := service.NewCallbackService()

	workerPool := worker.NewWorkerPool(taskService, callbackService, cfg.WorkerCount)
	taskService.SetDispatcher(workerPool)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	workerPool.Start(ctx)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	h := handler.NewHandler(taskService)

	api := r.Group("/api/v1")
	{
		api.POST("/tasks", h.SubmitTask)
		api.GET("/tasks/:task_id", h.GetTaskStatus)
		api.GET("/tasks/request/:request_id", h.GetTaskByRequestID)
		api.GET("/health", h.HealthCheck)
	}

	addr := fmt.Sprintf("%s:%s", cfg.ServerHost, cfg.ServerPort)
	server := &gin.Engine{}
	server = r

	go func() {
		log.Printf("Server starting on %s", addr)
		if err := server.Run(addr); err != nil {
			log.Printf("Server stopped: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down gracefully...")
	cancel()
	log.Println("Server stopped")
}
