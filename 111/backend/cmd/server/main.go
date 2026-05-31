package main

import (
	"log"
	"os"
	"strconv"

	"chaos-injector/internal/api"
	"chaos-injector/internal/istio"
	"chaos-injector/internal/metrics"
	"chaos-injector/internal/safety"
	"chaos-injector/internal/store"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	port := getEnv("PORT", "8080")
	mode := getEnv("GIN_MODE", "release")
	gin.SetMode(mode)

	str := store.NewMemoryStore()
	istioCtrl := istio.NewController()
	metricsCollector := metrics.NewMetricsCollector()
	safetyMonitor := safety.NewMonitor(str, istioCtrl, metricsCollector)

	handler := api.NewHandler(str, istioCtrl, metricsCollector, safetyMonitor)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
	}))

	handler.RegisterRoutes(r)

	log.Printf("Chaos Injector API server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
		os.Exit(1)
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return fallback
}
