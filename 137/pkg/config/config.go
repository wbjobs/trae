package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server      ServerConfig      `mapstructure:"server"`
	Thanos      ThanosConfig      `mapstructure:"thanos"`
	Downsampling DownsamplingConfig `mapstructure:"downsampling"`
	Cache       CacheConfig       `mapstructure:"cache"`
	Log         LogConfig         `mapstructure:"log"`
}

type ServerConfig struct {
	Port int    `mapstructure:"port"`
	Host string `mapstructure:"host"`
}

type ThanosConfig struct {
	Endpoints    []string `mapstructure:"endpoints"`
	QueryTimeout int      `mapstructure:"query_timeout"`
	MaxRetries   int      `mapstructure:"max_retries"`
}

type DownsamplingConfig struct {
	AutoThresholdDays int      `mapstructure:"auto_threshold_days"`
	Granularities     []string `mapstructure:"granularities"`
	DefaultGranularity string  `mapstructure:"default_granularity"`
	LTTBThreshold     int      `mapstructure:"lttb_threshold"`
}

type CacheConfig struct {
	Enabled         bool `mapstructure:"enabled"`
	DefaultTTLSeconds int `mapstructure:"default_ttl_seconds"`
	MaxItems        int `mapstructure:"max_items"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/etc/thanos-downsampler")
	viper.AddConfigPath("$HOME/.thanos-downsampler")

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("thanos.query_timeout", 300)
	viper.SetDefault("thanos.max_retries", 3)
	viper.SetDefault("downsampling.auto_threshold_days", 30)
	viper.SetDefault("downsampling.granularities", []string{"5m", "1h", "1d"})
	viper.SetDefault("downsampling.default_granularity", "1h")
	viper.SetDefault("downsampling.lttb_threshold", 10000)
	viper.SetDefault("cache.enabled", true)
	viper.SetDefault("cache.default_ttl_seconds", 3600)
	viper.SetDefault("cache.max_items", 10000)
	viper.SetDefault("log.level", "info")
	viper.SetDefault("log.format", "json")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &config, nil
}

func (c *Config) Validate() error {
	if len(c.Thanos.Endpoints) == 0 {
		return fmt.Errorf("at least one Thanos endpoint is required")
	}

	validGranularities := map[string]bool{
		"5m": true,
		"1h": true,
		"1d": true,
	}

	for _, g := range c.Downsampling.Granularities {
		if !validGranularities[g] {
			return fmt.Errorf("invalid granularity: %s", g)
		}
	}

	if !validGranularities[c.Downsampling.DefaultGranularity] {
		return fmt.Errorf("invalid default granularity: %s", c.Downsampling.DefaultGranularity)
	}

	return nil
}

func (c *Config) GetServerAddr() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}

func (c *Config) GetQueryTimeout() time.Duration {
	return time.Duration(c.Thanos.QueryTimeout) * time.Second
}

func (c *Config) GetCacheTTL() time.Duration {
	return time.Duration(c.Cache.DefaultTTLSeconds) * time.Second
}

func GranularityToDuration(granularity string) (time.Duration, error) {
	switch granularity {
	case "5m":
		return 5 * time.Minute, nil
	case "1h":
		return time.Hour, nil
	case "1d":
		return 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("unknown granularity: %s", granularity)
	}
}
