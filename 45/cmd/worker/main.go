package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/distributed-scheduler/worker/internal/config"
	"github.com/distributed-scheduler/worker/internal/worker"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	w, err := worker.NewWorker(cfg)
	if err != nil {
		log.Fatalf("Failed to create worker: %v", err)
	}
	defer w.Stop()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		log.Printf("Received signal: %v, shutting down...", sig)
		w.Stop()
		os.Exit(0)
	}()

	if err := w.Start(); err != nil {
		log.Fatalf("Worker failed: %v", err)
	}
}
