package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/realtime-feature-store/internal/config"
	"github.com/realtime-feature-store/internal/historystore"
	"github.com/realtime-feature-store/internal/redisclient"
	"github.com/realtime-feature-store/internal/service"
	pb "github.com/realtime-feature-store/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	cfg := config.Default()

	redisCli := redisclient.New(cfg)
	defer redisCli.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	if err := redisCli.Ping(ctx); err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
	} else {
		log.Println("Connected to Redis successfully")
	}

	historyDB, err := historystore.New(cfg)
	if err != nil {
		log.Printf("Warning: History store connection failed: %v", err)
		log.Println("Running without history store (point-in-time queries will be unavailable)")
	} else {
		defer historyDB.Close()

		if err := historyDB.Ping(ctx); err != nil {
			log.Printf("Warning: History store ping failed: %v", err)
		} else {
			log.Println("Connected to history store successfully")

			if err := historyDB.InitSchema(ctx); err != nil {
				log.Printf("Warning: History store schema init failed: %v", err)
			} else {
				log.Println("History store schema initialized")
			}

			go historyDB.RunCleanup(ctx, 24*time.Hour)
		}
	}

	lis, err := net.Listen("tcp", cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	featureService := service.New(redisCli, historyDB)
	pb.RegisterFeatureServiceServer(s, featureService)

	reflection.Register(s)

	go func() {
		<-sigCh
		log.Println("Shutting down gRPC server...")
		s.GracefulStop()
		cancel()
	}()

	log.Printf("gRPC Feature Service listening on %s", cfg.GRPCPort)
	log.Println("Available features: click_count_5m, purchase_amount_1h")
	log.Println("Available RPCs:")
	log.Println("  - GetFeatures (real-time)")
	log.Println("  - BatchGetFeatures (real-time batch)")
	log.Println("  - GetFeaturesAtTime (point-in-time)")
	log.Println("  - BatchGetFeaturesAtTime (point-in-time batch)")
	log.Println("  - GetFeatureHistory (time range)")
	log.Println("  - BackfillFeatures (bulk backfill)")

	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
