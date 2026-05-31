package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/realtime-feature-store/internal/config"
	"github.com/realtime-feature-store/internal/consumer"
	"github.com/realtime-feature-store/internal/historystore"
	"github.com/realtime-feature-store/internal/redisclient"
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
		log.Println("Running without history store")
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
		}
	}

	c := consumer.New(cfg, redisCli, historyDB)
	defer c.Close()

	go func() {
		<-sigCh
		log.Println("Shutting down consumer...")
		cancel()
	}()

	log.Println("Starting feature consumer...")
	log.Printf("Consuming from topic: %s, group: %s", cfg.FeaturesTopic, cfg.ConsumerGroup)

	c.Run(ctx)
}
