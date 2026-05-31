package worker

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"order-workflow/internal/activity"
	"order-workflow/internal/config"
	"order-workflow/internal/workflow"
)

func Start() error {
	cfg := config.Load()

	hostPort := cfg.TemporalHostPort
	namespace := cfg.TemporalNamespace

	c, err := client.Dial(client.Options{
		HostPort:  hostPort,
		Namespace: namespace,
	})
	if err != nil {
		return fmt.Errorf("failed to create Temporal client: %w", err)
	}
	defer c.Close()

	dbPool := activity.CreateDBConnectionPool(
		cfg.DBPoolConfig.MaxOpen,
		cfg.DBPoolConfig.MaxIdle,
		cfg.DBPoolConfig.MaxLifetime,
		cfg.DBPoolConfig.MaxIdleTime,
	)

	acts := activity.NewWithPool(dbPool)

	w := worker.New(c, workflow.TaskQueue, worker.Options{
		MaxConcurrentActivityExecutionSize:      cfg.WorkerConfig.MaxConcurrentActivityExecutionSize,
		MaxConcurrentWorkflowTaskExecutionSize:  cfg.WorkerConfig.MaxConcurrentWorkflowTaskExecutionSize,
		MaxConcurrentLocalActivityExecutionSize: cfg.WorkerConfig.MaxConcurrentLocalActivityExecutionSize,
		MaxConcurrentActivityTaskPollers:        cfg.WorkerConfig.MaxConcurrentActivityTaskPollers,
		MaxConcurrentWorkflowTaskPollers:        cfg.WorkerConfig.MaxConcurrentWorkflowTaskPollers,
		WorkflowTaskCacheSize:                   cfg.WorkerConfig.WorkflowTaskCacheSize,
	})

	w.RegisterWorkflow(workflow.OrderWorkflow)

	w.RegisterActivity(acts.ReserveInventory)
	w.RegisterActivity(acts.RollbackInventory)
	w.RegisterActivity(acts.ProcessPayment)
	w.RegisterActivity(acts.ShipOrder)
	w.RegisterActivity(acts.ConfirmReceipt)
	w.RegisterActivity(acts.CancelOrder)

	err = w.Start()
	if err != nil {
		return fmt.Errorf("failed to start worker: %w", err)
	}

	log.Println("Order Worker started (high-concurrency mode). Press Ctrl+C to stop.")
	log.Printf("  WorkflowTaskConcurrency: %d", cfg.WorkerConfig.MaxConcurrentWorkflowTaskExecutionSize)
	log.Printf("  ActivityConcurrency:    %d", cfg.WorkerConfig.MaxConcurrentActivityExecutionSize)
	log.Printf("  WorkflowPollers:        %d", cfg.WorkerConfig.MaxConcurrentWorkflowTaskPollers)
	log.Printf("  ActivityPollers:        %d", cfg.WorkerConfig.MaxConcurrentActivityTaskPollers)
	log.Printf("  WorkflowCacheSize:      %d", cfg.WorkerConfig.WorkflowTaskCacheSize)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	w.Stop()
	log.Println("Order Worker stopped.")
	return nil
}
