package config

import "time"

type Config struct {
	RedpandaBrokers    []string
	EventsTopic        string
	FeaturesTopic      string
	ConsumerGroup      string
	RisingWaveAddr     string
	RedisAddr          string
	RedisPassword      string
	RedisDB            int
	GRPCPort           string
	FeatureTTL         time.Duration
	PostgresDSN        string
	PostgresHost       string
	PostgresPort       int
	PostgresUser       string
	PostgresPassword   string
	PostgresDB         string
	HistoryRetention   time.Duration
}

func Default() *Config {
	return &Config{
		RedpandaBrokers:  []string{"localhost:9092"},
		EventsTopic:      "user_events",
		FeaturesTopic:    "user_features",
		ConsumerGroup:    "feature-consumer-group",
		RisingWaveAddr:   "localhost:4566",
		RedisAddr:        "localhost:6379",
		RedisPassword:    "",
		RedisDB:          0,
		GRPCPort:         ":50051",
		FeatureTTL:       10 * time.Minute,
		PostgresHost:     "localhost",
		PostgresPort:     5432,
		PostgresUser:     "postgres",
		PostgresPassword: "postgres",
		PostgresDB:       "feature_store",
		HistoryRetention: 30 * 24 * time.Hour,
	}
}
