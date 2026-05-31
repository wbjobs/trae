package service

import (
	"encoding/json"
	"log"
	"time"

	"github.com/distributed-scheduler/internal/config"
	"github.com/distributed-scheduler/internal/executor"
	redisClient "github.com/distributed-scheduler/internal/redis"
	"github.com/google/uuid"
)

type ServiceType string

const (
	ServiceTypeScheduler ServiceType = "scheduler"
	ServiceTypeExecutor  ServiceType = "executor"
)

type ServiceInstance struct {
	ID        string      `json:"id"`
	Type      ServiceType `json:"type"`
	Host      string      `json:"host"`
	Port      int         `json:"port"`
	Metadata  string      `json:"metadata"`
	StartTime int64       `json:"start_time"`
	LastHeartbeat int64   `json:"last_heartbeat"`
}

var schedulerID string
var executorID string

func StartServiceRegistry() {
	log.Println("Starting service registry...")

	schedulerID = generateServiceID()
	instance := &ServiceInstance{
		ID:            schedulerID,
		Type:          ServiceTypeScheduler,
		Host:          "localhost",
		Port:          config.GetConfig().Server.Port,
		Metadata:      "scheduler-service",
		StartTime:     time.Now().Unix(),
		LastHeartbeat: time.Now().Unix(),
	}

	if err := registerService(instance); err != nil {
		log.Printf("Failed to register scheduler service: %v", err)
	}

	go func() {
		heartbeatInterval := time.Duration(config.GetConfig().Scheduler.HeartbeatInterval) * time.Second
		ticker := time.NewTicker(heartbeatInterval)
		defer ticker.Stop()

		for range ticker.C {
			if err := sendHeartbeat(schedulerID, ServiceTypeScheduler); err != nil {
				log.Printf("Failed to send scheduler heartbeat: %v", err)
			}
		}
	}()

	go cleanupStaleServices()
}

func RegisterExecutor() {
	log.Println("Registering executor service...")

	executorID = executor.GetExecutorID()
	if executorID == "" {
		executorID = generateServiceID()
	}

	instance := &ServiceInstance{
		ID:            executorID,
		Type:          ServiceTypeExecutor,
		Host:          "localhost",
		Port:          0,
		Metadata:      "executor-service",
		StartTime:     time.Now().Unix(),
		LastHeartbeat: time.Now().Unix(),
	}

	if err := registerService(instance); err != nil {
		log.Printf("Failed to register executor service: %v", err)
	}

	go func() {
		heartbeatInterval := time.Duration(config.GetConfig().Executor.HeartbeatInterval) * time.Second
		ticker := time.NewTicker(heartbeatInterval)
		defer ticker.Stop()

		for range ticker.C {
			if err := sendHeartbeat(executorID, ServiceTypeExecutor); err != nil {
				log.Printf("Failed to send executor heartbeat: %v", err)
			}
		}
	}()
}

func DeregisterExecutor() {
	if executorID != "" {
		log.Println("Deregistering executor service...")
		if err := deregisterService(executorID, ServiceTypeExecutor); err != nil {
			log.Printf("Failed to deregister executor service: %v", err)
		}
	}
}

func generateServiceID() string {
	return uuid.New().String()
}

func registerService(instance *ServiceInstance) error {
	ctx := redisClient.GetContext()
	client := redisClient.GetClient()

	key := getServiceKey(instance.Type)
	data, err := json.Marshal(instance)
	if err != nil {
		return err
	}

	return client.HSet(ctx, key, instance.ID, string(data)).Err()
}

func deregisterService(id string, serviceType ServiceType) error {
	ctx := redisClient.GetContext()
	client := redisClient.GetClient()

	key := getServiceKey(serviceType)
	return client.HDel(ctx, key, id).Err()
}

func sendHeartbeat(id string, serviceType ServiceType) error {
	ctx := redisClient.GetContext()
	client := redisClient.GetClient()

	key := getServiceKey(serviceType)

	data, err := client.HGet(ctx, key, id).Result()
	if err != nil {
		return err
	}

	var instance ServiceInstance
	if err := json.Unmarshal([]byte(data), &instance); err != nil {
		return err
	}

	instance.LastHeartbeat = time.Now().Unix()
	updatedData, err := json.Marshal(instance)
	if err != nil {
		return err
	}

	return client.HSet(ctx, key, id, string(updatedData)).Err()
}

func GetServices(serviceType ServiceType) ([]*ServiceInstance, error) {
	ctx := redisClient.GetContext()
	client := redisClient.GetClient()

	key := getServiceKey(serviceType)
	servicesData, err := client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var instances []*ServiceInstance
	for _, data := range servicesData {
		var instance ServiceInstance
		if err := json.Unmarshal([]byte(data), &instance); err != nil {
			continue
		}
		instances = append(instances, &instance)
	}

	return instances, nil
}

func GetAllServices() map[ServiceType][]*ServiceInstance {
	result := make(map[ServiceType][]*ServiceInstance)

	if schedulers, err := GetServices(ServiceTypeScheduler); err == nil {
		result[ServiceTypeScheduler] = schedulers
	}

	if executors, err := GetServices(ServiceTypeExecutor); err == nil {
		result[ServiceTypeExecutor] = executors
	}

	return result
}

func cleanupStaleServices() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		cleanupStaleServicesByType(ServiceTypeScheduler)
		cleanupStaleServicesByType(ServiceTypeExecutor)
	}
}

func cleanupStaleServicesByType(serviceType ServiceType) {
	ctx := redisClient.GetContext()
	client := redisClient.GetClient()

	key := getServiceKey(serviceType)
	servicesData, err := client.HGetAll(ctx, key).Result()
	if err != nil {
		return
	}

	staleThreshold := time.Now().Add(-120 * time.Second).Unix()

	for id, data := range servicesData {
		var instance ServiceInstance
		if err := json.Unmarshal([]byte(data), &instance); err != nil {
			continue
		}

		if instance.LastHeartbeat < staleThreshold {
			log.Printf("Removing stale %s service: %s", serviceType, id)
			client.HDel(ctx, key, id)
		}
	}
}

func getServiceKey(serviceType ServiceType) string {
	switch serviceType {
	case ServiceTypeScheduler:
		return redisClient.SchedulerHeartbeatKey
	case ServiceTypeExecutor:
		return redisClient.ExecutorHeartbeatKey
	default:
		return ""
	}
}
