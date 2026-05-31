package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"ssh-bastion-audit/internal/alerting"
	"ssh-bastion-audit/internal/config"
	"ssh-bastion-audit/internal/database"
	"ssh-bastion-audit/internal/ha"
	"ssh-bastion-audit/internal/recording"
	"ssh-bastion-audit/internal/sshproxy"
)

type APIServer struct {
	cfg            *config.ServerConfig
	router         *gin.Engine
	server         *http.Server
	sessionRepo    *database.SessionRepository
	alertRepo      *database.AlertRepository
	ruleRepo       *database.AlertRuleRepository
	ttyFrameRepo   *database.TTYFrameRepository
	screenshotRepo *database.ScreenshotRepository
	recorder       *recording.SessionRecorder
	sshServer      *sshproxy.SSHServer
	alerter        *alerting.Alerter
	haManager      *ha.HAManager
}

func NewAPIServer(
	cfg *config.ServerConfig,
	sessionRepo *database.SessionRepository,
	alertRepo *database.AlertRepository,
	ruleRepo *database.AlertRuleRepository,
	ttyFrameRepo *database.TTYFrameRepository,
	screenshotRepo *database.ScreenshotRepository,
	recorder *recording.SessionRecorder,
	sshServer *sshproxy.SSHServer,
	alerter *alerting.Alerter,
	haManager *ha.HAManager,
) *APIServer {
	r := gin.Default()

	s := &APIServer{
		cfg:            cfg,
		router:         r,
		sessionRepo:    sessionRepo,
		alertRepo:      alertRepo,
		ruleRepo:       ruleRepo,
		ttyFrameRepo:   ttyFrameRepo,
		screenshotRepo: screenshotRepo,
		recorder:       recorder,
		sshServer:      sshServer,
		alerter:        alerter,
		haManager:      haManager,
	}

	s.setupRoutes()
	return s
}

func (s *APIServer) setupRoutes() {
	api := s.router.Group("/api/v1")

	api.GET("/health", s.HealthCheck)

	sessions := api.Group("/sessions")
	{
		sessions.GET("", s.ListSessions)
		sessions.GET("/active", s.ListActiveSessions)
		sessions.GET("/:id", s.GetSession)
		sessions.POST("/:id/terminate", s.TerminateSession)
		sessions.GET("/:id/frames", s.GetSessionFrames)
		sessions.GET("/:id/playback", s.PlaybackSession)
		sessions.GET("/:id/playback/stream", s.StreamPlayback)
		sessions.GET("/:id/timeline", s.GetSessionTimeline)
		sessions.GET("/:id/screenshots", s.GetSessionScreenshots)
		sessions.GET("/:id/alerts", s.GetSessionAlerts)
	}

	alerts := api.Group("/alerts")
	{
		alerts.GET("", s.ListAlerts)
		alerts.GET("/:id", s.GetAlert)
		alerts.POST("/:id/resolve", s.ResolveAlert)
	}

	rules := api.Group("/rules")
	{
		rules.GET("", s.ListRules)
		rules.POST("", s.CreateRule)
		rules.PUT("/:id", s.UpdateRule)
		rules.DELETE("/:id", s.DeleteRule)
	}

	ha := api.Group("/ha")
	{
		ha.GET("/status", s.GetHAStatus)
		ha.GET("/nodes", s.ListHANodes)
	}
}

func (s *APIServer) Start(ctx context.Context) error {
	s.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.cfg.HTTPPort),
		Handler: s.router,
	}

	errChan := make(chan error, 1)
	go func() {
		logrus.Infof("API server listening on port %d", s.cfg.HTTPPort)
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return s.server.Shutdown(shutdownCtx)
	case err := <-errChan:
		return err
	}
}

func (s *APIServer) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now().UTC(),
	})
}

func (s *APIServer) GetHAStatus(c *gin.Context) {
	if s.haManager == nil || !s.haManager.IsEnabled() {
		c.JSON(http.StatusOK, gin.H{
			"enabled": false,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":   true,
		"node_id":   s.haManager.GetNodeID(),
		"role":      s.haManager.GetRole(),
		"is_leader": s.haManager.IsLeader(),
		"leader_id": s.haManager.GetLeaderID(),
	})
}

func (s *APIServer) ListHANodes(c *gin.Context) {
	if s.haManager == nil || !s.haManager.IsEnabled() {
		c.JSON(http.StatusOK, gin.H{
			"enabled": false,
			"nodes":   []interface{}{},
		})
		return
	}

	nodes, err := s.haManager.GetActiveNodes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled": true,
		"nodes":   nodes,
	})
}

type PaginationParams struct {
	Limit  int `form:"limit,default=20"`
	Offset int `form:"offset,default=0"`
}

type ListResponse struct {
	Total int64       `json:"total"`
	Items interface{} `json:"items"`
}
