package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"ztunnel/internal/certs"
)

func main() {
	var (
		certDir    = flag.String("dir", "./certs", "Output directory for certificates")
		clientCN   = flag.String("cn", "client-1", "Client certificate Common Name")
		clientOrg  = flag.String("org", "ZTunnel Clients", "Client organization")
		serverCN   = flag.String("server-cn", "ztunnel-server", "Server certificate Common Name")
		serverHost = flag.String("server-host", "localhost", "Server hostname/IP for SAN")
	)
	flag.Parse()

	if err := os.MkdirAll(*certDir, 0700); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create cert directory: %v\n", err)
		os.Exit(1)
	}

	cm, err := certs.New(*certDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create certificate manager: %v\n", err)
		os.Exit(1)
	}

	caCertPath := filepath.Join(*certDir, "ca.crt")
	fmt.Printf("CA Certificate: %s\n", caCertPath)

	serverCertPEM, serverKeyPEM, err := cm.IssueServerCertificate([]string{*serverHost, "127.0.0.1"})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to issue server certificate: %v\n", err)
		os.Exit(1)
	}

	serverCertPath := filepath.Join(*certDir, "server.crt")
	serverKeyPath := filepath.Join(*certDir, "server.key")
	if err := os.WriteFile(serverCertPath, serverCertPEM, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write server cert: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(serverKeyPath, serverKeyPEM, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write server key: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Server Certificate: %s\n", serverCertPath)
	fmt.Printf("Server Key: %s\n", serverKeyPath)

	clientCertPEM, clientKeyPEM, fingerprint, err := cm.IssueClientCertificate(*clientCN, *clientOrg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to issue client certificate: %v\n", err)
		os.Exit(1)
	}

	clientCertPath := filepath.Join(*certDir, "client.crt")
	clientKeyPath := filepath.Join(*certDir, "client.key")
	if err := os.WriteFile(clientCertPath, clientCertPEM, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write client cert: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(clientKeyPath, clientKeyPEM, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write client key: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Client Certificate: %s\n", clientCertPath)
	fmt.Printf("Client Key: %s\n", clientKeyPath)
	fmt.Printf("Client Fingerprint: %s\n", fingerprint)
	fmt.Printf("Client CN: %s\n", *clientCN)

	fmt.Println()
	fmt.Println("=== Generated Files ===")
	fmt.Printf("  %s/ca.crt     (CA certificate)\n", *certDir)
	fmt.Printf("  %s/ca.key     (CA private key)\n", *certDir)
	fmt.Printf("  %s/server.crt (Server certificate)\n", *certDir)
	fmt.Printf("  %s/server.key (Server private key)\n", *certDir)
	fmt.Printf("  %s/client.crt (Client certificate)\n", *certDir)
	fmt.Printf("  %s/client.key (Client private key)\n", *certDir)
	fmt.Println()
	fmt.Println("TOTP Secrets (configured in server/auth.go):")
	fmt.Println("  client-1: JBSWY3DPEHPK3PXP")
	fmt.Println("  admin:    MFRGGZDFMZTWQ2LK")
}
