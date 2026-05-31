package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gameserver-agent/pkg/migration"
	"gameserver-agent/pkg/server"
)

func main() {
	port := os.Getenv("AGENT_PORT")
	if port == "" {
		port = "8080"
	}

	podName := os.Getenv("POD_NAME")
	if podName == "" {
		podName = "unknown"
	}

	podNamespace := os.Getenv("POD_NAMESPACE")
	if podNamespace == "" {
		podNamespace = "default"
	}

	migrationManager := migration.NewManager(podName, podNamespace)

	httpServer := server.NewServer(port, migrationManager)

	go func() {
		log.Printf("Agent server starting on port %s...", port)
		if err := httpServer.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down agent server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Agent server stopped")
}
