package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	GRPCHost string
	GRPCPort string

	JWTSecret      string
	JWTExpireHours int

	AdminUsername string
	AdminPassword string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "postgres"),
		DBName:     getEnv("DB_NAME", "nfc_access"),

		GRPCHost: getEnv("GRPC_HOST", "0.0.0.0"),
		GRPCPort: getEnv("GRPC_PORT", "50051"),

		JWTSecret:      getEnv("JWT_SECRET", "default-secret-key"),
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 24),

		AdminUsername: getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "admin123"),
	}, nil
}

func (c *Config) GetDSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName)
}

func (c *Config) GetGRPCAddr() string {
	return fmt.Sprintf("%s:%s", c.GRPCHost, c.GRPCPort)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := fmt.Sscanf(value, "%d", &defaultValue); err == nil && intValue > 0 {
			return defaultValue
		}
	}
	return defaultValue
}
