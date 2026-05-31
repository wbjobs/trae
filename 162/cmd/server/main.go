package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	pb "order-workflow/api/proto"
	"order-workflow/internal/activity"
	"order-workflow/internal/alert"
	"order-workflow/internal/circuitbreaker"
	"order-workflow/internal/config"
	"order-workflow/internal/grpcserver"
	"order-workflow/internal/ratelimit"
	"order-workflow/internal/sla"
	"order-workflow/internal/store"
	"order-workflow/internal/workflow"
)

func main() {
	cfg := config.Load()

	hostPort := cfg.TemporalHostPort
	namespace := cfg.TemporalNamespace
	grpcPort := cfg.GRPCPort

	log.Println("Starting Order Workflow Server (high-concurrency mode)...")
	log.Printf("  Temporal: %s (namespace: %s)", hostPort, namespace)
	log.Printf("  gRPC Port: %s", grpcPort)

	temporalClient, err := client.Dial(client.Options{
		HostPort:  hostPort,
		Namespace: namespace,
		ConnectionOptions: client.ConnectionOptions{
			DisableHealthCheck: false,
		},
	})
	if err != nil {
		log.Fatalf("Failed to create Temporal client: %v", err)
	}
	defer temporalClient.Close()
	log.Println("  [OK] Temporal client connected")

	orderStore := store.NewOrderStore()
	log.Println("  [OK] Sharded order store initialized (256 shards)")

	rateLimiter := ratelimit.New(
		cfg.RateLimitConfig.MaxRequestsPerSecond,
		cfg.RateLimitConfig.BurstSize,
		cfg.RateLimitConfig.Enabled,
	)
	log.Printf("  [OK] Rate limiter: %.0f RPS, burst=%d (enabled=%v)",
		cfg.RateLimitConfig.MaxRequestsPerSecond,
		cfg.RateLimitConfig.BurstSize,
		cfg.RateLimitConfig.Enabled)

	cbManager := circuitbreaker.NewManager()
	log.Println("  [OK] Circuit breaker manager initialized")

	dbPool := activity.CreateDBConnectionPool(
		cfg.DBPoolConfig.MaxOpen,
		cfg.DBPoolConfig.MaxIdle,
		cfg.DBPoolConfig.MaxLifetime,
		cfg.DBPoolConfig.MaxIdleTime,
	)
	log.Printf("  [OK] DB connection pool: max_open=%d, max_idle=%d",
		cfg.DBPoolConfig.MaxOpen, cfg.DBPoolConfig.MaxIdle)

	var alertProducer sla.AlertProducer
	kafkaProducer := alert.NewKafkaProducer(alert.KafkaConfig{
		Brokers: cfg.KafkaConfig.Brokers,
		Topic:   cfg.KafkaConfig.Topic,
		Enabled: cfg.KafkaConfig.Enabled,
	})
	if err := kafkaProducer.Start(); err != nil {
		log.Printf("  [WARN] Kafka producer start failed: %v, falling back to log producer", err)
		alertProducer = alert.NewLogProducer()
	} else {
		alertProducer = kafkaProducer
	}
	log.Printf("  [OK] Alert producer: enabled=%v, topic=%s, brokers=%v",
		cfg.KafkaConfig.Enabled, cfg.KafkaConfig.Topic, cfg.KafkaConfig.Brokers)

	slaMonitor := sla.NewMonitor(sla.ConfigFromAppConfig(cfg.SLAConfig), alertProducer)
	slaMonitor.SetScanInterval(cfg.SLAConfig.ScanInterval)
	slaMonitor.StartPeriodicScan()
	log.Println("  [OK] SLA monitor started")
	log.Printf("       Enabled: %v, ScanInterval: %v", cfg.SLAConfig.Enabled, cfg.SLAConfig.ScanInterval)
	log.Printf("       Thresholds:")
	log.Printf("         CREATED:         %v", cfg.SLAConfig.CreatedTimeout)
	log.Printf("         PENDING_PAYMENT: %v", cfg.SLAConfig.PendingPaymentTimeout)
	log.Printf("         PAYING:          %v", cfg.SLAConfig.PayingTimeout)
	log.Printf("         PAID:            %v", cfg.SLAConfig.PaidTimeout)
	log.Printf("         SHIPPED:         %v", cfg.SLAConfig.ShippedTimeout)

	acts := activity.NewWithPool(dbPool)
	orderServer := grpcserver.NewOrderServer(temporalClient, orderStore, rateLimiter, cbManager, slaMonitor)

	w := worker.New(temporalClient, workflow.TaskQueue, worker.Options{
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
		log.Fatalf("Failed to start worker: %v", err)
	}
	defer w.Stop()
	log.Println("  [OK] Temporal Worker started")
	log.Printf("       WorkflowTaskConcurrency: %d", cfg.WorkerConfig.MaxConcurrentWorkflowTaskExecutionSize)
	log.Printf("       ActivityConcurrency:    %d", cfg.WorkerConfig.MaxConcurrentActivityExecutionSize)
	log.Printf("       WorkflowPollers:        %d", cfg.WorkerConfig.MaxConcurrentWorkflowTaskPollers)
	log.Printf("       ActivityPollers:        %d", cfg.WorkerConfig.MaxConcurrentActivityTaskPollers)
	log.Printf("       WorkflowCacheSize:      %d", cfg.WorkerConfig.WorkflowTaskCacheSize)

	grpcOpts := []grpc.ServerOption{
		grpc.MaxConcurrentStreams(cfg.GRPCServerConfig.MaxConcurrentStreams),
		grpc.MaxRecvMsgSize(cfg.GRPCServerConfig.MaxRecvMsgSize),
		grpc.MaxSendMsgSize(cfg.GRPCServerConfig.MaxSendMsgSize),
		grpc.NumStreamWorkers(cfg.GRPCServerConfig.NumStreamWorkers),
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle:     cfg.GRPCServerConfig.KeepAliveTimeout * 3,
			MaxConnectionAge:      30 * time.Minute,
			MaxConnectionAgeGrace: 30 * time.Second,
			Time:                  cfg.GRPCServerConfig.KeepAliveTime,
			Timeout:               cfg.GRPCServerConfig.KeepAliveTimeout,
		}),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             cfg.GRPCServerConfig.KeepAliveMinTime,
			PermitWithoutStream: true,
		}),
	}

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", grpcPort, err)
	}

	grpcServer := grpc.NewServer(grpcOpts...)
	pb.RegisterOrderServiceServer(grpcServer, orderServer)
	reflection.Register(grpcServer)

	go func() {
		log.Printf("  [OK] gRPC server listening on :%s", grpcPort)
		log.Printf("       MaxConcurrentStreams: %d", cfg.GRPCServerConfig.MaxConcurrentStreams)
		log.Printf("       StreamWorkers:        %d", cfg.GRPCServerConfig.NumStreamWorkers)
		log.Printf("       KeepAlive:            %v", cfg.GRPCServerConfig.KeepAliveTime)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed: %v", err)
		}
	}()

	log.Println("")
	log.Println("========================================")
	log.Println("  Order Workflow Server Started")
	log.Println("========================================")
	log.Println("  Capacity:")
	log.Printf("    - Max concurrent workflows: %d", cfg.WorkerConfig.MaxConcurrentWorkflowTaskExecutionSize)
	log.Printf("    - Max concurrent activities: %d", cfg.WorkerConfig.MaxConcurrentActivityExecutionSize)
	log.Printf("    - Rate limit: %.0f RPS", cfg.RateLimitConfig.MaxRequestsPerSecond)
	log.Printf("    - DB pool: max_open=%d, max_idle=%d",
		cfg.DBPoolConfig.MaxOpen, cfg.DBPoolConfig.MaxIdle)
	log.Println("  SLA Monitoring:")
	log.Printf("    - Enabled: %v", cfg.SLAConfig.Enabled)
	log.Printf("    - Scan interval: %v", cfg.SLAConfig.ScanInterval)
	log.Printf("    - Kafka alerts: enabled=%v, topic=%s",
		cfg.KafkaConfig.Enabled, cfg.KafkaConfig.Topic)
	log.Println("========================================")
	log.Println("  Press Ctrl+C to stop")
	log.Println("========================================")
	log.Println("")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("")
	log.Println("Shutting down gracefully...")

	slaMonitor.StopPeriodicScan()
	kafkaProducer.Stop()

	grpcServer.GracefulStop()
	log.Println("gRPC server stopped.")
	log.Println("Server stopped.")
}
