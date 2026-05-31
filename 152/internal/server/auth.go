package server

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"ztunnel/internal/certs"
	"ztunnel/internal/geo"
	"ztunnel/internal/totp"
)

const (
	maxFailedAttempts = 3
	lockoutDuration   = 15 * time.Minute
)

type ClientLock struct {
	FailedAttempts int
	LastFailure    time.Time
	LockedUntil    time.Time
}

type TokenManager struct {
	mu         sync.RWMutex
	tokens     map[string]*TokenInfo
	locks      map[string]*ClientLock
	geoTracker *geo.GeoTracker
	caCertPEM  []byte
}

type TokenInfo struct {
	Token     string
	ClientCN  string
	ServiceID string
	CreatedAt time.Time
	ExpiresAt time.Time
	Used      bool
	RiskLevel string
	RiskReason string
	SourceIP  string
}

func NewTokenManager(caCertPEM []byte, geoTracker *geo.GeoTracker) *TokenManager {
	tm := &TokenManager{
		tokens:     make(map[string]*TokenInfo),
		locks:      make(map[string]*ClientLock),
		geoTracker: geoTracker,
		caCertPEM:  caCertPEM,
	}
	go tm.cleanupExpired()
	return tm
}

func (tm *TokenManager) Authenticate(req AuthRequest, sourceIP string) (*AuthResponse, error) {
	clientCert, err := certs.VerifyCertificate(tm.caCertPEM, []byte(req.ClientCertPEM))
	if err != nil {
		return &AuthResponse{
			Success: false,
			Error:   fmt.Sprintf("certificate verification failed: %v", err),
		}, ErrCertInvalid
	}

	clientCN := clientCert.Subject.CommonName

	if tm.isLocked(clientCN) {
		return &AuthResponse{
			Success: false,
			Error:   fmt.Sprintf("account is locked until %s", tm.lockUntil(clientCN).Format(time.RFC3339)),
		}, ErrAccountLocked
	}

	riskAssessment := tm.geoTracker.AssessRisk(clientCN, sourceIP)

	if riskAssessment.IsRisky {
		tm.mu.Lock()
		tm.invalidateTokensForLocked(clientCN)
		tm.mu.Unlock()

		totpSecret := tm.getTOTPSecret(clientCN)
		totpValidator := totp.New(totpSecret)

		if !totpValidator.Validate(req.TOTPCode) {
			tm.recordFailure(clientCN)
			return &AuthResponse{
				Success: false,
				Error:   "geo-mutation detected: forced re-verification required, invalid TOTP code",
			}, ErrTOTPInvalid
		}

		tm.resetFailures(clientCN)
		tm.geoTracker.RecordLogin(clientCN, sourceIP)

		token, err := generateToken()
		if err != nil {
			return nil, fmt.Errorf("failed to generate token: %w", err)
		}

		info := &TokenInfo{
			Token:      token,
			ClientCN:   clientCN,
			ServiceID:  req.ServiceID,
			CreatedAt:  time.Now(),
			ExpiresAt:  time.Now().Add(5 * time.Minute),
			RiskLevel:  "high",
			RiskReason: fmt.Sprintf("geo-mutation: %s (%.0fkm in %.0fmin)", riskAssessment.RiskReason, riskAssessment.DistanceKM, riskAssessment.TimeDeltaMin),
			SourceIP:   sourceIP,
		}

		tm.mu.Lock()
		tm.tokens[token] = info
		tm.mu.Unlock()

		return &AuthResponse{
			Success:   true,
			Token:     token,
			Warning:   fmt.Sprintf("security alert: unusual location change detected (%s -> %s, %.0fkm). Forced re-verification completed.", riskAssessment.LastLocation.Name, riskAssessment.Location.Name, riskAssessment.DistanceKM),
		}, nil
	}

	totpSecret := tm.getTOTPSecret(clientCN)
	totpValidator := totp.New(totpSecret)

	if !totpValidator.Validate(req.TOTPCode) {
		tm.recordFailure(clientCN)
		return &AuthResponse{
			Success: false,
			Error:   "invalid TOTP code",
		}, ErrTOTPInvalid
	}

	tm.resetFailures(clientCN)
	tm.geoTracker.RecordLogin(clientCN, sourceIP)

	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	riskLevel := "low"
	if riskAssessment.RiskLevel == "medium" {
		riskLevel = "medium"
	}

	info := &TokenInfo{
		Token:      token,
		ClientCN:   clientCN,
		ServiceID:  req.ServiceID,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(5 * time.Minute),
		RiskLevel:  riskLevel,
		RiskReason: riskAssessment.RiskReason,
		SourceIP:   sourceIP,
	}

	tm.mu.Lock()
	tm.tokens[token] = info
	tm.mu.Unlock()

	return &AuthResponse{
		Success: true,
		Token:   token,
	}, nil
}

func (tm *TokenManager) ValidateToken(token string) (*TokenInfo, error) {
	tm.mu.RLock()
	info, ok := tm.tokens[token]
	tm.mu.RUnlock()

	if !ok {
		return nil, ErrInvalidToken
	}

	if tm.isLocked(info.ClientCN) {
		return nil, ErrAccountLocked
	}

	if time.Now().After(info.ExpiresAt) {
		tm.mu.Lock()
		delete(tm.tokens, token)
		tm.mu.Unlock()
		return nil, ErrInvalidToken
	}

	return info, nil
}

func (tm *TokenManager) UseToken(token string) (*TokenInfo, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	info, ok := tm.tokens[token]
	if !ok {
		return nil, ErrInvalidToken
	}

	if tm.isLockedLocked(info.ClientCN) {
		return nil, ErrAccountLocked
	}

	if info.Used {
		return nil, ErrInvalidToken
	}

	if time.Now().After(info.ExpiresAt) {
		delete(tm.tokens, token)
		return nil, ErrInvalidToken
	}

	info.Used = true
	return info, nil
}

func (tm *TokenManager) isLocked(clientCN string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return tm.isLockedLocked(clientCN)
}

func (tm *TokenManager) isLockedLocked(clientCN string) bool {
	lock, ok := tm.locks[clientCN]
	if !ok {
		return false
	}
	if time.Now().Before(lock.LockedUntil) {
		return true
	}
	return false
}

func (tm *TokenManager) lockUntil(clientCN string) time.Time {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	if lock, ok := tm.locks[clientCN]; ok {
		return lock.LockedUntil
	}
	return time.Time{}
}

func (tm *TokenManager) recordFailure(clientCN string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	lock, ok := tm.locks[clientCN]
	if !ok {
		lock = &ClientLock{}
		tm.locks[clientCN] = lock
	}

	lock.FailedAttempts++
	lock.LastFailure = time.Now()

	if lock.FailedAttempts >= maxFailedAttempts {
		lock.LockedUntil = time.Now().Add(lockoutDuration)
		tm.invalidateTokensForLocked(clientCN)
	}
}

func (tm *TokenManager) resetFailures(clientCN string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	delete(tm.locks, clientCN)
}

func (tm *TokenManager) invalidateTokensForLocked(clientCN string) {
	for token, info := range tm.tokens {
		if info.ClientCN == clientCN {
			delete(tm.tokens, token)
		}
	}
}

func (tm *TokenManager) cleanupExpired() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		tm.mu.Lock()
		now := time.Now()
		for token, info := range tm.tokens {
			if now.After(info.ExpiresAt) {
				delete(tm.tokens, token)
			}
		}
		for cn, lock := range tm.locks {
			if now.After(lock.LockedUntil) && lock.LockedUntil.After(time.Time{}) {
				delete(tm.locks, cn)
			}
		}
		tm.mu.Unlock()
	}
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (tm *TokenManager) getTOTPSecret(clientCN string) string {
	secrets := map[string]string{
		"client-1": "JBSWY3DPEHPK3PXP",
		"client-2": "KRSXG5CTMVRXEZLU",
		"admin":    "MFRGGZDFMZTWQ2LK",
	}
	if secret, ok := secrets[clientCN]; ok {
		return secret
	}
	return "JBSWY3DPEHPK3PXP"
}

func (tm *TokenManager) SetTOTPSecret(clientCN, secret string) {
}

func (tm *TokenManager) ClientCNFromCert(certPEM string) (string, error) {
	clientCert, err := certs.VerifyCertificate(tm.caCertPEM, []byte(certPEM))
	if err != nil {
		return "", err
	}
	return clientCert.Subject.CommonName, nil
}

type LockStatus struct {
	ClientCN       string    `json:"client_cn"`
	FailedAttempts int       `json:"failed_attempts"`
	LastFailure    time.Time `json:"last_failure"`
	LockedUntil    time.Time `json:"locked_until"`
	IsLocked       bool      `json:"is_locked"`
}

func (tm *TokenManager) GetLocks() []LockStatus {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	var result []LockStatus
	for cn, lock := range tm.locks {
		result = append(result, LockStatus{
			ClientCN:       cn,
			FailedAttempts: lock.FailedAttempts,
			LastFailure:    lock.LastFailure,
			LockedUntil:    lock.LockedUntil,
			IsLocked:       time.Now().Before(lock.LockedUntil),
		})
	}
	return result
}

func (tm *TokenManager) GetLock(clientCN string) (LockStatus, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	lock, ok := tm.locks[clientCN]
	if !ok {
		return LockStatus{}, false
	}
	return LockStatus{
		ClientCN:       clientCN,
		FailedAttempts: lock.FailedAttempts,
		LastFailure:    lock.LastFailure,
		LockedUntil:    lock.LockedUntil,
		IsLocked:       time.Now().Before(lock.LockedUntil),
	}, true
}

func (tm *TokenManager) Unlock(clientCN string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	delete(tm.locks, clientCN)
}

func (tm *TokenManager) GetRiskHistory(clientCN string) (*geo.RiskAssessment, *geo.ClientGeoHistory, bool) {
	assessment := tm.geoTracker.AssessRisk(clientCN, "")
	history, ok := tm.geoTracker.GetHistory(clientCN)
	if !ok {
		return nil, nil, false
	}
	return &assessment, history, true
}

func (tm *TokenManager) GetAllRiskHistory() []geo.ClientGeoHistory {
	return tm.geoTracker.GetAllHistory()
}

func (tm *TokenManager) ClearGeoHistory(clientCN string) {
	tm.geoTracker.ClearHistory(clientCN)
}
