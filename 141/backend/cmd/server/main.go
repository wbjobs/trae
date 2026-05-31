package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/dapr-wasm-state/pkg/api"
	"github.com/dapr-wasm-state/pkg/service"
	"github.com/dapr-wasm-state/pkg/store"
	"github.com/dapr-wasm-state/pkg/wasm"
	"github.com/rs/cors"
)

func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func main() {
	pluginDir := os.Getenv("PLUGIN_DIR")
	if pluginDir == "" {
		pluginDir = "./plugins"
	}

	storeType := os.Getenv("STORE_TYPE")
	if storeType == "" {
		storeType = "memory"
	}

	var stateStore store.StateStore
	var err error

	switch storeType {
	case "redis":
		stateStore, err = store.NewRedisStore(store.RedisConfig{
			Addr:      os.Getenv("REDIS_ADDR"),
			Password:  os.Getenv("REDIS_PASSWORD"),
			DB:        0,
			KeyPrefix: os.Getenv("REDIS_KEY_PREFIX"),
		})
		if err != nil {
			log.Fatalf("Failed to create Redis store: %v", err)
		}
		log.Println("Using Redis store")
	default:
		stateStore = store.NewInMemoryStore()
		log.Println("Using in-memory store")
	}

	pluginManager, err := wasm.GetPluginManager(pluginDir)
	if err != nil {
		log.Fatalf("Failed to create plugin manager: %v", err)
	}

	stateServiceConfig := service.StateServiceConfig{
		MaxConcurrency: getEnvInt("WASM_MAX_CONCURRENCY", 10),
		SingleTimeout:  getEnvDuration("WASM_SINGLE_TIMEOUT", 1*time.Second),
		BulkTimeout:    getEnvDuration("WASM_BULK_TIMEOUT", 5*time.Second),
	}

	stateService := service.NewStateServiceWithConfig(stateStore, pluginManager, stateServiceConfig)
	handler := api.NewHandler(stateService, pluginManager)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/state/get", handler.HandleGet)
	mux.HandleFunc("/api/v1/state/set", handler.HandleSet)
	mux.HandleFunc("/api/v1/state/delete", handler.HandleDelete)
	mux.HandleFunc("/api/v1/state/bulk_get", handler.HandleBulkGet)
	mux.HandleFunc("/api/v1/state/bulk_set", handler.HandleBulkSet)
	mux.HandleFunc("/api/v1/state/bulk_delete", handler.HandleBulkDelete)

	mux.HandleFunc("/api/v1/state/version", handler.HandleGetVersion)
	mux.HandleFunc("/api/v1/state/versions", handler.HandleGetVersionHistory)
	mux.HandleFunc("/api/v1/state/timetravel", handler.HandleGetAtTime)
	mux.HandleFunc("/api/v1/state/versions/delete", handler.HandleDeleteOldVersions)

	mux.HandleFunc("/api/v1/metrics", handler.HandleMetrics)
	mux.HandleFunc("/api/v1/metrics/reset", handler.HandleMetricsReset)

	mux.HandleFunc("/api/v1/plugins", handler.HandlePluginsList)
	mux.HandleFunc("/api/v1/plugins/upload", handler.HandlePluginUpload)
	mux.HandleFunc("/api/v1/plugins/activate", handler.HandlePluginActivate)
	mux.HandleFunc("/api/v1/plugins/deactivate", handler.HandlePluginDeactivate)
	mux.HandleFunc("/api/v1/plugins/delete", handler.HandlePluginDelete)
	mux.HandleFunc("/api/v1/plugins/active", handler.HandleActivePlugin)

	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", fs)

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	serverReadTimeout := getEnvDuration("SERVER_READ_TIMEOUT", 15*time.Second)
	serverWriteTimeout := getEnvDuration("SERVER_WRITE_TIMEOUT", 15*time.Second)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      corsHandler.Handler(mux),
		ReadTimeout:  serverReadTimeout,
		WriteTimeout: serverWriteTimeout,
	}

	go func() {
		log.Printf("Server starting on port %s...", port)
		log.Printf("WASM config: max_concurrency=%d, single_timeout=%s, bulk_timeout=%s",
			stateServiceConfig.MaxConcurrency, stateServiceConfig.SingleTimeout, stateServiceConfig.BulkTimeout)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	if err := pluginManager.Close(ctx); err != nil {
		log.Printf("Error closing plugin manager: %v", err)
	}

	stateStore.Close()

	log.Println("Server exited")
}
