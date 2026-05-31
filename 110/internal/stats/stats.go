package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

type Stats struct {
	totalRequests   atomic.Int64
	filteredCount   atomic.Int64
	mirroredCount   atomic.Int64
	successCount    atomic.Int64
	failCount       atomic.Int64
	replaySent      atomic.Int64
	replayMatched   atomic.Int64
	replayMismatch  atomic.Int64
	replayPending   atomic.Int64
	qps             float64
	lastQPSCount    int64
	lastQPSCheck    time.Time
	mu              sync.RWMutex
	startTime       time.Time
}

func New() *Stats {
	return &Stats{
		startTime:    time.Now(),
		lastQPSCheck: time.Now(),
	}
}

func (s *Stats) IncrRequest() {
	s.totalRequests.Add(1)
}

func (s *Stats) IncrFiltered() {
	s.filteredCount.Add(1)
}

func (s *Stats) IncrMirrored() {
	s.mirroredCount.Add(1)
}

func (s *Stats) IncrSuccess() {
	s.successCount.Add(1)
}

func (s *Stats) IncrFail() {
	s.failCount.Add(1)
}

func (s *Stats) IncrReplaySent() {
	s.replaySent.Add(1)
	s.replayPending.Add(1)
}

func (s *Stats) IncrReplayMatch() {
	s.replayMatched.Add(1)
	s.replayPending.Add(-1)
}

func (s *Stats) IncrReplayMismatch() {
	s.replayMismatch.Add(1)
	s.replayPending.Add(-1)
}

func (s *Stats) updateQPS() {
	now := time.Now()
	elapsed := now.Sub(s.lastQPSCheck).Seconds()
	if elapsed >= 1.0 {
		currentCount := s.mirroredCount.Load()
		count := currentCount - s.lastQPSCount
		s.mu.Lock()
		s.qps = float64(count) / elapsed
		s.lastQPSCount = currentCount
		s.lastQPSCheck = now
		s.mu.Unlock()
	}
}

type StatsReport struct {
	TotalRequests   int64   `json:"total_requests"`
	FilteredCount   int64   `json:"filtered_count"`
	MirroredCount   int64   `json:"mirrored_count"`
	SuccessCount    int64   `json:"success_count"`
	FailCount       int64   `json:"fail_count"`
	SuccessRate     float64 `json:"success_rate"`
	QPS             float64 `json:"qps"`
	Uptime          string  `json:"uptime"`
	ReplaySent      int64   `json:"replay_sent"`
	ReplayMatched   int64   `json:"replay_matched"`
	ReplayMismatch  int64   `json:"replay_mismatch"`
	ReplayPending   int64   `json:"replay_pending"`
	ReplayMatchRate float64 `json:"replay_match_rate"`
}

func (s *Stats) Report() *StatsReport {
	s.updateQPS()

	total := s.mirroredCount.Load()
	success := s.successCount.Load()
	fail := s.failCount.Load()
	replaySent := s.replaySent.Load()
	replayMatched := s.replayMatched.Load()
	replayMismatch := s.replayMismatch.Load()
	replayPending := s.replayPending.Load()

	var successRate float64
	if total > 0 {
		successRate = float64(success) / float64(total) * 100
	}

	var replayMatchRate float64
	if replayMatched+replayMismatch > 0 {
		replayMatchRate = float64(replayMatched) / float64(replayMatched+replayMismatch) * 100
	}

	s.mu.RLock()
	qps := s.qps
	s.mu.RUnlock()

	return &StatsReport{
		TotalRequests:   s.totalRequests.Load(),
		FilteredCount:   s.filteredCount.Load(),
		MirroredCount:   total,
		SuccessCount:    success,
		FailCount:       fail,
		SuccessRate:     successRate,
		QPS:             qps,
		Uptime:          time.Since(s.startTime).String(),
		ReplaySent:      replaySent,
		ReplayMatched:   replayMatched,
		ReplayMismatch:  replayMismatch,
		ReplayPending:   replayPending,
		ReplayMatchRate: replayMatchRate,
	}
}

func (s *Stats) PrintStats() {
	report := s.Report()
	fmt.Printf("\n===== HTTP Mirror Stats =====\n")
	fmt.Printf("Total Requests:  %d\n", report.TotalRequests)
	fmt.Printf("Filtered:        %d\n", report.FilteredCount)
	fmt.Printf("Mirrored:        %d\n", report.MirroredCount)
	fmt.Printf("Success:         %d\n", report.SuccessCount)
	fmt.Printf("Failed:          %d\n", report.FailCount)
	fmt.Printf("Success Rate:    %.2f%%\n", report.SuccessRate)
	fmt.Printf("QPS:             %.2f\n", report.QPS)
	fmt.Printf("--- Replay Stats ---\n")
	fmt.Printf("Replay Sent:     %d\n", report.ReplaySent)
	fmt.Printf("Replay Matched:  %d\n", report.ReplayMatched)
	fmt.Printf("Replay Mismatch: %d\n", report.ReplayMismatch)
	fmt.Printf("Replay Pending:  %d\n", report.ReplayPending)
	fmt.Printf("Replay Match Rate: %.2f%%\n", report.ReplayMatchRate)
	fmt.Printf("Uptime:          %s\n", report.Uptime)
	fmt.Printf("==============================\n\n")
}

func (s *Stats) HTTPHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		report := s.Report()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(report)
	}
}
