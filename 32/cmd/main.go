package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
	"ssh-bastion-audit/internal/alerting"
	"ssh-bastion-audit/internal/api"
	"ssh-bastion-audit/internal/config"
	"ssh-bastion-audit/internal/database"
	"ssh-bastion-audit/internal/ha"
	"ssh-bastion-audit/internal/recording"
	"ssh-bastion-audit/internal/sshproxy"
	"ssh-bastion-audit/internal/storage"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		logrus.Fatalf("Failed to load config: %v", err)
	}

	setupLogger(cfg.Log)

	if err := database.Init(&cfg.Database); err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	sessionRepo := database.NewSessionRepository(database.DB)
	alertRepo := database.NewAlertRepository(database.DB)
	ruleRepo := database.NewAlertRuleRepository(database.DB)
	ttyFrameRepo := database.NewTTYFrameRepository(database.DB)
	screenshotRepo := database.NewScreenshotRepository(database.DB)

	if err := alerting.LoadRulesFromConfig(&cfg.Alerting, ruleRepo); err != nil {
		logrus.Errorf("Failed to load rules from config: %v", err)
	}

	alerter := alerting.NewAlerter(ruleRepo)
	if err := alerter.Start(); err != nil {
		logrus.Fatalf("Failed to start alerter: %v", err)
	}
	defer alerter.Stop()

	store, err := storage.NewStorage(&cfg.Storage, cfg.Recording.StorageType)
	if err != nil {
		logrus.Fatalf("Failed to initialize storage: %v", err)
	}

	recorder, err := recording.NewSessionRecorder(&cfg.Recording, store)
	if err != nil {
		logrus.Fatalf("Failed to initialize recorder: %v", err)
	}
	recorder.Start()
	defer recorder.Stop()

	haManager := ha.NewHAManager(&cfg.HA)

	hostSigner, err := loadOrGenerateHostKey(cfg.SSH.HostKeyPath)
	if err != nil {
		logrus.Fatalf("Failed to load host key: %v", err)
	}

	sshServer := sshproxy.NewSSHServer(
		&cfg.SSH,
		hostSigner,
		sessionRepo,
		ttyFrameRepo,
		screenshotRepo,
		alertRepo,
		recorder,
		alerter,
		haManager,
	)

	apiServer := api.NewAPIServer(
		&cfg.Server,
		sessionRepo,
		alertRepo,
		ruleRepo,
		ttyFrameRepo,
		screenshotRepo,
		recorder,
		sshServer,
		alerter,
		haManager,
	)

	if err := haManager.Start(); err != nil {
		logrus.Errorf("Failed to start HA manager: %v", err)
	}
	defer haManager.Stop()

	if cfg.HA.Enabled {
		logrus.Infof("HA mode enabled, node %s starting as %s", cfg.HA.NodeID, haManager.GetRole())
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := sshServer.Start(ctx); err != nil {
			logrus.Errorf("SSH server error: %v", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := apiServer.Start(ctx); err != nil {
			logrus.Errorf("API server error: %v", err)
			cancel()
		}
	}()

	select {
	case sig := <-sigChan:
		logrus.Infof("Received signal %v, shutting down...", sig)
		cancel()
	case <-ctx.Done():
		logrus.Info("Context cancelled, shutting down...")
	}

	wg.Wait()
	logrus.Info("Shutdown complete")
}

func setupLogger(cfg config.LogConfig) {
	level, err := logrus.ParseLevel(cfg.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	logrus.SetLevel(level)

	if cfg.Format == "json" {
		logrus.SetFormatter(&logrus.JSONFormatter{})
	}
}

func loadOrGenerateHostKey(path string) (ssh.Signer, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := generateHostKey(path); err != nil {
			return nil, fmt.Errorf("failed to generate host key: %w", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("failed to stat host key: %w", err)
	}

	keyBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read host key: %w", err)
	}

	block, _ := pem.Decode(keyBytes)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	return ssh.NewSignerFromKey(key)
}

func generateHostKey(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	block := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}

	return os.WriteFile(path, pem.EncodeToMemory(block), 0600)
}
