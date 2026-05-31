package api

import (
	"encoding/json"
	"net/http"
	"rtsp-hls-server/internal/cache"
	"rtsp-hls-server/internal/index"
	"rtsp-hls-server/internal/monitor"
	"strconv"
	"time"
)

type SegmentResponse struct {
	FilePath    string `json:"file_path"`
	SequenceNum int    `json:"sequence_num"`
	Timestamp   string `json:"timestamp"`
	Status      string `json:"status"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type HealthResponse struct {
	Status              string                 `json:"status"`
	Monitor             map[string]interface{}  `json:"monitor"`
	RecentAlerts        []map[string]interface{} `json:"recent_alerts"`
}

type Handlers struct {
	cache *cache.MemoryCache
	idx   *index.BinaryIndex
	alert *monitor.AlertManager
}

func NewHandlers(c *cache.MemoryCache, idx *index.BinaryIndex, am *monitor.AlertManager) *Handlers {
	return &Handlers{cache: c, idx: idx, alert: am}
}

func (h *Handlers) GetSegment(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	timeParam := r.URL.Query().Get("time")
	if timeParam == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Missing 'time' parameter"})
		return
	}

	targetTime, err := time.Parse(time.RFC3339, timeParam)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Invalid time format. Expected RFC3339: 2025-01-01T12:00:00Z"})
		return
	}

	entry := h.cache.FindByTimestamp(targetTime)

	if entry == nil {
		entry, err = h.idx.FindByTimestamp(targetTime)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Error: err.Error()})
			return
		}
	}

	if entry == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "No segment found for the specified time"})
		return
	}

	status := "normal"
	if entry.Status == index.SegmentStatusCorrupt {
		status = "corrupt"
	}

	response := SegmentResponse{
		FilePath:    entry.FilePath,
		SequenceNum: int(entry.SequenceNum),
		Timestamp:   time.Unix(0, entry.Timestamp).Format(time.RFC3339),
		Status:      status,
	}

	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := HealthResponse{
		Status: "ok",
	}

	if h.alert != nil {
		response.Monitor = h.alert.GetStatus()

		recentAlerts := h.alert.GetRecentAlerts(10)
		response.RecentAlerts = make([]map[string]interface{}, 0, len(recentAlerts))
		for _, a := range recentAlerts {
			response.RecentAlerts = append(response.RecentAlerts, monitor.ConvertAlertForResponse(a))
		}
	} else {
		response.Monitor = map[string]interface{}{"last_segment_time": time.Now().Format(time.RFC3339)}
		response.RecentAlerts = []map[string]interface{}{}
	}

	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) GetAlerts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.alert == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Alert manager not available"})
		return
	}

	sinceParam := r.URL.Query().Get("since")
	limitParam := r.URL.Query().Get("limit")

	var alerts []monitor.AlertRecord

	if sinceParam != "" {
		sinceTime, err := time.Parse(time.RFC3339, sinceParam)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ErrorResponse{Error: "Invalid 'since' format. Expected RFC3339"})
			return
		}
		alerts = h.alert.GetAlerts(sinceTime)
	} else {
		limit := 20
		if limitParam != "" {
			if l, err := strconv.Atoi(limitParam); err == nil && l > 0 {
				limit = l
			}
		}
		alerts = h.alert.GetRecentAlerts(limit)
	}

	response := make([]map[string]interface{}, 0, len(alerts))
	for _, a := range alerts {
		response = append(response, monitor.ConvertAlertForResponse(a))
	}

	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) GetCorruptSegments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	sinceParam := r.URL.Query().Get("since")
	var since time.Time

	if sinceParam != "" {
		var err error
		since, err = time.Parse(time.RFC3339, sinceParam)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ErrorResponse{Error: "Invalid 'since' format. Expected RFC3339"})
			return
		}
	} else {
		since = time.Now().Add(-24 * time.Hour)
	}

	corrupt, err := h.idx.GetCorruptSegments(since)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Error: err.Error()})
		return
	}

	response := make([]map[string]interface{}, 0, len(corrupt))
	for _, e := range corrupt {
		response = append(response, monitor.ConvertIndexEntryForResponse(e))
	}

	json.NewEncoder(w).Encode(response)
}
