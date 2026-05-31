package monitor

import (
	"context"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"rtsp-hls-server/internal/config"
	"rtsp-hls-server/internal/index"
	"sort"
	"strconv"
	"sync"
	"time"
)

type AlertRecord struct {
	StartTime   time.Time
	EndTime     time.Time
	Duration    time.Duration
	InsertedCount int
	FilePath    string
}

type AlertManager struct {
	config            *config.Config
	ffmpegPath        string
	segmentDir        string
	lastSegmentTime   time.Time
	lastSegmentTimeMu sync.RWMutex
	isRunning         bool
	isRunningMu       sync.RWMutex
	alerts            []AlertRecord
	alertsMu          sync.RWMutex
	stopChan          chan struct{}
	segmentCallback   func(time.Time, int, string, bool)
	nextSequence      int
	nextSequenceMu    sync.Mutex
	ctx               context.Context
	cancel            context.CancelFunc
}

func NewAlertManager(cfg *config.Config) *AlertManager {
	ctx, cancel := context.WithCancel(context.Background())
	return &AlertManager{
		config:          cfg,
		ffmpegPath:      cfg.FFmpegPath,
		segmentDir:      cfg.SegmentDir,
		lastSegmentTime: time.Now(),
		isRunning:       false,
		alerts:          make([]AlertRecord, 0),
		stopChan:        make(chan struct{}),
		nextSequence:    0,
		ctx:             ctx,
		cancel:          cancel,
	}
}

func (m *AlertManager) SetSegmentCallback(cb func(timestamp time.Time, seq int, path string, isCorrupt bool)) {
	m.segmentCallback = cb
}

func (m *AlertManager) SetInitialSequence(seq int) {
	m.nextSequenceMu.Lock()
	m.nextSequence = seq
	m.nextSequenceMu.Unlock()
}

func (m *AlertManager) NotifySegmentReceived(timestamp time.Time) {
	m.lastSegmentTimeMu.Lock()
	m.lastSegmentTime = timestamp
	m.lastSegmentTimeMu.Unlock()
}

func (m *AlertManager) Start() {
	m.isRunningMu.Lock()
	if m.isRunning {
		m.isRunningMu.Unlock()
		return
	}
	m.isRunning = true
	m.isRunningMu.Unlock()

	go m.monitorLoop()
}

func (m *AlertManager) Stop() {
	m.isRunningMu.Lock()
	if !m.isRunning {
		m.isRunningMu.Unlock()
		return
	}
	m.isRunning = false
	m.isRunningMu.Unlock()

	m.cancel()
}

func (m *AlertManager) monitorLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			m.checkForGap()
		}
	}
}

func (m *AlertManager) checkForGap() {
	m.lastSegmentTimeMu.RLock()
	lastTime := m.lastSegmentTime
	m.lastSegmentTimeMu.RUnlock()

	now := time.Now()
	gap := now.Sub(lastTime)
	gapThreshold := 2 * time.Second

	if gap <= gapThreshold {
		return
	}

	log.Printf("Detected gap: no segment for %v (threshold: %v)", gap, gapThreshold)

	m.fillGap(lastTime, now)
}

func (m *AlertManager) fillGap(startTime, endTime time.Time) {
	segmentDuration := m.config.SegmentDuration
	numSegments := int(endTime.Sub(startTime) / segmentDuration)
	if numSegments < 1 {
		numSegments = 1
	}

	log.Printf("Inserting %d black frame segments to fill gap", numSegments)

	var insertedPaths []string

	for i := 0; i < numSegments; i++ {
		segmentTime := startTime.Add(time.Duration(i) * segmentDuration)

		m.nextSequenceMu.Lock()
		seq := m.nextSequence
		m.nextSequence++
		m.nextSequenceMu.Unlock()

		fileName := "black_" + strconv.FormatInt(segmentTime.Unix(), 10) + ".ts"
		filePath := filepath.Join(m.segmentDir, fileName)

		if err := m.generateBlackFrame(filePath, segmentDuration); err != nil {
			log.Printf("Failed to generate black frame: %v", err)
			continue
		}

		insertedPaths = append(insertedPaths, filePath)

		if m.segmentCallback != nil {
			m.segmentCallback(segmentTime, seq, filePath, true)
		}

		m.NotifySegmentReceived(segmentTime)
	}

	if len(insertedPaths) > 0 {
		alert := AlertRecord{
			StartTime:     startTime,
			EndTime:       endTime,
			Duration:      endTime.Sub(startTime),
			InsertedCount: len(insertedPaths),
			FilePath:      insertedPaths[0],
		}

		m.alertsMu.Lock()
		m.alerts = append(m.alerts, alert)

		maxAlerts := 100
		if len(m.alerts) > maxAlerts {
			m.alerts = m.alerts[len(m.alerts)-maxAlerts:]
		}
		m.alertsMu.Unlock()

		log.Printf("Alert recorded: %d segments inserted from %v to %v",
			len(insertedPaths), startTime, endTime)
	}
}

func (m *AlertManager) generateBlackFrame(filePath string, duration time.Duration) error {
	args := []string{
		"-f", "lavfi",
		"-i", "color=c=black:s=1920x1080:r=25",
		"-f", "lavfi",
		"-i", "anullsrc=r=44100:cl=mono",
		"-t", strconv.FormatFloat(duration.Seconds(), 'f', 0, 64),
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-preset", "ultrafast",
		"-c:a", "aac",
		"-b:a", "128k",
		"-f", "mpegts",
		filePath,
	}

	cmd := exec.CommandContext(m.ctx, m.ffmpegPath, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

func (m *AlertManager) GetAlerts(since time.Time) []AlertRecord {
	m.alertsMu.RLock()
	defer m.alertsMu.RUnlock()

	cutoff := since.UnixNano()
	var result []AlertRecord

	for i := len(m.alerts) - 1; i >= 0; i-- {
		if m.alerts[i].StartTime.UnixNano() >= cutoff {
			result = append(result, m.alerts[i])
		} else {
			break
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartTime.After(result[j].StartTime)
	})

	return result
}

func (m *AlertManager) GetRecentAlerts(count int) []AlertRecord {
	m.alertsMu.RLock()
	defer m.alertsMu.RUnlock()

	if len(m.alerts) == 0 {
		return []AlertRecord{}
	}

	start := len(m.alerts) - count
	if start < 0 {
		start = 0
	}

	result := make([]AlertRecord, len(m.alerts)-start)
	copy(result, m.alerts[start:])

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartTime.After(result[j].StartTime)
	})

	return result
}

func (m *AlertManager) GetAlertCount(since time.Time) int {
	alerts := m.GetAlerts(since)
	total := 0
	for _, a := range alerts {
		total += a.InsertedCount
	}
	return total
}

func (m *AlertManager) GetLastAlertTime() time.Time {
	m.alertsMu.RLock()
	defer m.alertsMu.RUnlock()

	if len(m.alerts) == 0 {
		return time.Time{}
	}

	return m.alerts[len(m.alerts)-1].EndTime
}

func (m *AlertManager) GetStatus() map[string]interface{} {
	m.lastSegmentTimeMu.RLock()
	lastSeg := m.lastSegmentTime
	m.lastSegmentTimeMu.RUnlock()

	now := time.Now()
	gap := now.Sub(lastSeg)

	return map[string]interface{}{
		"last_segment_time":   lastSeg.Format(time.RFC3339),
		"current_gap_seconds": gap.Seconds(),
		"alert_count_5min":    m.GetAlertCount(now.Add(-5 * time.Minute)),
		"alert_count_1hour":   m.GetAlertCount(now.Add(-1 * time.Hour)),
		"last_alert_time":     m.GetLastAlertTime().Format(time.RFC3339),
	}
}

func ConvertAlertForResponse(a AlertRecord) map[string]interface{} {
	return map[string]interface{}{
		"start_time":     a.StartTime.Format(time.RFC3339),
		"end_time":       a.EndTime.Format(time.RFC3339),
		"duration_sec":   a.Duration.Seconds(),
		"inserted_count": a.InsertedCount,
		"first_file":     a.FilePath,
	}
}

func ConvertIndexEntryForResponse(e index.IndexEntry) map[string]interface{} {
	status := "normal"
	if e.Status == index.SegmentStatusCorrupt {
		status = "corrupt"
	}
	return map[string]interface{}{
		"timestamp":    time.Unix(0, e.Timestamp).Format(time.RFC3339),
		"sequence_num": e.SequenceNum,
		"status":       status,
		"file_path":    e.FilePath,
	}
}
