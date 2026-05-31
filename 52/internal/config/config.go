package config

import (
	"os"
	"strconv"
)

type Config struct {
	ServerHost   string
	ServerPort   string
	RedisAddr    string
	RedisPass    string
	RedisDB      int
	PostgresDSN  string
	LockTTL      int
	WorkerCount  int
}

func Load() *Config {
	return &Config{
		ServerHost:  getEnv("SERVER_HOST", "0.0.0.0"),
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:   getEnv("REDIS_PASS", ""),
		RedisDB:     getEnvInt("REDIS_DB", 0),
		PostgresDSN: getEnv("POSTGRES_DSN", "host=localhost user=postgres password=postgres dbname=datacleanse port=5432 sslmode=disable"),
		LockTTL:     getEnvInt("LOCK_TTL", 30),
		WorkerCount: getEnvInt("WORKER_COUNT", 5),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
