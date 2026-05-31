package config

import "time"

type Config struct {
	Interface     string
	MirrorServer  string
	URLPrefixes   []string
	StatsPort     int
	Ports         []int
	Daemon        bool
	Workers       int
	EnableReplay  bool
	ReplayPort    int
	ReplayTTL     time.Duration
}

func DefaultConfig() *Config {
	return &Config{
		Interface:     "eth0",
		MirrorServer:  "http://127.0.0.1:9090",
		URLPrefixes:   []string{"/"},
		StatsPort:     8081,
		Ports:         []int{80, 8080},
		Daemon:        false,
		Workers:       10,
		EnableReplay:  false,
		ReplayPort:    8082,
		ReplayTTL:     30 * time.Minute,
	}
}
