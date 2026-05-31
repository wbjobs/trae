package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"config-sync/internal/api"
	"config-sync/internal/config"
	"config-sync/internal/crypto"
	"config-sync/internal/store"
	"config-sync/internal/sync"
	"config-sync/internal/webhook"
)

func main() {
	configPath := "config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Printf("Starting config sync service: %s", cfg.Service.Name)
	log.Printf("NATS URL: %s", cfg.NATS.URL)
	log.Printf("KV Bucket: %s", cfg.NATS.KVBucket)
	log.Printf("HTTP Port: %d", cfg.Service.HTTPPort)

	var encryptor crypto.Encryptor
	if cfg.Encryption.Enabled {
		masterKey := cfg.Encryption.MasterKey

		if masterKey == "" && cfg.Encryption.MasterKeyFile != "" {
			keyData, err := os.ReadFile(cfg.Encryption.MasterKeyFile)
			if err != nil {
				log.Fatalf("Failed to read master key file: %v", err)
			}
			masterKey = string(keyData)
		}

		if masterKey == "" {
			generatedKey, err := crypto.GenerateMasterKey()
			if err != nil {
				log.Fatalf("Failed to generate master key: %v", err)
			}
			masterKey = generatedKey
			log.Printf("WARNING: No master key provided, generated a new one. Save this key for future use: %s", masterKey)
		}

		encryptor, err = crypto.NewAESGCMEncryptorFromBase64(masterKey)
		if err != nil {
			log.Fatalf("Failed to create encryptor: %v", err)
		}
		log.Println("Encryption enabled with AES-GCM")
	}

	var storeInstance *store.NATSStore
	if encryptor != nil {
		storeInstance, err = store.NewNATSStoreWithEncryption(ctx, cfg.NATS.URL, cfg.NATS.KVBucket, encryptor, cfg.Encryption.EncryptByDefault)
	} else {
		storeInstance, err = store.NewNATSStore(ctx, cfg.NATS.URL, cfg.NATS.KVBucket)
	}
	if err != nil {
		log.Fatalf("Failed to create NATS store: %v", err)
	}
	defer storeInstance.Close()

	log.Println("NATS store initialized successfully")

	var webhookNotifier *webhook.WebhookNotifier
	if cfg.Webhook.URL != "" {
		webhookNotifier = webhook.NewWebhookNotifier(
			cfg.Webhook.URL,
			cfg.Webhook.Timeout,
			cfg.Webhook.RetryCount,
			cfg.Webhook.RetryInterval,
			cfg.Service.Name,
		)
		log.Printf("Webhook configured: %s", cfg.Webhook.URL)
	}

	syncManager := sync.NewSyncManager(ctx, storeInstance, webhookNotifier)

	syncManager.AddListener(func(key string, entry *store.ConfigEntry) {
		if entry == nil {
			log.Printf("Config deleted: %s", key)
		} else {
			log.Printf("Config updated: %s (version: %d)", key, entry.Version)
		}
	})

	syncManager.AddConflictListener(func(conflict *store.ConflictEntry) {
		log.Printf("Conflict detected: %s (local: %d, remote: %d)", conflict.Key, conflict.LocalVersion, conflict.RemoteVersion)
	})

	if err := syncManager.StartWatching(cfg.NATS.WatchSubject); err != nil {
		log.Fatalf("Failed to start watching: %v", err)
	}
	log.Printf("Watching subject: %s", cfg.NATS.WatchSubject)

	server := api.NewServer(storeInstance, webhookNotifier, syncManager, cfg.Service.Name)

	go func() {
		log.Printf("HTTP server listening on port %d", cfg.Service.HTTPPort)
		if err := server.Run(cfg.Service.HTTPPort); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh

	log.Printf("Received signal %v, shutting down...", sig)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	syncManager.Stop()
	log.Println("Config sync service stopped")
	fmt.Println("Goodbye!")
}
