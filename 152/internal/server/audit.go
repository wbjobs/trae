package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type AuditLogger struct {
	mu       sync.Mutex
	logFile  *os.File
	logDir   string
	logs     []AuditLog
	maxLogs  int
}

func NewAuditLogger(logDir string) (*AuditLogger, error) {
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create audit log directory: %w", err)
	}

	logPath := filepath.Join(logDir, "audit.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open audit log file: %w", err)
	}

	return &AuditLogger{
		logFile: f,
		logDir:  logDir,
		logs:    make([]AuditLog, 0),
		maxLogs: 10000,
	}, nil
}

func (al *AuditLogger) Log(log AuditLog) {
	al.mu.Lock()
	defer al.mu.Unlock()

	log.Timestamp = time.Now()

	data, err := json.Marshal(log)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to marshal audit log: %v\n", err)
		return
	}

	if _, err := al.logFile.Write(append(data, '\n')); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write audit log: %v\n", err)
	}

	al.logs = append(al.logs, log)
	if len(al.logs) > al.maxLogs {
		al.logs = al.logs[len(al.logs)-al.maxLogs:]
	}
}

func (al *AuditLogger) LogConnection(session *TunnelSession) {
	al.Log(AuditLog{
		ClientCN:    session.ClientCN,
		SourceIP:    session.SourceAddr,
		ServiceID:   session.ServiceID,
		ServiceName: session.ServiceName,
		TargetAddr:  session.TargetAddr,
		BytesSent:   session.BytesSent,
		BytesRecv:   session.BytesRecv,
		Duration:    session.EndTime.Sub(session.StartTime).Milliseconds(),
		Action:      "connection",
		Status:      "closed",
	})
}

func (al *AuditLogger) LogAuthAttempt(clientCN, sourceIP, serviceID, status string) {
	al.Log(AuditLog{
		ClientCN:   clientCN,
		SourceIP:   sourceIP,
		ServiceID:  serviceID,
		Action:     "auth",
		Status:     status,
	})
}

func (al *AuditLogger) LogAccessChange(adminUser, serviceID, clientCN, action string) {
	al.Log(AuditLog{
		ClientCN:   adminUser,
		ServiceID:  serviceID,
		TargetAddr: clientCN,
		Action:     action,
		Status:     "success",
	})
}

func (al *AuditLogger) GetLogs(limit int) []AuditLog {
	al.mu.Lock()
	defer al.mu.Unlock()

	if limit <= 0 || limit > len(al.logs) {
		limit = len(al.logs)
	}

	result := make([]AuditLog, limit)
	copy(result, al.logs[len(al.logs)-limit:])
	return result
}

func (al *AuditLogger) Close() error {
	al.mu.Lock()
	defer al.mu.Unlock()
	return al.logFile.Close()
}
