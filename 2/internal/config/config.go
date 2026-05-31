package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	Scheduler SchedulerConfig `mapstructure:"scheduler"`
	Executor ExecutorConfig `mapstructure:"executor"`
	Email    EmailConfig    `mapstructure:"email"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
}

type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

type SchedulerConfig struct {
	HeartbeatInterval int `mapstructure:"heartbeat_interval"`
	ScanInterval      int `mapstructure:"scan_interval"`
}

type ExecutorConfig struct {
	WorkerCount     int `mapstructure:"worker_count"`
	HeartbeatInterval int `mapstructure:"heartbeat_interval"`
}

type EmailConfig struct {
	Enabled     bool   `mapstructure:"enabled"`
	Host        string `mapstructure:"host"`
	Port        int    `mapstructure:"port"`
	Username    string `mapstructure:"username"`
	Password    string `mapstructure:"password"`
	FromEmail   string `mapstructure:"from_email"`
	FromName    string `mapstructure:"from_name"`
	UseTLS      bool   `mapstructure:"use_tls"`
}

var config *Config

func LoadConfig() error {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	viper.AddConfigPath("./internal/config")

	setDefaults()

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			fmt.Println("Config file not found, using defaults")
		} else {
			return fmt.Errorf("error reading config file: %w", err)
		}
	}

	config = &Config{}
	if err := viper.Unmarshal(config); err != nil {
		return fmt.Errorf("error unmarshaling config: %w", err)
	}

	return nil
}

func setDefaults() {
	viper.SetDefault("server.port", 8080)
	
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 3306)
	viper.SetDefault("database.user", "root")
	viper.SetDefault("database.password", "")
	viper.SetDefault("database.dbname", "scheduler")
	
	viper.SetDefault("redis.host", "localhost")
	viper.SetDefault("redis.port", 6379)
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)
	
	viper.SetDefault("scheduler.heartbeat_interval", 30)
	viper.SetDefault("scheduler.scan_interval", 5)
	
	viper.SetDefault("executor.worker_count", 5)
	viper.SetDefault("executor.heartbeat_interval", 30)
}

func GetConfig() *Config {
	return config
}

func (d *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		d.User, d.Password, d.Host, d.Port, d.DBName)
}

func (r *RedisConfig) GetAddr() string {
	return fmt.Sprintf("%s:%d", r.Host, r.Port)
}
