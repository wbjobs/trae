package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/mqtt-shared-sub/lb/internal/api"
	"github.com/mqtt-shared-sub/lb/internal/balancer"
	"github.com/mqtt-shared-sub/lb/internal/model"
	"github.com/mqtt-shared-sub/lb/internal/monitor"
	"github.com/mqtt-shared-sub/lb/internal/mosquitto"
)

func main() {
	configPath := flag.String("config", "", "Path to configuration file")
	genConfig := flag.Bool("gen-config", false, "Generate a default config file and exit")
	flag.Parse()

	if *genConfig {
		path := "config.yaml"
		if *configPath != "" {
			path = *configPath
		}
		if err := saveDefaultConfig(path); err != nil {
			log.Fatalf("Failed to generate config: %v", err)
		}
		fmt.Printf("Default configuration saved to %s\n", path)
		os.Exit(0)
	}

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("[Main] Starting MQTT Shared Subscription Load Balancer")
	log.Printf("[Main]  Listen: %s", cfg.ListenAddr)
	log.Printf("[Main]  API: %s", cfg.APIAddr)
	log.Printf("[Main]  Metrics: %s", cfg.MetricsAddr)
	log.Printf("[Main]  Default Strategy: %s", cfg.DefaultStrategy)
	log.Printf("[Main]  Queue Size: %d", cfg.QueueSize)
	log.Printf("[Main]  Worker Pool: %d", cfg.WorkerPoolSize)

	lb := balancer.NewLoadBalancer(cfg)

	lb.SetMessageHandler(func(sub *model.Subscriber, msg *model.MQTTMessage) error {
		log.Printf("[Main] Message dispatched: client=%s, topic=%s, group=%s",
			sub.ClientID, msg.Topic, sub.Group)
		return nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := lb.Start(ctx); err != nil {
		log.Fatalf("Failed to start load balancer: %v", err)
	}

	apiServer := api.NewAPI(lb, cfg.APIAddr)
	go func() {
		if err := apiServer.Start(); err != nil {
			log.Printf("[Main] API server stopped: %v", err)
		}
	}()

	if cfg.MonitorConfig.Enabled {
		mon := monitor.NewMonitor(lb, cfg.MetricsAddr)
		go func() {
			if err := mon.Start(ctx); err != nil {
				log.Printf("[Main] Monitor server stopped: %v", err)
			}
		}()
	}

	mosquittoAdapter := mosquitto.NewPluginAdapter(lb, cfg.MosquittoPlugin)
	if cfg.MosquittoPlugin.Enabled {
		if err := mosquittoAdapter.Start(ctx); err != nil {
			log.Printf("[Main] Mosquitto plugin adapter failed: %v", err)
		}
	}

	log.Println("[Main] Load balancer is ready. Press Ctrl+C to stop.")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh

	log.Printf("[Main] Received signal %v, shutting down...", sig)

	cancel()
	lb.Shutdown()
	apiServer.Shutdown()
	mosquittoAdapter.Shutdown()

	log.Println("[Main] Shutdown complete")
}
