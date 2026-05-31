package database

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	SrcIP           string     `json:"src_ip"`
	DstHost         string     `json:"dst_host"`
	DstPort         int        `json:"dst_port"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
	Status          string     `json:"status"`
	TTYLogPath      string     `json:"tty_log_path,omitempty"`
	ScreenshotPaths []string   `json:"screenshot_paths,omitempty"`
	CommandCount    int        `json:"command_count"`
	AlertCount      int        `json:"alert_count"`
	BytesWritten    int64      `json:"bytes_written"`
	BytesRead       int64      `json:"bytes_read"`
}

type SessionEvent struct {
	Time      time.Time              `json:"time"`
	SessionID uuid.UUID              `json:"session_id"`
	EventType string                 `json:"event_type"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

type TTYFrame struct {
	Time      time.Time `json:"time"`
	SessionID uuid.UUID `json:"session_id"`
	OffsetMs  int64     `json:"offset_ms"`
	FrameType string    `json:"frame_type"`
	Data      []byte    `json:"data"`
}

type Alert struct {
	ID             uuid.UUID  `json:"id"`
	SessionID      uuid.UUID  `json:"session_id"`
	RuleName       string     `json:"rule_name"`
	Severity       string     `json:"severity"`
	MatchedContent string     `json:"matched_content"`
	Command        string     `json:"command,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	Resolved       bool       `json:"resolved"`
	ResolvedAt     *time.Time `json:"resolved_at,omitempty"`
	ResolvedBy     string     `json:"resolved_by,omitempty"`
	Notes          string     `json:"notes,omitempty"`
}

type AlertRule struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Pattern     string    `json:"pattern"`
	Severity    string    `json:"severity"`
	Enabled     bool      `json:"enabled"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Screenshot struct {
	ID           uuid.UUID `json:"id"`
	SessionID    uuid.UUID `json:"session_id"`
	OffsetMs     int64     `json:"offset_ms"`
	CreatedAt    time.Time `json:"created_at"`
	StoragePath  string    `json:"storage_path"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
}
