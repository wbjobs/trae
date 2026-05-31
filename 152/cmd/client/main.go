package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"time"

	"ztunnel/pkg/sdk"
)

func main() {
	var (
		adminAddr  = flag.String("admin", "http://localhost:8080", "Admin API address")
		tunnelAddr = flag.String("tunnel", "localhost:8443", "Tunnel server address")
		serviceID  = flag.String("service", "svc-demo-http", "Service ID to connect to")
		certFile   = flag.String("cert", "", "Path to client certificate PEM file")
		keyFile    = flag.String("key", "", "Path to client key PEM file")
		totpSecret = flag.String("totp", "JBSWY3DPEHPK3PXP", "TOTP secret")
		listen     = flag.String("listen", "", "Local listen address for proxy mode (e.g., :8081)")
	)
	flag.Parse()

	var clientCertPEM, clientKeyPEM []byte
	var err error

	if *certFile != "" {
		clientCertPEM, err = os.ReadFile(*certFile)
		if err != nil {
			log.Fatalf("Failed to read client certificate: %v", err)
		}
	}
	if *keyFile != "" {
		clientKeyPEM, err = os.ReadFile(*keyFile)
		if err != nil {
			log.Fatalf("Failed to read client key: %v", err)
		}
	}

	clientCertPEM = []byte(`-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUJ5DemoCertificatePlaceholderOnly0=
-----END CERTIFICATE-----`)

	client := sdk.NewClient(
		*adminAddr,
		*tunnelAddr,
		sdk.WithClientCert(clientCertPEM, clientKeyPEM),
		sdk.WithTOTPSecret(*totpSecret),
	)

	fmt.Println("=== Authenticating with tunnel server ===")
	authResp, err := client.Authenticate(*serviceID)
	if err != nil {
		log.Fatalf("Authentication failed: %v", err)
	}
	fmt.Printf("Authentication successful! Token: %s\n", authResp.Token[:16]+"...")
	fmt.Println()

	if *listen != "" {
		runProxyMode(client, *listen, authResp.Token, *serviceID)
		return
	}

	runInteractiveMode(client, authResp.Token, *serviceID)
}

func runInteractiveMode(client *sdk.Client, token, serviceID string) {
	fmt.Println("=== Connecting to tunnel ===")
	tunnel, err := client.ConnectTunnel(token, serviceID)
	if err != nil {
		log.Fatalf("Tunnel connection failed: %v", err)
	}
	defer tunnel.Close()

	fmt.Printf("Connected! Target: %s\n", tunnel.TargetAddr)
	fmt.Println()

	fmt.Println("=== Services Available ===")
	services, err := client.GetServices()
	if err != nil {
		log.Printf("Failed to get services: %v", err)
	} else {
		for _, svc := range services {
			status := "enabled"
			if !svc.Enabled {
				status = "disabled"
			}
			fmt.Printf("  - %s (%s) -> %s [%s]\n", svc.ID, svc.Name, svc.TargetAddr, status)
		}
	}
	fmt.Println()

	fmt.Println("=== Active Sessions ===")
	sessions, err := client.GetSessions()
	if err != nil {
		log.Printf("Failed to get sessions: %v", err)
	} else {
		for _, s := range sessions {
			status := "active"
			if !s.Active {
				status = "closed"
			}
			fmt.Printf("  - %s: %s -> %s (sent: %d, recv: %d) [%s]\n",
				s.ID, s.SourceAddr, s.TargetAddr, s.BytesSent, s.BytesRecv, status)
		}
	}
	fmt.Println()

	fmt.Println("=== Sending test data through tunnel ===")
	testData := "GET / HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n"
	written, err := tunnel.Write([]byte(testData))
	if err != nil {
		log.Printf("Failed to write to tunnel: %v", err)
		return
	}
	fmt.Printf("Sent %d bytes\n", written)

	buf := make([]byte, 4096)
	tunnel.SetReadDeadline(time.Now().Add(10 * time.Second))
	n, err := tunnel.Read(buf)
	if err != nil && err != io.EOF {
		log.Printf("Read error: %v", err)
	} else {
		fmt.Printf("Received %d bytes:\n", n)
		if n > 500 {
			fmt.Println(string(buf[:500]))
			fmt.Println("... (truncated)")
		} else {
			fmt.Println(string(buf[:n]))
		}
	}

	fmt.Println()
	fmt.Println("=== Client Demo Complete ===")
}

func runProxyMode(client *sdk.Client, listenAddr, token, serviceID string) {
	fmt.Printf("=== Starting local proxy on %s ===\n", listenAddr)

	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("Failed to start proxy listener: %v", err)
	}
	defer listener.Close()

	fmt.Printf("Proxy listening on %s, forwarding to service %s\n", listenAddr, serviceID)
	fmt.Println("Press Ctrl+C to stop")

	for {
		localConn, err := listener.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}

		go func() {
			defer localConn.Close()

			fmt.Printf("New local connection from %s\n", localConn.RemoteAddr())

			tunnel, err := client.ConnectTunnel(token, serviceID)
			if err != nil {
				log.Printf("Tunnel connection failed: %v", err)
				return
			}
			defer tunnel.Close()

			go io.Copy(tunnel, localConn)
			io.Copy(localConn, tunnel)

			fmt.Printf("Connection closed for %s\n", localConn.RemoteAddr())
		}()
	}
}

func init() {
}
