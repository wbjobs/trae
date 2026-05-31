package redis

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/distributed-scheduler/internal/config"
	"github.com/go-redis/redis/v8"
)

var Client *redis.Client
var ctx = context.Background()

func InitRedis() error {
	cfg := config.GetConfig().Redis
	log.Printf("Connecting to Redis: %s", cfg.GetAddr())

	Client = redis.NewClient(&redis.Options{
		Addr:     cfg.GetAddr(),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	if err := Client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to redis: %w", err)
	}

	log.Println("Redis connection established successfully")
	return nil
}

func GetClient() *redis.Client {
	return Client
}

func GetContext() context.Context {
	return ctx
}

const (
	TaskQueueKey         = "scheduler:task_queue"
	TaskRunningKey       = "scheduler:task_running"
	TaskResultKey        = "scheduler:task_result"
	LockKeyPrefix        = "scheduler:lock:"
	SchedulerHeartbeatKey = "scheduler:heartbeat:schedulers"
	ExecutorHeartbeatKey  = "scheduler:heartbeat:executors"
)
