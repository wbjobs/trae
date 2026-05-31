package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"thanos-downsampler/pkg/api"
	"thanos-downsampler/pkg/cache"
	"thanos-downsampler/pkg/config"
	"thanos-downsampler/pkg/metrics"
	"thanos-downsampler/pkg/thanos"
)

var (
	version = "1.0.0"
	commit  = "none"
	date    = "unknown"
)

func main() {
	var (
		showVersion = flag.Bool("version", false, "Show version information")
		configFile  = flag.String("config", "", "Path to configuration file")
	)
	flag.Parse()

	if *showVersion {
		fmt.Printf("thanos-downsampler %s (commit: %s, built at: %s)\n", version, commit, date)
		os.Exit(0)
	}

	if *configFile != "" {
		os.Setenv("VIPER_CONFIG", *configFile)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Configuration loaded successfully")
	log.Printf("Auto downsample threshold: %d days", cfg.Downsampling.AutoThresholdDays)
	log.Printf("Available granularities: %v", cfg.Downsampling.Granularities)
	log.Printf("Default granularity: %s", cfg.Downsampling.DefaultGranularity)
	log.Printf("Thanos endpoints: %v", cfg.Thanos.Endpoints)
	log.Printf("Cache enabled: %v", cfg.Cache.Enabled)

	thanosClient := thanos.NewClient(
		cfg.Thanos.Endpoints,
		cfg.GetQueryTimeout(),
		cfg.Thanos.MaxRetries,
	)

	cacheService := cache.NewService(
		cfg.Cache.Enabled,
		cfg.GetCacheTTL(),
		cfg.Cache.MaxItems,
	)

	metricsService := metrics.NewService(thanosClient, cacheService, cfg)

	server := api.NewServer(cfg, metricsService)

	log.Printf("Starting Thanos Downsampler server on %s", cfg.GetServerAddr())
	if err := server.Run(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
