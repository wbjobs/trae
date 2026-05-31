package server

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

type TunnelServer struct {
	listener   net.Listener
	registry   *ServiceRegistry
	sessions   *SessionManager
	audit      *AuditLogger
	tokens     *TokenManager
	tlsConfig  *tls.Config
	mu         sync.RWMutex
}

type TunnelHandshake struct {
	Token     string `json:"token"`
	ServiceID string `json:"service_id"`
}

type TunnelResponse struct {
	Success     bool   `json:"success"`
	TargetAddr  string `json:"target_addr,omitempty"`
	Error       string `json:"error,omitempty"`
}

func NewTunnelServer(
	registry *ServiceRegistry,
	sessions *SessionManager,
	audit *AuditLogger,
	tokens *TokenManager,
	serverCertPEM, serverKeyPEM []byte,
) (*TunnelServer, error) {
	cert, err := tls.X509KeyPair(serverCertPEM, serverKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("failed to load server certificate: %w", err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS13,
	}

	return &TunnelServer{
		registry:  registry,
		sessions:  sessions,
		audit:     audit,
		tokens:    tokens,
		tlsConfig: tlsConfig,
	}, nil
}

func (ts *TunnelServer) Start(addr string) error {
	listener, err := tls.Listen("tcp", addr, ts.tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to start tunnel listener: %w", err)
	}
	ts.listener = listener
	fmt.Printf("[Tunnel] Listening on %s\n", addr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Fprintf(io.Discard, "[Tunnel] Accept error: %v\n", err)
			continue
		}
		go ts.handleConnection(conn)
	}
}

func (ts *TunnelServer) handleConnection(clientConn net.Conn) {
	defer clientConn.Close()

	clientAddr := clientConn.RemoteAddr().String()

	clientConn.SetDeadline(time.Now().Add(30 * time.Second))

	var handshake TunnelHandshake
	if err := json.NewDecoder(clientConn).Decode(&handshake); err != nil {
		ts.respondError(clientConn, "invalid handshake")
		ts.audit.Log(AuditLog{
			SourceIP: clientAddr,
			Action:   "handshake",
			Status:   "failed",
		})
		return
	}

	tokenInfo, err := ts.tokens.UseToken(handshake.Token)
	if err != nil {
		errMsg := "invalid or expired token"
		if err == ErrAccountLocked {
			errMsg = "account is locked"
		}
		ts.respondError(clientConn, errMsg)
		ts.audit.Log(AuditLog{
			SourceIP: clientAddr,
			Action:   "token_validation",
			Status:   "failed",
		})
		return
	}

	if tokenInfo.RiskLevel == "high" {
		ts.audit.Log(AuditLog{
			ClientCN: tokenInfo.ClientCN,
			SourceIP: clientAddr,
			Action:   "geo_mutation",
			Status:   "warning",
		})
	}

	svc, ok := ts.registry.Get(tokenInfo.ServiceID)
	if !ok {
		ts.respondError(clientConn, "service not found")
		return
	}

	if !svc.Enabled {
		ts.respondError(clientConn, "service is disabled")
		return
	}

	if !ts.registry.Authorize(tokenInfo.ServiceID, tokenInfo.ClientCN) {
		ts.respondError(clientConn, "access denied")
		ts.audit.Log(AuditLog{
			ClientCN:  tokenInfo.ClientCN,
			SourceIP:  clientAddr,
			ServiceID: tokenInfo.ServiceID,
			Action:    "authorization",
			Status:    "denied",
		})
		return
	}

	targetConn, err := net.DialTimeout("tcp", svc.TargetAddr, 10*time.Second)
	if err != nil {
		ts.respondError(clientConn, fmt.Sprintf("failed to connect to target: %v", err))
		ts.audit.Log(AuditLog{
			ClientCN:   tokenInfo.ClientCN,
			SourceIP:   clientAddr,
			ServiceID:  tokenInfo.ServiceID,
			TargetAddr: svc.TargetAddr,
			Action:     "connect",
			Status:     "failed",
		})
		return
	}
	defer targetConn.Close()

	resp := TunnelResponse{
		Success:    true,
		TargetAddr: svc.TargetAddr,
	}
	if err := json.NewEncoder(clientConn).Encode(resp); err != nil {
		return
	}

	sessionID := fmt.Sprintf("%s-%d", tokenInfo.ClientCN, time.Now().UnixNano())
	session := &TunnelSession{
		ID:          sessionID,
		ClientCN:    tokenInfo.ClientCN,
		ServiceID:   svc.ID,
		ServiceName: svc.Name,
		SourceAddr:  clientAddr,
		TargetAddr:  svc.TargetAddr,
		StartTime:   time.Now(),
		Active:      true,
		RiskLevel:   tokenInfo.RiskLevel,
		RiskReason:  tokenInfo.RiskReason,
	}
	ts.sessions.Add(session)
	defer ts.sessions.Remove(sessionID)

	fmt.Printf("[Tunnel] Session %s: %s -> %s\n", sessionID, clientAddr, svc.TargetAddr)

	clientConn.SetDeadline(time.Time{})

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		written, _ := io.Copy(targetConn, clientConn)
		ts.mu.Lock()
		session.BytesSent += written
		ts.mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		written, _ := io.Copy(clientConn, targetConn)
		ts.mu.Lock()
		session.BytesRecv += written
		ts.mu.Unlock()
	}()

	wg.Wait()

	session.EndTime = time.Now()
	ts.audit.LogConnection(session)

	fmt.Printf("[Tunnel] Session %s closed: sent=%d recv=%d duration=%v\n",
		sessionID, session.BytesSent, session.BytesRecv,
		session.EndTime.Sub(session.StartTime))
}

func (ts *TunnelServer) respondError(conn net.Conn, msg string) {
	resp := TunnelResponse{
		Success: false,
		Error:   msg,
	}
	json.NewEncoder(conn).Encode(resp)
}

func (ts *TunnelServer) Stop() error {
	if ts.listener != nil {
		return ts.listener.Close()
	}
	return nil
}
