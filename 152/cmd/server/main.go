package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ztunnel/internal/certs"
	"ztunnel/internal/geo"
	"ztunnel/internal/server"
)

func main() {
	var (
		tunnelAddr  = flag.String("tunnel", ":8443", "Tunnel server address")
		adminAddr   = flag.String("admin", ":8080", "Admin API address")
		certDir     = flag.String("certs", "./certs", "Certificate directory")
		auditDir    = flag.String("audit", "./audit", "Audit log directory")
		adminToken  = flag.String("admin-token", "admin-secret-token", "Admin API token")
	)
	flag.Parse()

	certMgr, err := certs.New(*certDir)
	if err != nil {
		log.Fatalf("Failed to initialize certificate manager: %v", err)
	}

	serverCertPEM, serverKeyPEM, err := certMgr.IssueServerCertificate([]string{"localhost", "127.0.0.1"})
	if err != nil {
		log.Fatalf("Failed to issue server certificate: %v", err)
	}

	clientCertPEM, clientKeyPEM, fingerprint, err := certMgr.IssueClientCertificate("client-1", "ZTunnel Clients")
	if err != nil {
		log.Fatalf("Failed to issue client certificate: %v", err)
	}

	fmt.Println("=== Generated Client Certificate ===")
	fmt.Printf("Fingerprint: %s\n", fingerprint)
	fmt.Printf("Client Cert:\n%s\n", string(clientCertPEM))
	fmt.Printf("Client Key:\n%s\n", string(clientKeyPEM))
	fmt.Printf("TOTP Secret for client-1: JBSWY3DPEHPK3PXP")
	fmt.Println()

	audit, err := server.NewAuditLogger(*auditDir)
	if err != nil {
		log.Fatalf("Failed to create audit logger: %v", err)
	}
	defer audit.Close()

	registry := server.NewServiceRegistry()
	sessions := server.NewSessionManager()
	geoTracker := geo.NewGeoTracker()
	tokens := server.NewTokenManager(certMgr.GetCACertPEM(), geoTracker)

	registry.Register(&server.ServiceAccess{
		ID:          "svc-demo-http",
		Name:        "Demo HTTP Service",
		TargetAddr:  "httpbin.org:80",
		Enabled:     true,
		CreatedAt:   time.Now(),
		AllowedCNs:   []string{"client-1", "admin"},
	})

	registry.Register(&server.ServiceAccess{
		ID:          "svc-echo",
		Name:        "Echo Service",
		TargetAddr:  "tcpbin.com:4242",
		Enabled:     true,
		CreatedAt:   time.Now(),
		AllowedCNs:   []string{"client-1"},
	})

	tunnel, err := server.NewTunnelServer(registry, sessions, audit, tokens, serverCertPEM, serverKeyPEM)
	if err != nil {
		log.Fatalf("Failed to create tunnel server: %v", err)
	}

	adminServer := server.NewAdminServer(registry, sessions, audit, tokens, *adminToken)

	go func() {
		log.Printf("[Admin] Starting admin API on %s", *adminAddr)
		if err := adminServer.Start(*adminAddr); err != nil {
			log.Fatalf("Admin server failed: %v", err)
		}
	}()

	go func() {
		log.Printf("[Tunnel] Starting tunnel server on %s", *tunnelAddr)
		if err := tunnel.Start(*tunnelAddr); err != nil {
			log.Fatalf("Tunnel server failed: %v", err)
		}
	}()

	fmt.Println()
	fmt.Println("=== ZTunnel Zero Trust Tunnel Server Started ===")
	fmt.Printf("Admin API: http://localhost%s\n", *adminAddr)
	fmt.Printf("Tunnel:    localhost%s\n", *tunnelAddr)
	fmt.Println()
	fmt.Println("Available Services:")
	for _, svc := range registry.GetAll() {
		fmt.Printf("  - %s (%s) -> %s\n", svc.ID, svc.Name, svc.TargetAddr)
	}
	fmt.Println()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	tunnel.Stop()
	os.Exit(0)
}
