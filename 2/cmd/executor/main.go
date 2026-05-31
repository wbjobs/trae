package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/distributed-scheduler/internal/config"
	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/executor"
	"github.com/distributed-scheduler/internal/redis"
	"github.com/distributed-scheduler/internal/service"
)

func main() {
	fmt.Println("=======================================")
	fmt.Println("  Task Executor Service")
	fmt.Println("=======================================")

	if err := config.LoadConfig(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := database.InitDB(); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	if err := redis.InitRedis(); err != nil {
		log.Fatalf("Failed to init redis: %v", err)
	}

	go service.RegisterExecutor()
	go executor.Start()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	<-sigCh
	log.Println("Shutting down executor...")
	service.DeregisterExecutor()
}
