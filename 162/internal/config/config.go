package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	TemporalHostPort string
	TemporalNamespace string
	GRPCPort          string

	TemporalConnectionConfig TemporalConnectionConfig
	WorkerConfig             WorkerConfig
	GRPCServerConfig         GRPCServerConfig
	RateLimitConfig          RateLimitConfig
	CircuitBreakerConfig     CircuitBreakerConfig
	DBPoolConfig             DBPoolConfig
	SLAConfig                SLAConfig
	KafkaConfig              KafkaConfig
}

type TemporalConnectionConfig struct {
	MaxConcurrentConnection   int
	ConnectionMaxIdleTime     time.Duration
	ConnectionMaxLifeTime     time.Duration
	KeepAliveTime             time.Duration
	KeepAliveTimeout          time.Duration
	InitialWindowSize         int32
	InitialConnectionWindowSize int32
}

type WorkerConfig struct {
	MaxConcurrentWorkflowTaskExecutionSize int
	MaxConcurrentActivityExecutionSize     int
	MaxConcurrentLocalActivityExecutionSize int
	MaxConcurrentActivityTaskPollers       int
	MaxConcurrentWorkflowTaskPollers       int
	WorkflowTaskCacheSize                  int
	EnableSessionWorker                    bool
}

type GRPCServerConfig struct {
	MaxConcurrentStreams  uint32
	MaxRecvMsgSize        int
	MaxSendMsgSize        int
	KeepAliveTime         time.Duration
	KeepAliveTimeout      time.Duration
	KeepAliveMinTime      time.Duration
	NumStreamWorkers      uint32
}

type RateLimitConfig struct {
	MaxRequestsPerSecond float64
	BurstSize            int
	Enabled              bool
}

type CircuitBreakerConfig struct {
	MaxRequests   uint32
	Interval      time.Duration
	Timeout       time.Duration
	ReadyToTrip   func(counts interface{}) bool
}

type DBPoolConfig struct {
	MaxOpen     int
	MaxIdle     int
	MaxLifetime time.Duration
	MaxIdleTime time.Duration
}

type SLAConfig struct {
	Enabled              bool
	ScanInterval       time.Duration
	CreatedTimeout       time.Duration
	PendingPaymentTimeout time.Duration
	PayingTimeout       time.Duration
	PaidTimeout         time.Duration
	ShippedTimeout      time.Duration
}

type KafkaConfig struct {
	Enabled bool
	Brokers []string
	Topic   string
}

func Load() *Config {
	return &Config{
		TemporalHostPort:  getEnv("TEMPORAL_HOST_PORT", "localhost:7233"),
		TemporalNamespace: getEnv("TEMPORAL_NAMESPACE", "default"),
		GRPCPort:          getEnv("GRPC_PORT", "50051"),

		TemporalConnectionConfig: TemporalConnectionConfig{
			MaxConcurrentConnection:   getEnvInt("TEMPORAL_MAX_CONNS", 100),
			ConnectionMaxIdleTime:     getEnvDuration("TEMPORAL_CONN_IDLE", 30*time.Second),
			ConnectionMaxLifeTime:     getEnvDuration("TEMPORAL_CONN_LIFE", 30*time.Minute),
			KeepAliveTime:             getEnvDuration("TEMPORAL_KEEPALIVE", 30*time.Second),
			KeepAliveTimeout:          getEnvDuration("TEMPORAL_KEEPALIVE_TIMEOUT", 10*time.Second),
			InitialWindowSize:         int32(getEnvInt("TEMPORAL_WINDOW_SIZE", 65536)),
			InitialConnectionWindowSize: int32(getEnvInt("TEMPORAL_CONN_WINDOW_SIZE", 65536)),
		},

		WorkerConfig: WorkerConfig{
			MaxConcurrentWorkflowTaskExecutionSize: getEnvInt("WORKFLOW_TASK_CONCURRENCY", 200),
			MaxConcurrentActivityExecutionSize:     getEnvInt("ACTIVITY_CONCURRENCY", 200),
			MaxConcurrentLocalActivityExecutionSize: getEnvInt("LOCAL_ACTIVITY_CONCURRENCY", 200),
			MaxConcurrentActivityTaskPollers:       getEnvInt("ACTIVITY_POLLERS", 8),
			MaxConcurrentWorkflowTaskPollers:       getEnvInt("WORKFLOW_POLLERS", 8),
			WorkflowTaskCacheSize:                  getEnvInt("WORKFLOW_CACHE_SIZE", 2000),
		},

		GRPCServerConfig: GRPCServerConfig{
			MaxConcurrentStreams:  uint32(getEnvInt("GRPC_MAX_STREAMS", 10000)),
			MaxRecvMsgSize:        getEnvInt("GRPC_MAX_RECV_MSG", 64*1024*1024),
			MaxSendMsgSize:        getEnvInt("GRPC_MAX_SEND_MSG", 64*1024*1024),
			KeepAliveTime:         getEnvDuration("GRPC_KEEPALIVE", 30*time.Second),
			KeepAliveTimeout:      getEnvDuration("GRPC_KEEPALIVE_TIMEOUT", 10*time.Second),
			KeepAliveMinTime:      getEnvDuration("GRPC_KEEPALIVE_MIN", 10*time.Second),
			NumStreamWorkers:      uint32(getEnvInt("GRPC_STREAM_WORKERS", 16)),
		},

		RateLimitConfig: RateLimitConfig{
			MaxRequestsPerSecond: getEnvFloat64("RATE_LIMIT_RPS", 5000),
			BurstSize:            getEnvInt("RATE_LIMIT_BURST", 1000),
			Enabled:              getEnvBool("RATE_LIMIT_ENABLED", true),
		},

		CircuitBreakerConfig: CircuitBreakerConfig{
			MaxRequests: uint32(getEnvInt("CB_MAX_REQUESTS", 50)),
			Interval:    getEnvDuration("CB_INTERVAL", 10*time.Second),
			Timeout:     getEnvDuration("CB_TIMEOUT", 30*time.Second),
		},

		DBPoolConfig: DBPoolConfig{
			MaxOpen:     getEnvInt("DB_MAX_OPEN", 100),
			MaxIdle:     getEnvInt("DB_MAX_IDLE", 25),
			MaxLifetime: getEnvDuration("DB_MAX_LIFETIME", 5*time.Minute),
			MaxIdleTime: getEnvDuration("DB_MAX_IDLE_TIME", 5*time.Minute),
		},

		SLAConfig: SLAConfig{
			Enabled:              getEnvBool("SLA_ENABLED", true),
			ScanInterval:         getEnvDuration("SLA_SCAN_INTERVAL", 10*time.Second),
			CreatedTimeout:       getEnvDuration("SLA_CREATED_TIMEOUT", 5*time.Second),
			PendingPaymentTimeout: getEnvDuration("SLA_PENDING_PAYMENT_TIMEOUT", 30*time.Minute),
			PayingTimeout:        getEnvDuration("SLA_PAYING_TIMEOUT", 10*time.Second),
			PaidTimeout:          getEnvDuration("SLA_PAID_TIMEOUT", 5*time.Minute),
			ShippedTimeout:       getEnvDuration("SLA_SHIPPED_TIMEOUT", 30*time.Minute),
		},

		KafkaConfig: KafkaConfig{
			Enabled: getEnvBool("KAFKA_ENABLED", false),
			Brokers: getEnvStringSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			Topic:   getEnv("KAFKA_TOPIC", "order-sla-alerts"),
		},
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvFloat64(key string, defaultVal float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return defaultVal
}

func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultVal
}

func getEnvStringSlice(key string, defaultVal []string) []string {
	if v := os.Getenv(key); v != "" {
		result := make([]string, 0)
		for _, s := range splitAndTrim(v, ",") {
			if s != "" {
				result = append(result, s)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultVal
}

func splitAndTrim(s, sep string) []string {
	result := make([]string, 0)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep[0] {
			part := trimSpace(s[start:i])
			if part != "" {
				result = append(result, part)
			}
			start = i + 1
		}
	}
	if start < len(s) {
		part := trimSpace(s[start:])
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
