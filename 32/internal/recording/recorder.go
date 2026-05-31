package recording

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"ssh-bastion-audit/internal/bufferpool"
	"ssh-bastion-audit/internal/config"
	"ssh-bastion-audit/internal/storage"
)

type TTYFrame struct {
	Time     time.Time `json:"time"`
	OffsetMs int64     `json:"offset_ms"`
	Type     string    `json:"type"`
	Data     string    `json:"data"`
}

type SessionMetadata struct {
	SessionID  uuid.UUID         `json:"session_id"`
	Username   string            `json:"username"`
	SrcIP      string            `json:"src_ip"`
	DstHost    string            `json:"dst_host"`
	DstPort    int               `json:"dst_port"`
	StartTime  time.Time         `json:"start_time"`
	EndTime    *time.Time        `json:"end_time,omitempty"`
	PTYCols    int               `json:"pty_cols"`
	PTYRows    int               `json:"pty_rows"`
	FrameCount int               `json:"frame_count"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type activeRecording struct {
	id          uuid.UUID
	metadata    *SessionMetadata
	framesFile  *os.File
	framesWriter *bufio.Writer
	startTime   time.Time
	mu          sync.Mutex
}

type SessionRecorder struct {
	cfg               *config.RecordingConfig
	storage           storage.Storage
	active            map[uuid.UUID]*activeRecording
	activeMu          sync.RWMutex
	screenshotTicker  *time.Ticker
	ctx               context.Context
	cancel            context.CancelFunc
	frameEncoderPool  sync.Pool
}

func NewSessionRecorder(cfg *config.RecordingConfig, storage storage.Storage) (*SessionRecorder, error) {
	if err := os.MkdirAll(cfg.TTYLogDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create tty log dir: %w", err)
	}
	if err := os.MkdirAll(cfg.ScreenshotDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create screenshot dir: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &SessionRecorder{
		cfg:              cfg,
		storage:          storage,
		active:           make(map[uuid.UUID]*activeRecording),
		screenshotTicker: time.NewTicker(time.Duration(cfg.ScreenshotInterval) * time.Second),
		ctx:              ctx,
		cancel:           cancel,
	}, nil
}

func (r *SessionRecorder) Start() {
	go r.screenshotLoop()
}

func (r *SessionRecorder) Stop() {
	r.cancel()
	r.screenshotTicker.Stop()

	r.activeMu.Lock()
	defer r.activeMu.Unlock()
	for id, rec := range r.active {
		r.finalizeSessionLocked(id, rec)
	}
}

func (r *SessionRecorder) StartSession(sessionID uuid.UUID) {
	rec := &activeRecording{
		id:        sessionID,
		metadata:  &SessionMetadata{SessionID: sessionID, StartTime: time.Now()},
		startTime: time.Now(),
	}

	logPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.json", sessionID))
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		logrus.Errorf("Failed to open session log file: %v", err)
	} else {
		rec.framesFile = f
		rec.framesWriter = bufio.NewWriterSize(f, 64*1024)
	}

	r.activeMu.Lock()
	r.active[sessionID] = rec
	r.activeMu.Unlock()
}

func (r *SessionRecorder) FinalizeSession(sessionID uuid.UUID) {
	r.activeMu.Lock()
	defer r.activeMu.Unlock()

	if rec, exists := r.active[sessionID]; exists {
		r.finalizeSessionLocked(sessionID, rec)
	}
}

func (r *SessionRecorder) finalizeSessionLocked(sessionID uuid.UUID, rec *activeRecording) {
	now := time.Now()
	rec.metadata.EndTime = &now

	if rec.framesWriter != nil {
		if err := rec.framesWriter.Flush(); err != nil {
			logrus.Errorf("Failed to flush frames writer: %v", err)
		}
	}
	if rec.framesFile != nil {
		rec.framesFile.Close()
	}

	metadataJSON, err := json.Marshal(rec.metadata)
	if err != nil {
		logrus.Errorf("Failed to marshal session metadata: %v", err)
	} else {
		metadataPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.meta.json", sessionID))
		if err := os.WriteFile(metadataPath, metadataJSON, 0644); err != nil {
			logrus.Errorf("Failed to write session metadata: %v", err)
		}
	}

	if r.storage != nil {
		logPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.json", sessionID))
		if _, err := os.Stat(logPath); err == nil {
			storageKey := fmt.Sprintf("sessions/%s/tty_log.json", sessionID)
			if err := r.storage.UploadFile(r.ctx, logPath, storageKey); err != nil {
				logrus.Errorf("Failed to upload tty log to storage: %v", err)
			}
		}

		metadataPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.meta.json", sessionID))
		if _, err := os.Stat(metadataPath); err == nil {
			storageKey := fmt.Sprintf("sessions/%s/metadata.json", sessionID)
			if err := r.storage.UploadFile(r.ctx, metadataPath, storageKey); err != nil {
				logrus.Errorf("Failed to upload metadata to storage: %v", err)
			}
		}
	}

	delete(r.active, sessionID)
}

func (r *SessionRecorder) RecordInput(sessionID uuid.UUID, data []byte) {
	r.recordFrame(sessionID, "input", data)
}

func (r *SessionRecorder) RecordOutput(sessionID uuid.UUID, data []byte, offsetMs int64) {
	r.recordFrame(sessionID, "output", data)
}

func (r *SessionRecorder) recordFrame(sessionID uuid.UUID, frameType string, data []byte) {
	if len(data) == 0 {
		return
	}

	r.activeMu.RLock()
	rec, exists := r.active[sessionID]
	r.activeMu.RUnlock()

	if !exists {
		return
	}

	rec.mu.Lock()
	defer rec.mu.Unlock()

	frame := bufferpool.GetRecordingFrame()
	frame.Time = time.Now()
	frame.OffsetMs = time.Since(rec.startTime).Milliseconds()
	frame.Type = frameType
	frame.Data = string(data)

	if rec.framesWriter != nil {
		if err := writeJSONLine(rec.framesWriter, frame); err != nil {
			logrus.Errorf("Failed to write frame: %v", err)
		}
	}

	bufferpool.PutRecordingFrame(frame)

	rec.metadata.FrameCount++
}

func writeJSONLine(w *bufio.Writer, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if _, err := w.Write(data); err != nil {
		return err
	}
	if _, err := w.Write([]byte("\n")); err != nil {
		return err
	}
	return nil
}

func (r *SessionRecorder) RecordPTY(sessionID uuid.UUID, cols, rows int) {
	r.activeMu.RLock()
	rec, exists := r.active[sessionID]
	r.activeMu.RUnlock()

	if exists {
		rec.mu.Lock()
		rec.metadata.PTYCols = cols
		rec.metadata.PTYRows = rows
		rec.mu.Unlock()
	}
}

func (r *SessionRecorder) screenshotLoop() {
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-r.screenshotTicker.C:
			r.takeScreenshots()
		}
	}
}

func (r *SessionRecorder) takeScreenshots() {
	r.activeMu.RLock()
	sessions := make([]uuid.UUID, 0, len(r.active))
	for id := range r.active {
		sessions = append(sessions, id)
	}
	r.activeMu.RUnlock()

	for _, sessionID := range sessions {
		r.takeScreenshot(sessionID)
	}
}

func (r *SessionRecorder) takeScreenshot(sessionID uuid.UUID) {
	r.activeMu.RLock()
	rec, exists := r.active[sessionID]
	r.activeMu.RUnlock()

	if !exists {
		return
	}

	rec.mu.Lock()
	offsetMs := time.Since(rec.startTime).Milliseconds()
	rec.mu.Unlock()

	screenshotData := []byte(fmt.Sprintf("Screenshot placeholder for session %s at offset %dms", sessionID, offsetMs))
	screenshotPath := filepath.Join(r.cfg.ScreenshotDir, fmt.Sprintf("%s_%d.png", sessionID, offsetMs))

	if err := os.WriteFile(screenshotPath, screenshotData, 0644); err != nil {
		logrus.Errorf("Failed to write screenshot: %v", err)
		return
	}

	if r.storage != nil {
		storageKey := fmt.Sprintf("sessions/%s/screenshots/%d.png", sessionID, offsetMs)
		if err := r.storage.UploadFile(r.ctx, screenshotPath, storageKey); err != nil {
			logrus.Errorf("Failed to upload screenshot: %v", err)
		}
	}
}

func (r *SessionRecorder) GetSessionFrames(sessionID uuid.UUID, startTime, endTime *time.Time) ([]*TTYFrame, error) {
	logPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.json", sessionID))

	file, err := os.Open(logPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open session log: %w", err)
	}
	defer file.Close()

	frames := make([]*TTYFrame, 0, 1024)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var frame TTYFrame
		if err := json.Unmarshal(line, &frame); err != nil {
			continue
		}

		if startTime != nil && frame.Time.Before(*startTime) {
			continue
		}
		if endTime != nil && frame.Time.After(*endTime) {
			continue
		}

		frames = append(frames, &frame)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("failed to scan session log: %w", err)
	}

	return frames, nil
}

func (r *SessionRecorder) GetSessionMetadata(sessionID uuid.UUID) (*SessionMetadata, error) {
	metadataPath := filepath.Join(r.cfg.TTYLogDir, fmt.Sprintf("%s.meta.json", sessionID))

	data, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read session metadata: %w", err)
	}

	var metadata SessionMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	return &metadata, nil
}
