package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/dapr-wasm/middleware/pkg/api"
	"github.com/dapr-wasm/middleware/pkg/config"
	"github.com/dapr-wasm/middleware/pkg/engine"
	"github.com/dapr-wasm/middleware/pkg/middleware"
	"github.com/dapr-wasm/middleware/pkg/reload"
	"github.com/spf13/cobra"
)

var (
	configPath  string
	wasmDir     string
	grpcPort    int
	httpPort    int
)

var rootCmd = &cobra.Command{
	Use:   "dapr-wasm-middleware",
	Short: "Dapr pluggable middleware with WasmEdge filter support",
	Run:   run,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().StringVarP(&configPath, "config", "c", "config.json", "Path to config file")
	rootCmd.Flags().StringVarP(&wasmDir, "wasm-dir", "w", "./wasm", "Directory for Wasm modules")
	rootCmd.Flags().IntVarP(&grpcPort, "grpc-port", "g", 50051, "gRPC server port")
	rootCmd.Flags().IntVarP(&httpPort, "http-port", "p", 8080, "HTTP API port")
}

func run(cmd *cobra.Command, args []string) {
	eng := engine.NewEngine()
	defer eng.Close()

	store := config.NewStore(configPath)
	if err := store.Load(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	filters := store.List()
	for _, meta := range filters {
		if meta.Enabled {
			if err := eng.LoadFilter(meta); err != nil {
				log.Printf("Warning: failed to load filter %s: %v", meta.Name, err)
			}
		}
	}

	var reloader *reload.HotReloader
	if wasmDir != "" {
		var err error
		reloader, err = reload.NewHotReloader(eng, wasmDir)
		if err != nil {
			log.Printf("Warning: hot reload not available: %v", err)
		} else {
			for _, meta := range filters {
				reloader.Register(meta)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reloader.Start(ctx)
			log.Printf("Hot reload watching: %s", wasmDir)
		}
	}

	grpcServer := middleware.NewGRPCServer(eng, grpcPort)
	if err := grpcServer.Start(); err != nil {
		log.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer grpcServer.Stop()

	apiServer := api.NewServer(store, eng, reloader)

	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", httpPort),
		Handler:      apiServer,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("HTTP API server listening on :%d", httpPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpServer.Shutdown(shutdownCtx)

	if reloader != nil {
		reloader.Stop()
	}
}
