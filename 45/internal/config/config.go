package config

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

type Config struct {
	WorkerID         string `json:"worker_id"`
	ListenAddress    string `json:"listen_address"`
	SchedulerAddress string `json:"scheduler_address"`
	MaxConcurrent    int    `json:"max_concurrent"`
	HeartbeatInterval int   `json:"heartbeat_interval"`
	LogLevel         string `json:"log_level"`
	Labels           map[string]string `json:"labels"`
}

func Load() (*Config, error) {
	cfg := &Config{
		WorkerID:         getDefaultWorkerID(),
		ListenAddress:    ":50051",
		SchedulerAddress: "localhost:50050",
		MaxConcurrent:    10,
		HeartbeatInterval: 5,
		LogLevel:         "info",
		Labels:           make(map[string]string),
	}

	configFile := flag.String("config", "", "Path to config file")
	workerID := flag.String("worker-id", "", "Worker ID")
	listenAddr := flag.String("listen", "", "Listen address")
	schedulerAddr := flag.String("scheduler", "", "Scheduler address")
	maxConcurrent := flag.Int("max-concurrent", 0, "Max concurrent tasks")
	flag.Parse()

	if *configFile != "" {
		if err := loadFromFile(*configFile, cfg); err != nil {
			return nil, err
		}
	}

	if *workerID != "" {
		cfg.WorkerID = *workerID
	}
	if *listenAddr != "" {
		cfg.ListenAddress = *listenAddr
	}
	if *schedulerAddr != "" {
		cfg.SchedulerAddress = *schedulerAddr
	}
	if *maxConcurrent > 0 {
		cfg.MaxConcurrent = *maxConcurrent
	}

	return cfg, nil
}

func loadFromFile(path string, cfg *Config) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config file: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return fmt.Errorf("parse config file: %w", err)
	}

	return nil
}

func getDefaultWorkerID() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "worker-default"
	}
	return fmt.Sprintf("worker-%s", hostname)
}
