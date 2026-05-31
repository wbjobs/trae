package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	NATSURL        string
	NATSSubject    string
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string
	MinIOUSSL      bool
	HTTPPort       string
	WasmCacheDir   string

	FunctionTimeout    time.Duration
	FunctionMaxTimeout time.Duration
	WorkerPoolSize     int
	MaxConcurrency     int
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	return &Config{
		NATSURL:        getEnv("NATS_URL", "nats://localhost:4222"),
		NATSSubject:    getEnv("NATS_SUBJECT", "function.invoke"),
		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "functions"),
		MinIOUSSL:      getEnvBool("MINIO_SSL", false),
		HTTPPort:       getEnv("HTTP_PORT", "8080"),
		WasmCacheDir:   getEnv("WASM_CACHE_DIR", "./.cache/wasm"),

		FunctionTimeout:    getEnvDuration("FUNCTION_TIMEOUT", 3*time.Second),
		FunctionMaxTimeout: getEnvDuration("FUNCTION_MAX_TIMEOUT", 10*time.Second),
		WorkerPoolSize:     getEnvInt("WORKER_POOL_SIZE", 10),
		MaxConcurrency:     getEnvInt("MAX_CONCURRENCY", 50),
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value, exists := os.LookupEnv(key); exists {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value, exists := os.LookupEnv(key); exists {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}
