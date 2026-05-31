package main

import (
	"fmt"
	"log"

	"github.com/distributed-scheduler/internal/alert"
	"github.com/distributed-scheduler/internal/config"
	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/redis"
	"github.com/distributed-scheduler/internal/router"
	"github.com/distributed-scheduler/internal/scheduler"
	"github.com/distributed-scheduler/internal/service"
)

func main() {
	fmt.Println("=======================================")
	fmt.Println("  Distributed Task Scheduler Service")
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

	alert.InitEmailService()

	go scheduler.Start()

	r := router.NewRouter()
	go service.StartServiceRegistry()

	port := config.GetConfig().Server.Port
	log.Printf("Server starting on port %d...", port)
	if err := r.Run(fmt.Sprintf(":%d", port)); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
