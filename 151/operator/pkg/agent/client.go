package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	HTTPClient *http.Client
	BaseURL    string
}

type PlayerData struct {
	PlayerID   string                 `json:"playerId"`
	PlayerName string                 `json:"playerName"`
	Level      int32                  `json:"level"`
	Data       map[string]interface{} `json:"data"`
	DataSize   int64                  `json:"dataSize"`
}

type MigrationRequest struct {
	SourcePod string       `json:"sourcePod"`
	TargetPod string       `json:"targetPod"`
	Players   []PlayerData `json:"players"`
	Timeout   int32        `json:"timeout"`
}

type MigrationResponse struct {
	Success bool           `json:"success"`
	Results []PlayerResult `json:"results"`
}

type PlayerResult struct {
	PlayerID string `json:"playerId"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

type PlayerListResponse struct {
	Players []PlayerData `json:"players"`
	Total   int32        `json:"total"`
}

type HealthResponse struct {
	Status    string `json:"status"`
	PlayerNum int32  `json:"playerNum"`
	Version   string `json:"version"`
	Frozen    bool   `json:"frozen"`
}

type DrainStatus struct {
	Phase          string    `json:"phase"`
	NewConnections bool      `json:"newConnections"`
	ActiveSessions int32     `json:"activeSessions"`
	StartTime      *time.Time `json:"startTime,omitempty"`
	Completed      bool      `json:"completed"`
}

type ShutdownStatus struct {
	Phase         string    `json:"phase"`
	SignalSent    bool      `json:"signalSent"`
	ProcessExited bool      `json:"processExited"`
	PortsReleased []int     `json:"portsReleased"`
	StartTime     *time.Time `json:"startTime,omitempty"`
	Completed     bool      `json:"completed"`
	Error         string    `json:"error,omitempty"`
}

type PortInfo struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	InUse    bool   `json:"inUse"`
	Pid      int    `json:"pid,omitempty"`
}

type PortCheckResponse struct {
	Ports       []PortInfo `json:"ports"`
	AllReleased bool       `json:"allReleased"`
	CheckedAt   time.Time  `json:"checkedAt"`
}

type ResourceMetrics struct {
	CPUPercent    float64   `json:"cpuPercent"`
	MemoryPercent float64   `json:"memoryPercent"`
	MemoryRSS     int64     `json:"memoryRSS"`
	MemoryLimit   int64     `json:"memoryLimit"`
	OnlinePlayers int32     `json:"onlinePlayers"`
	Timestamp     time.Time `json:"timestamp"`
	PodName       string    `json:"podName"`
}

type DrainRequest struct {
	TimeoutSeconds int32 `json:"timeoutSeconds"`
}

type ShutdownRequest struct {
	Force          bool  `json:"force"`
	TimeoutSeconds int32 `json:"timeoutSeconds"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		BaseURL: baseURL,
	}
}

func (c *Client) GetHealth(ctx context.Context) (*HealthResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/health", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create health request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read health response: %w", err)
	}

	var healthResp HealthResponse
	if err := json.Unmarshal(body, &healthResp); err != nil {
		return nil, fmt.Errorf("failed to parse health response: %w", err)
	}

	return &healthResp, nil
}

func (c *Client) GetPlayers(ctx context.Context) (*PlayerListResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/players", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create players request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get players: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read players response: %w", err)
	}

	var playerResp PlayerListResponse
	if err := json.Unmarshal(body, &playerResp); err != nil {
		return nil, fmt.Errorf("failed to parse players response: %w", err)
	}

	return &playerResp, nil
}

func (c *Client) ExportPlayerData(ctx context.Context, playerID string) (*PlayerData, error) {
	url := fmt.Sprintf("%s/players/%s/export", c.BaseURL, playerID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create export request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to export player data: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read export response: %w", err)
	}

	var playerData PlayerData
	if err := json.Unmarshal(body, &playerData); err != nil {
		return nil, fmt.Errorf("failed to parse export response: %w", err)
	}

	return &playerData, nil
}

func (c *Client) ImportPlayerData(ctx context.Context, data *PlayerData) error {
	body, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal player data: %w", err)
	}

	url := fmt.Sprintf("%s/players/import", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create import request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to import player data: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("import failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *Client) MigratePlayers(ctx context.Context, req *MigrationRequest) (*MigrationResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal migration request: %w", err)
	}

	url := fmt.Sprintf("%s/migrate", c.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create migration request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read migration response: %w", err)
	}

	var migrationResp MigrationResponse
	if err := json.Unmarshal(respBody, &migrationResp); err != nil {
		return nil, fmt.Errorf("failed to parse migration response: %w", err)
	}

	return &migrationResp, nil
}

func (c *Client) FreezePlayers(ctx context.Context) error {
	url := fmt.Sprintf("%s/freeze", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create freeze request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to freeze players: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("freeze failed with status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) UnfreezePlayers(ctx context.Context) error {
	url := fmt.Sprintf("%s/unfreeze", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create unfreeze request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to unfreeze players: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unfreeze failed with status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) StartDrain(ctx context.Context, timeoutSeconds int32) (*DrainStatus, error) {
	drainReq := DrainRequest{
		TimeoutSeconds: timeoutSeconds,
	}
	body, err := json.Marshal(drainReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal drain request: %w", err)
	}

	url := fmt.Sprintf("%s/drain", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create drain request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to start drain: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read drain response: %w", err)
	}

	var drainStatus DrainStatus
	if err := json.Unmarshal(respBody, &drainStatus); err != nil {
		return nil, fmt.Errorf("failed to parse drain response: %w", err)
	}

	return &drainStatus, nil
}

func (c *Client) GetDrainStatus(ctx context.Context) (*DrainStatus, error) {
	url := fmt.Sprintf("%s/drain/status", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create drain status request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get drain status: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read drain status response: %w", err)
	}

	var drainStatus DrainStatus
	if err := json.Unmarshal(respBody, &drainStatus); err != nil {
		return nil, fmt.Errorf("failed to parse drain status response: %w", err)
	}

	return &drainStatus, nil
}

func (c *Client) StartShutdown(ctx context.Context, force bool, timeoutSeconds int32) (*ShutdownStatus, error) {
	shutdownReq := ShutdownRequest{
		Force:          force,
		TimeoutSeconds: timeoutSeconds,
	}
	body, err := json.Marshal(shutdownReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal shutdown request: %w", err)
	}

	url := fmt.Sprintf("%s/shutdown", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create shutdown request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to start shutdown: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read shutdown response: %w", err)
	}

	var shutdownStatus ShutdownStatus
	if err := json.Unmarshal(respBody, &shutdownStatus); err != nil {
		return nil, fmt.Errorf("failed to parse shutdown response: %w", err)
	}

	return &shutdownStatus, nil
}

func (c *Client) SendShutdownSignal(ctx context.Context) error {
	url := fmt.Sprintf("%s/shutdown/signal", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create shutdown signal request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send shutdown signal: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("shutdown signal failed with status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) SendForceKill(ctx context.Context) error {
	url := fmt.Sprintf("%s/shutdown/force", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create force kill request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send force kill: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("force kill failed with status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) GetShutdownStatus(ctx context.Context) (*ShutdownStatus, error) {
	url := fmt.Sprintf("%s/shutdown/status", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create shutdown status request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get shutdown status: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read shutdown status response: %w", err)
	}

	var shutdownStatus ShutdownStatus
	if err := json.Unmarshal(respBody, &shutdownStatus); err != nil {
		return nil, fmt.Errorf("failed to parse shutdown status response: %w", err)
	}

	return &shutdownStatus, nil
}

func (c *Client) CheckPortsReleased(ctx context.Context) (*PortCheckResponse, error) {
	url := fmt.Sprintf("%s/ports/check", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create port check request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to check ports: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read port check response: %w", err)
	}

	var portCheckResp PortCheckResponse
	if err := json.Unmarshal(respBody, &portCheckResp); err != nil {
		return nil, fmt.Errorf("failed to parse port check response: %w", err)
	}

	return &portCheckResp, nil
}

func (c *Client) ConfigGamePorts(ctx context.Context, ports []int) error {
	body, err := json.Marshal(map[string][]int{"ports": ports})
	if err != nil {
		return fmt.Errorf("failed to marshal ports: %w", err)
	}

	url := fmt.Sprintf("%s/ports/config", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create config ports request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to config ports: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("config ports failed with status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) WaitForDrainComplete(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		status, err := c.GetDrainStatus(ctx)
		if err != nil {
			return fmt.Errorf("failed to check drain status: %w", err)
		}

		if status.Completed {
			return nil
		}

		time.Sleep(2 * time.Second)
	}

	return fmt.Errorf("drain timeout after %v", timeout)
}

func (c *Client) WaitForProcessExit(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		status, err := c.GetShutdownStatus(ctx)
		if err != nil {
			return fmt.Errorf("failed to check shutdown status: %w", err)
		}

		if status.ProcessExited {
			return nil
		}

		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("process exit timeout after %v", timeout)
}

func (c *Client) WaitForPortsReleased(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		portCheck, err := c.CheckPortsReleased(ctx)
		if err != nil {
			return fmt.Errorf("failed to check ports: %w", err)
		}

		if portCheck.AllReleased {
			return nil
		}

		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("port release timeout after %v", timeout)
}

func (c *Client) GetResourceMetrics(ctx context.Context) (*ResourceMetrics, error) {
	url := fmt.Sprintf("%s/metrics/resource", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource metrics request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get resource metrics: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read resource metrics response: %w", err)
	}

	var metrics ResourceMetrics
	if err := json.Unmarshal(body, &metrics); err != nil {
		return nil, fmt.Errorf("failed to parse resource metrics response: %w", err)
	}

	return &metrics, nil
}
