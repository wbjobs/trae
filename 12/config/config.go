package config

import (
	"os"
	"strconv"
)

type Config struct {
	HTTPAddr    string
	FDBCluster  string
}

func Load() *Config {
	return &Config{
		HTTPAddr:   getEnv("HTTP_ADDR", ":8080"),
		FDBCluster: getEnv("FDB_CLUSTER_FILE", ""),
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
