package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Database  DatabaseConfig  `mapstructure:"database"`
	SSH       SSHConfig       `mapstructure:"ssh"`
	Recording RecordingConfig `mapstructure:"recording"`
	Storage   StorageConfig   `mapstructure:"storage"`
	Alerting  AlertingConfig  `mapstructure:"alerting"`
	HA        HAConfig        `mapstructure:"ha"`
	Log       LogConfig       `mapstructure:"log"`
}

type HAConfig struct {
	Enabled              bool     `mapstructure:"enabled"`
	NodeID               string   `mapstructure:"node_id"`
	EtcdEndpoints        []string `mapstructure:"etcd_endpoints"`
	LeaseTTL             int64    `mapstructure:"lease_ttl"`
	SessionSyncInterval  int      `mapstructure:"session_sync_interval"`
}

type ServerConfig struct {
	HTTPPort int `mapstructure:"http_port"`
	SSHPort  int `mapstructure:"ssh_port"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
}

type SSHConfig struct {
	HostKeyPath string `mapstructure:"host_key_path"`
	MaxSessions int    `mapstructure:"max_sessions"`
	IdleTimeout int    `mapstructure:"idle_timeout"`
}

type RecordingConfig struct {
	TTYLogDir        string `mapstructure:"tty_log_dir"`
	ScreenshotDir    string `mapstructure:"screenshot_dir"`
	ScreenshotInterval int  `mapstructure:"screenshot_interval"`
	StorageType      string `mapstructure:"storage_type"`
}

type StorageConfig struct {
	S3    S3StorageConfig    `mapstructure:"s3"`
	Local LocalStorageConfig `mapstructure:"local"`
}

type S3StorageConfig struct {
	Endpoint  string `mapstructure:"endpoint"`
	AccessKey string `mapstructure:"access_key"`
	SecretKey string `mapstructure:"secret_key"`
	Bucket    string `mapstructure:"bucket"`
	UseSSL    bool   `mapstructure:"use_ssl"`
}

type LocalStorageConfig struct {
	BasePath string `mapstructure:"base_path"`
}

type AlertingConfig struct {
	Rules []AlertRule `mapstructure:"rules"`
}

type AlertRule struct {
	Name     string `mapstructure:"name"`
	Pattern  string `mapstructure:"pattern"`
	Severity string `mapstructure:"severity"`
	Enabled  bool   `mapstructure:"enabled"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

var AppConfig *Config

func Load(configPath string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	AppConfig = &Config{}
	if err := v.Unmarshal(AppConfig); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	return AppConfig, nil
}

func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode)
}
