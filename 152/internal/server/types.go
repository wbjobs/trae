package server

import (
	"sync"
	"time"
)

type ServiceAccess struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	TargetAddr  string    `json:"target_addr"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	AllowedCNs  []string  `json:"allowed_cns"`
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

type TunnelSession struct {
	ID           string    `json:"id"`
	ClientCN     string    `json:"client_cn"`
	ServiceID    string    `json:"service_id"`
	ServiceName  string    `json:"service_name"`
	SourceAddr   string    `json:"source_addr"`
	TargetAddr   string    `json:"target_addr"`
	BytesSent    int64     `json:"bytes_sent"`
	BytesRecv    int64     `json:"bytes_recv"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time,omitempty"`
	Active       bool      `json:"active"`
	RiskLevel    string    `json:"risk_level"`
	RiskReason   string    `json:"risk_reason,omitempty"`
}

type AuditLog struct {
	Timestamp  time.Time `json:"timestamp"`
	ClientCN   string    `json:"client_cn"`
	SourceIP   string    `json:"source_ip"`
	ServiceID  string    `json:"service_id"`
	ServiceName string   `json:"service_name"`
	TargetAddr string    `json:"target_addr"`
	BytesSent  int64     `json:"bytes_sent"`
	BytesRecv  int64     `json:"bytes_recv"`
	Duration   int64     `json:"duration_ms"`
	Action     string    `json:"action"`
	Status     string    `json:"status"`
}

type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*TunnelSession
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*TunnelSession),
	}
}

func (sm *SessionManager) Add(s *TunnelSession) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.sessions[s.ID] = s
}

func (sm *SessionManager) Remove(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.Active = false
		s.EndTime = time.Now()
	}
}

func (sm *SessionManager) Get(id string) (*TunnelSession, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[id]
	return s, ok
}

func (sm *SessionManager) GetAll() []*TunnelSession {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	sessions := make([]*TunnelSession, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

type ServiceRegistry struct {
	mu       sync.RWMutex
	services map[string]*ServiceAccess
}

func NewServiceRegistry() *ServiceRegistry {
	return &ServiceRegistry{
		services: make(map[string]*ServiceAccess),
	}
}

func (sr *ServiceRegistry) Register(svc *ServiceAccess) {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	sr.services[svc.ID] = svc
}

func (sr *ServiceRegistry) Unregister(id string) {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	delete(sr.services, id)
}

func (sr *ServiceRegistry) Get(id string) (*ServiceAccess, bool) {
	sr.mu.RLock()
	defer sr.mu.RUnlock()
	s, ok := sr.services[id]
	return s, ok
}

func (sr *ServiceRegistry) GetAll() []*ServiceAccess {
	sr.mu.RLock()
	defer sr.mu.RUnlock()
	services := make([]*ServiceAccess, 0, len(sr.services))
	for _, s := range sr.services {
		services = append(services, s)
	}
	return services
}

func (sr *ServiceRegistry) Authorize(serviceID, clientCN string) bool {
	sr.mu.RLock()
	defer sr.mu.RUnlock()
	svc, ok := sr.services[serviceID]
	if !ok {
		return false
	}
	if !svc.Enabled {
		return false
	}
	for _, cn := range svc.AllowedCNs {
		if cn == clientCN || cn == "*" {
			return true
		}
	}
	return false
}

func (sr *ServiceRegistry) GrantAccess(serviceID, clientCN string) error {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	svc, ok := sr.services[serviceID]
	if !ok {
		return ErrServiceNotFound
	}
	for _, cn := range svc.AllowedCNs {
		if cn == clientCN {
			return nil
		}
	}
	svc.AllowedCNs = append(svc.AllowedCNs, clientCN)
	return nil
}

func (sr *ServiceRegistry) RevokeAccess(serviceID, clientCN string) error {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	svc, ok := sr.services[serviceID]
	if !ok {
		return ErrServiceNotFound
	}
	for i, cn := range svc.AllowedCNs {
		if cn == clientCN {
			svc.AllowedCNs = append(svc.AllowedCNs[:i], svc.AllowedCNs[i+1:]...)
			return nil
		}
	}
	return nil
}

func (sr *ServiceRegistry) SetEnabled(serviceID string, enabled bool) error {
	sr.mu.Lock()
	defer sr.mu.Unlock()
	svc, ok := sr.services[serviceID]
	if !ok {
		return ErrServiceNotFound
	}
	svc.Enabled = enabled
	return nil
}
