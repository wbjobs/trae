package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/realtime-feature-store/internal/config"
	"github.com/realtime-feature-store/internal/producer"
)

func main() {
	cfg := config.Default()

	p := producer.New(cfg)
	defer p.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down producer...")
		cancel()
	}()

	log.Println("Starting mock event producer...")
	log.Printf("Sending events to %v topic: %s", cfg.RedpandaBrokers, cfg.EventsTopic)

	interval := 100 * time.Millisecond
	if len(os.Args) > 1 {
		if d, err := time.ParseDuration(os.Args[1]); err == nil {
			interval = d
		}
	}

	p.RunMockProducer(ctx, interval)
}
