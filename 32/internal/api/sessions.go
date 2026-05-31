package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (s *APIServer) ListSessions(c *gin.Context) {
	var params PaginationParams
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if params.Limit > 100 {
		params.Limit = 100
	}

	sessions, total, err := s.sessionRepo.List(c.Request.Context(), params.Limit, params.Offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: total,
		Items: sessions,
	})
}

func (s *APIServer) GetSession(c *gin.Context) {
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

	c.JSON(http.StatusOK, session)
}

func (s *APIServer) ListActiveSessions(c *gin.Context) {
	if s.sshServer == nil {
		c.JSON(http.StatusOK, ListResponse{Total: 0, Items: []interface{}{}})
		return
	}

	activeSessions := s.sshServer.GetActiveSessions()
	type ActiveSessionInfo struct {
		ID        uuid.UUID `json:"id"`
		Username  string    `json:"username"`
		SrcIP     string    `json:"src_ip"`
		DstHost   string    `json:"dst_host"`
		DstPort   int       `json:"dst_port"`
		StartTime time.Time `json:"start_time"`
		Duration  string    `json:"duration"`
	}

	infos := make([]*ActiveSessionInfo, 0, len(activeSessions))
	for _, sess := range activeSessions {
		infos = append(infos, &ActiveSessionInfo{
			ID:        sess.ID,
			Username:  sess.Username,
			SrcIP:     sess.SrcIP,
			DstHost:   sess.DstHost,
			DstPort:   sess.DstPort,
			StartTime: sess.StartTime,
			Duration:  time.Since(sess.StartTime).String(),
		})
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: int64(len(infos)),
		Items: infos,
	})
}

func (s *APIServer) TerminateSession(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	if s.sshServer == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ssh server not available"})
		return
	}

	if !s.sshServer.TerminateSession(id) {
		c.JSON(http.StatusNotFound, gin.H{"error": "active session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "terminated"})
}

func (s *APIServer) GetSessionFrames(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	var startTime, endTime *time.Time
	if startStr := c.Query("start_time"); startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startTime = &t
		}
	}
	if endStr := c.Query("end_time"); endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endTime = &t
		}
	}

	frames, err := s.ttyFrameRepo.GetBySessionID(c.Request.Context(), id, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: int64(len(frames)),
		Items: frames,
	})
}

func (s *APIServer) GetSessionScreenshots(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	screenshots, err := s.screenshotRepo.GetBySessionID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: int64(len(screenshots)),
		Items: screenshots,
	})
}

func (s *APIServer) GetSessionAlerts(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	alerts, err := s.alertRepo.GetBySessionID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: int64(len(alerts)),
		Items: alerts,
	})
}
