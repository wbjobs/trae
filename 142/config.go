package main

import (
	"log"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"github.com/mqtt-shared-sub/lb/internal/model"
)

func loadConfig(path string) (*model.BalancerConfig, error) {
	if path == "" {
		exePath, err := os.Executable()
		if err != nil {
			return model.DefaultConfig(), nil
		}
		configDir := filepath.Dir(exePath)
		path = filepath.Join(configDir, "config.yaml")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[Config] Config file %s not found, using defaults", path)
			return model.DefaultConfig(), nil
		}
		return nil, err
	}

	cfg := model.DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func saveDefaultConfig(path string) error {
	cfg := model.DefaultConfig()
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
