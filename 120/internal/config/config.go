package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"cloudinspector/internal/types"
)

const (
	defaultConfigDir  = ".cloudinspector"
	defaultConfigFile = "config.json"
)

func LoadConfig(path string) (*types.Config, error) {
	if path == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("get home directory: %w", err)
		}
		path = filepath.Join(homeDir, defaultConfigDir, defaultConfigFile)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("config file not found at %s, please create it first", path)
		}
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg types.Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	if len(cfg.Accounts) == 0 {
		return nil, fmt.Errorf("no accounts configured in %s", path)
	}

	for i, acct := range cfg.Accounts {
		if acct.Name == "" {
			return nil, fmt.Errorf("account %d: name is required", i)
		}
		if acct.Provider == "" {
			return nil, fmt.Errorf("account %s: provider is required", acct.Name)
		}
		if acct.Region == "" {
			return nil, fmt.Errorf("account %s: region is required", acct.Name)
		}
	}

	return &cfg, nil
}

func SaveConfig(path string, cfg *types.Config) error {
	if path == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("get home directory: %w", err)
		}
		dir := filepath.Join(homeDir, defaultConfigDir)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("create config dir: %w", err)
		}
		path = filepath.Join(dir, defaultConfigFile)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write config file: %w", err)
	}

	return nil
}

func FilterAccounts(cfg *types.Config, accountNames []string, provider types.CloudProvider) []types.AccountConfig {
	var result []types.AccountConfig
	nameSet := make(map[string]bool)
	for _, n := range accountNames {
		nameSet[n] = true
	}

	for _, acct := range cfg.Accounts {
		if len(accountNames) > 0 && !nameSet[acct.Name] {
			continue
		}
		if provider != "" && acct.Provider != provider {
			continue
		}
		result = append(result, acct)
	}
	return result
}
