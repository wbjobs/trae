package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"ssh-bastion-audit/internal/database"
	"ssh-bastion-audit/internal/recording"
)

type PlaybackFrame struct {
	OffsetMs int64  `json:"offset_ms"`
	DelayMs  int64  `json:"delay_ms"`
	Type     string `json:"type"`
	Data     string `json:"data"`
}

type PlaybackResponse struct {
	SessionID  uuid.UUID         `json:"session_id"`
	StartTime  time.Time         `json:"start_time"`
	EndTime    *time.Time        `json:"end_time,omitempty"`
	DurationMs int64             `json:"duration_ms"`
	PTYCols    int               `json:"pty_cols,omitempty"`
	PTYRows    int               `json:"pty_rows,omitempty"`
	TotalFrames int              `json:"total_frames"`
	Frames     []*PlaybackFrame  `json:"frames"`
}

type PlaybackEvent struct {
	Timestamp time.Time       `json:"timestamp"`
	OffsetMs  int64           `json:"offset_ms"`
	Type      string          `json:"type"`
	Data      json.RawMessage `json:"data"`
}

func (s *APIServer) PlaybackSession(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	speed := 1.0
	if speedStr := c.Query("speed"); speedStr != "" {
		if s, err := strconv.ParseFloat(speedStr, 64); err == nil && s > 0 {
			speed = s
		}
	}

	startOffset := int64(0)
	if offsetStr := c.Query("start_offset"); offsetStr != "" {
		if o, err := strconv.ParseInt(offsetStr, 10, 64); err == nil && o >= 0 {
			startOffset = o
		}
	}

	endOffset := int64(0)
	if offsetStr := c.Query("end_offset"); offsetStr != "" {
		if o, err := strconv.ParseInt(offsetStr, 10, 64); err == nil && o > 0 {
			endOffset = o
		}
	}

	session, err := s.sessionRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	frames, err := s.ttyFrameRepo.GetBySessionID(c.Request.Context(), id, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get frames: " + err.Error()})
		return
	}

	playbackFrames := make([]*PlaybackFrame, 0, len(frames))
	var lastOffset int64 = 0

	for _, frame := range frames {
		if startOffset > 0 && frame.OffsetMs < startOffset {
			continue
		}
		if endOffset > 0 && frame.OffsetMs > endOffset {
			break
		}

		pf := &PlaybackFrame{
			OffsetMs: frame.OffsetMs,
			DelayMs:  int64(float64(frame.OffsetMs-lastOffset) / speed),
			Type:     frame.FrameType,
			Data:     string(frame.Data),
		}
		playbackFrames = append(playbackFrames, pf)
		lastOffset = frame.OffsetMs
	}

	var durationMs int64
	if session.EndedAt != nil {
		durationMs = session.EndedAt.Sub(session.StartedAt).Milliseconds()
	} else if len(frames) > 0 {
		durationMs = frames[len(frames)-1].OffsetMs
	}

	var metadata *recording.SessionMetadata
	if s.recorder != nil {
		metadata, _ = s.recorder.GetSessionMetadata(id)
	}

	response := &PlaybackResponse{
		SessionID:   session.ID,
		StartTime:   session.StartedAt,
		EndTime:     session.EndedAt,
		DurationMs:  durationMs,
		TotalFrames: len(playbackFrames),
		Frames:      playbackFrames,
	}

	if metadata != nil {
		response.PTYCols = metadata.PTYCols
		response.PTYRows = metadata.PTYRows
	}

	c.Header("Content-Type", "application/json")
	c.JSON(http.StatusOK, response)
}

func (s *APIServer) StreamPlayback(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	session, err := s.sessionRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	frames, err := s.ttyFrameRepo.GetBySessionID(c.Request.Context(), id, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get frames"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	sessionInfo := map[string]interface{}{
		"session_id":  session.ID,
		"start_time":  session.StartedAt,
		"end_time":    session.EndedAt,
		"total_frames": len(frames),
	}
	infoData, _ := json.Marshal(sessionInfo)
	c.Writer.Write([]byte("event: session\ndata: " + string(infoData) + "\n\n"))
	flusher.Flush()

	var lastTime time.Time
	for i, frame := range frames {
		if !lastTime.IsZero() {
			delay := frame.Time.Sub(lastTime)
			if delay > 0 {
				time.Sleep(delay)
			}
		}
		lastTime = frame.Time

		event := PlaybackEvent{
			Timestamp: frame.Time,
			OffsetMs:  frame.OffsetMs,
			Type:      frame.FrameType,
			Data:      json.RawMessage(`"` + string(frame.Data) + `"`),
		}

		eventData, _ := json.Marshal(event)
		c.Writer.Write([]byte("event: frame\ndata: " + string(eventData) + "\n\n"))
		flusher.Flush()

		if c.Request.Context().Err() != nil {
			break
		}
	}

	c.Writer.Write([]byte("event: end\ndata: {}\n\n"))
	flusher.Flush()
}

type TimelineMarker struct {
	OffsetMs   int64       `json:"offset_ms"`
	Timestamp  time.Time   `json:"timestamp"`
	Type       string      `json:"type"`
	Data       interface{} `json:"data,omitempty"`
}

func (s *APIServer) GetSessionTimeline(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	session, err := s.sessionRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	frames, err := s.ttyFrameRepo.GetBySessionID(c.Request.Context(), id, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get frames"})
		return
	}

	alerts, err := s.alertRepo.GetBySessionID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get alerts"})
		return
	}

	markers := make([]*TimelineMarker, 0)

	for _, alert := range alerts {
		markers = append(markers, &TimelineMarker{
			OffsetMs:  alert.CreatedAt.Sub(session.StartedAt).Milliseconds(),
			Timestamp: alert.CreatedAt,
			Type:      "alert",
			Data: map[string]interface{}{
				"severity":        alert.Severity,
				"rule_name":       alert.RuleName,
				"matched_content": alert.MatchedContent,
			},
		})
	}

	for i, frame := range frames {
		if i%100 == 0 || frame.FrameType == "input" {
			preview := frame.Data
			if len(preview) > 100 {
				preview = preview[:100]
			}
			markers = append(markers, &TimelineMarker{
				OffsetMs:  frame.OffsetMs,
				Timestamp: frame.Time,
				Type:      frame.FrameType,
				Data:      preview,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id":     session.ID,
		"duration_ms":    getDurationMs(session),
		"total_frames":   len(frames),
		"total_alerts":   len(alerts),
		"markers":        markers,
	})
}

func getDurationMs(session *database.Session) int64 {
	if session.EndedAt != nil {
		return session.EndedAt.Sub(session.StartedAt).Milliseconds()
	}
	return 0
}
