package sdk

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"ztunnel/internal/totp"
)

type Client struct {
	AdminAPIAddr  string
	TunnelAddr    string
	ClientCertPEM []byte
	ClientKeyPEM  []byte
	ServerCA      []byte
	TOTPSecret    string
	AdminToken    string
	httpClient    *http.Client
}

type AuthRequest struct {
	ClientCertPEM string `json:"client_cert_pem"`
	TOTPCode      string `json:"totp_code"`
	ServiceID     string `json:"service_id"`
}

type AuthResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	Error   string `json:"error,omitempty"`
	Warning string `json:"warning,omitempty"`
}

type ServiceAccess struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	TargetAddr string   `json:"target_addr"`
	Enabled    bool     `json:"enabled"`
	AllowedCNs []string `json:"allowed_cns"`
}

type TunnelSession struct {
	ID          string `json:"id"`
	ClientCN    string `json:"client_cn"`
	ServiceID   string `json:"service_id"`
	ServiceName string `json:"service_name"`
	SourceAddr  string `json:"source_addr"`
	TargetAddr  string `json:"target_addr"`
	BytesSent   int64  `json:"bytes_sent"`
	BytesRecv   int64  `json:"bytes_recv"`
	Active      bool   `json:"active"`
	RiskLevel   string `json:"risk_level"`
	RiskReason  string `json:"risk_reason,omitempty"`
}

type AuditLog struct {
	Timestamp   time.Time `json:"timestamp"`
	ClientCN    string    `json:"client_cn"`
	SourceIP    string    `json:"source_ip"`
	ServiceID   string    `json:"service_id"`
	ServiceName string    `json:"service_name"`
	TargetAddr  string    `json:"target_addr"`
	BytesSent   int64     `json:"bytes_sent"`
	BytesRecv   int64     `json:"bytes_recv"`
	Duration    int64     `json:"duration_ms"`
	Action      string    `json:"action"`
	Status      string    `json:"status"`
}

type TunnelConn struct {
	conn       net.Conn
	TargetAddr string
	Token      string
}

func NewClient(adminAPIAddr, tunnelAddr string, opts ...ClientOption) *Client {
	c := &Client{
		AdminAPIAddr: adminAPIAddr,
		TunnelAddr:   tunnelAddr,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

type ClientOption func(*Client)

func WithClientCert(certPEM, keyPEM []byte) ClientOption {
	return func(c *Client) {
		c.ClientCertPEM = certPEM
		c.ClientKeyPEM = keyPEM
	}
}

func WithServerCA(caPEM []byte) ClientOption {
	return func(c *Client) {
		c.ServerCA = caPEM
	}
}

func WithTOTPSecret(secret string) ClientOption {
	return func(c *Client) {
		c.TOTPSecret = secret
	}
}

func WithAdminToken(token string) ClientOption {
	return func(c *Client) {
		c.AdminToken = token
	}
}

func (c *Client) Authenticate(serviceID string) (*AuthResponse, error) {
	totpGen := totp.New(c.TOTPSecret)
	code, err := totpGen.Generate()
	if err != nil {
		return nil, fmt.Errorf("failed to generate TOTP: %w", err)
	}

	req := AuthRequest{
		ClientCertPEM: string(c.ClientCertPEM),
		TOTPCode:      code,
		ServiceID:     serviceID,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/auth", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("auth request failed: %w", err)
	}
	defer resp.Body.Close()

	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return nil, fmt.Errorf("failed to decode auth response: %w", err)
	}

	if !authResp.Success {
		return &authResp, fmt.Errorf("authentication failed: %s", authResp.Error)
	}

	return &authResp, nil
}

func (c *Client) ConnectTunnel(token, serviceID string) (*TunnelConn, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
	}

	conn, err := tls.Dial("tcp", c.TunnelAddr, tlsConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to tunnel: %w", err)
	}

	handshake := struct {
		Token     string `json:"token"`
		ServiceID string `json:"service_id"`
	}{
		Token:     token,
		ServiceID: serviceID,
	}

	if err := json.NewEncoder(conn).Encode(handshake); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to send handshake: %w", err)
	}

	var tunnelResp struct {
		Success    bool   `json:"success"`
		TargetAddr string `json:"target_addr"`
		Error      string `json:"error"`
	}

	if err := json.NewDecoder(conn).Decode(&tunnelResp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to decode tunnel response: %w", err)
	}

	if !tunnelResp.Success {
		conn.Close()
		return nil, fmt.Errorf("tunnel connection failed: %s", tunnelResp.Error)
	}

	return &TunnelConn{
		conn:       conn,
		TargetAddr: tunnelResp.TargetAddr,
		Token:      token,
	}, nil
}

func (tc *TunnelConn) Read(p []byte) (n int, err error) {
	return tc.conn.Read(p)
}

func (tc *TunnelConn) Write(p []byte) (n int, err error) {
	return tc.conn.Write(p)
}

func (tc *TunnelConn) Close() error {
	return tc.conn.Close()
}

func (tc *TunnelConn) LocalAddr() net.Addr {
	return tc.conn.LocalAddr()
}

func (tc *TunnelConn) RemoteAddr() net.Addr {
	return tc.conn.RemoteAddr()
}

func (tc *TunnelConn) SetDeadline(t time.Time) error {
	return tc.conn.SetDeadline(t)
}

func (tc *TunnelConn) SetReadDeadline(t time.Time) error {
	return tc.conn.SetReadDeadline(t)
}

func (tc *TunnelConn) SetWriteDeadline(t time.Time) error {
	return tc.conn.SetWriteDeadline(t)
}

func (c *Client) GetServices() ([]ServiceAccess, error) {
	req, err := http.NewRequest("GET", c.AdminAPIAddr+"/api/services", nil)
	if err != nil {
		return nil, err
	}
	if c.AdminToken != "" {
		req.Header.Set("X-Admin-Token", c.AdminToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var services []ServiceAccess
	if err := json.NewDecoder(resp.Body).Decode(&services); err != nil {
		return nil, err
	}
	return services, nil
}

func (c *Client) RegisterService(svc ServiceAccess) error {
	body, err := json.Marshal(svc)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/services", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to register service: %s", string(respBody))
	}
	return nil
}

func (c *Client) UnregisterService(serviceID string) error {
	req, err := http.NewRequest("DELETE", c.AdminAPIAddr+"/api/services/"+serviceID, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("failed to unregister service")
	}
	return nil
}

func (c *Client) Authorize(serviceID, clientCN string) error {
	body, err := json.Marshal(map[string]string{
		"service_id": serviceID,
		"client_cn":  clientCN,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/authorize", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("authorization failed: %s", string(respBody))
	}
	return nil
}

func (c *Client) Revoke(serviceID, clientCN string) error {
	body, err := json.Marshal(map[string]string{
		"service_id": serviceID,
		"client_cn":  clientCN,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/revoke", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("revocation failed: %s", string(respBody))
	}
	return nil
}

func (c *Client) GetSessions() ([]TunnelSession, error) {
	req, err := http.NewRequest("GET", c.AdminAPIAddr+"/api/sessions", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var sessions []TunnelSession
	if err := json.NewDecoder(resp.Body).Decode(&sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (c *Client) GetAuditLogs(limit int) ([]AuditLog, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/api/audit?limit=%d", c.AdminAPIAddr, limit), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var logs []AuditLog
	if err := json.NewDecoder(resp.Body).Decode(&logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (c *Client) GenerateTOTP(accountName, issuer string) (secret string, uri string, err error) {
	body, err := json.Marshal(map[string]string{
		"account_name": accountName,
		"issuer":       issuer,
	})
	if err != nil {
		return "", "", err
	}

	req, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/totp/generate", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var result struct {
		Secret string `json:"secret"`
		URI    string `json:"uri"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}
	return result.Secret, result.URI, nil
}

type LockStatus struct {
	ClientCN       string    `json:"client_cn"`
	FailedAttempts int       `json:"failed_attempts"`
	LastFailure    time.Time `json:"last_failure"`
	LockedUntil    time.Time `json:"locked_until"`
	IsLocked       bool      `json:"is_locked"`
}

func (c *Client) GetLocks() ([]LockStatus, error) {
	req, err := http.NewRequest("GET", c.AdminAPIAddr+"/api/locks", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var locks []LockStatus
	if err := json.NewDecoder(resp.Body).Decode(&locks); err != nil {
		return nil, err
	}
	return locks, nil
}

func (c *Client) GetLock(clientCN string) (*LockStatus, error) {
	req, err := http.NewRequest("GET", c.AdminAPIAddr+"/api/locks/"+clientCN, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("no lock record for %s", clientCN)
	}

	var lock LockStatus
	if err := json.NewDecoder(resp.Body).Decode(&lock); err != nil {
		return nil, err
	}
	return &lock, nil
}

func (c *Client) Unlock(clientCN string) error {
	body, err := json.Marshal(map[string]string{
		"client_cn": clientCN,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.AdminAPIAddr+"/api/unlock", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Token", c.AdminToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unlock failed: %s", string(respBody))
	}
	return nil
}
