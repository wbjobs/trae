package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Service    ServiceConfig    `mapstructure:"service"`
	NATS       NATSConfig       `mapstructure:"nats"`
	Webhook    WebhookConfig    `mapstructure:"webhook"`
	Encryption EncryptionConfig `mapstructure:"encryption"`
	Log        LogConfig        `mapstructure:"log"`
}

type ServiceConfig struct {
	Name     string `mapstructure:"name"`
	HTTPPort int    `mapstructure:"http_port"`
	DataDir  string `mapstructure:"data_dir"`
}

type NATSConfig struct {
	URL          string `mapstructure:"url"`
	KVBucket     string `mapstructure:"kv_bucket"`
	WatchSubject string `mapstructure:"watch_subject"`
}

type WebhookConfig struct {
	URL           string        `mapstructure:"url"`
	Timeout       time.Duration `mapstructure:"timeout"`
	RetryCount    int           `mapstructure:"retry_count"`
	RetryInterval time.Duration `mapstructure:"retry_interval"`
}

type EncryptionConfig struct {
	Enabled        bool   `mapstructure:"enabled"`
	MasterKey      string `mapstructure:"master_key"`
	MasterKeyFile  string `mapstructure:"master_key_file"`
	EncryptByDefault bool `mapstructure:"encrypt_by_default"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")

	v.SetDefault("service.name", "config-sync-node")
	v.SetDefault("service.http_port", 8080)
	v.SetDefault("service.data_dir", "./data")
	v.SetDefault("nats.url", "nats://localhost:4222")
	v.SetDefault("nats.kv_bucket", "config_sync")
	v.SetDefault("nats.watch_subject", "config.*")
	v.SetDefault("webhook.url", "")
	v.SetDefault("webhook.timeout", 10*time.Second)
	v.SetDefault("webhook.retry_count", 3)
	v.SetDefault("webhook.retry_interval", 5*time.Second)
	v.SetDefault("encryption.enabled", false)
	v.SetDefault("encryption.master_key", "")
	v.SetDefault("encryption.master_key_file", "")
	v.SetDefault("encryption.encrypt_by_default", false)
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	return &cfg, nil
}
