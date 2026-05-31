package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"config-sync/internal/store"
	"config-sync/internal/webhook"
)

type SyncManager interface {
	GetConflicts() []store.ConflictEntry
	ResolveConflict(key string, chooseLocal bool, updatedBy string) (uint64, error)
	SetMergeStrategy(strategy store.MergeStrategy)
	GetLocalCache() map[string]*store.ConfigEntry
	UpdateConfig(key string, value []byte, updatedBy string) (uint64, error)
}

type Server struct {
	store    *store.NATSStore
	webhook  *webhook.WebhookNotifier
	syncMgr  SyncManager
	service  string
	router   *gin.Engine
	server   *http.Server
}

type UpdateConfigRequest struct {
	Value     json.RawMessage   `json:"value" binding:"required"`
	UpdatedBy string            `json:"updated_by"`
	Meta      map[string]string `json:"meta,omitempty"`
	Sensitive bool              `json:"sensitive,omitempty"`
}

type UpdateConfigResponse struct {
	Key     string `json:"key"`
	Version uint64 `json:"version"`
	Status  string `json:"status"`
}

type RollbackRequest struct {
	Version   uint64 `json:"version" binding:"required"`
	UpdatedBy string `json:"updated_by"`
}

type ResolveConflictRequest struct {
	ChooseLocal bool   `json:"choose_local" binding:"required"`
	UpdatedBy   string `json:"updated_by"`
}

type SetStrategyRequest struct {
	Strategy store.MergeStrategy `json:"strategy" binding:"required"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

func NewServer(s *store.NATSStore, w *webhook.WebhookNotifier, syncMgr SyncManager, serviceName string) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	srv := &Server{
		store:   s,
		webhook: w,
		syncMgr: syncMgr,
		service: serviceName,
		router:  router,
	}

	srv.registerRoutes()
	return srv
}

func (s *Server) registerRoutes() {
	api := s.router.Group("/api/v1")
	{
		api.GET("/health", s.handleHealth)
		api.GET("/config", s.handleListConfigs)
		api.GET("/config/:key", s.handleGetConfig)
		api.PUT("/config/:key", s.handleUpdateConfig)
		api.DELETE("/config/:key", s.handleDeleteConfig)
		api.GET("/config/:key/history", s.handleGetHistory)
		api.POST("/config/:key/rollback", s.handleRollback)

		api.GET("/conflicts", s.handleGetConflicts)
		api.POST("/conflicts/:key/resolve", s.handleResolveConflict)

		api.POST("/strategy", s.handleSetStrategy)
		api.GET("/cache", s.handleGetLocalCache)
	}
}

func (s *Server) Run(port int) error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	return s.server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *Server) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": s.service,
		"time":    time.Now().UTC(),
	})
}

func (s *Server) handleListConfigs(c *gin.Context) {
	entries, err := s.store.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "failed_to_list_configs",
			Message: err.Error(),
		})
		return
	}

	if entries == nil {
		entries = []store.ConfigEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"count": len(entries),
		"items": entries,
	})
}

func (s *Server) handleGetConfig(c *gin.Context) {
	key := c.Param("key")

	entry, err := s.store.Get(key)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error:   "config_not_found",
			Message: fmt.Sprintf("config key '%s' not found", key),
		})
		return
	}

	c.JSON(http.StatusOK, entry)
}

func (s *Server) handleUpdateConfig(c *gin.Context) {
	key := c.Param("key")

	var req UpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	updatedBy := req.UpdatedBy
	if updatedBy == "" {
		updatedBy = s.service
	}

	var version uint64
	var err error

	if s.syncMgr != nil {
		if req.Sensitive {
			version, err = s.store.PutSensitive(key, req.Value, updatedBy)
		} else {
			version, err = s.syncMgr.UpdateConfig(key, req.Value, updatedBy)
		}
	} else {
		if req.Sensitive {
			version, err = s.store.PutSensitive(key, req.Value, updatedBy)
		} else {
			version, err = s.store.Put(key, req.Value, updatedBy)
		}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "update_failed",
			Message: err.Error(),
		})
		return
	}

	if s.webhook != nil {
		entry, _ := s.store.Get(key)
		go s.webhook.Notify(context.Background(), "config.updated", key, entry)
	}

	c.JSON(http.StatusOK, UpdateConfigResponse{
		Key:     key,
		Version: version,
		Status:  "updated",
	})
}

func (s *Server) handleDeleteConfig(c *gin.Context) {
	key := c.Param("key")

	if err := s.store.Delete(key); err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "delete_failed",
			Message: err.Error(),
		})
		return
	}

	if s.webhook != nil {
		go s.webhook.Notify(context.Background(), "config.deleted", key, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"key":    key,
		"status": "deleted",
	})
}

func (s *Server) handleGetHistory(c *gin.Context) {
	key := c.Param("key")

	history, err := s.store.History(key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "history_query_failed",
			Message: err.Error(),
		})
		return
	}

	if history == nil {
		history = []store.HistoryEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"key":   key,
		"count": len(history),
		"items": history,
	})
}

func (s *Server) handleRollback(c *gin.Context) {
	key := c.Param("key")

	var req RollbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	updatedBy := req.UpdatedBy
	if updatedBy == "" {
		updatedBy = s.service + "-rollback"
	}

	version, err := s.store.Rollback(key, req.Version, updatedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "rollback_failed",
			Message: err.Error(),
		})
		return
	}

	if s.webhook != nil {
		entry, _ := s.store.Get(key)
		go s.webhook.Notify(context.Background(), "config.rolled_back", key, entry)
	}

	c.JSON(http.StatusOK, gin.H{
		"key":          key,
		"rolled_back_to": req.Version,
		"new_version":  version,
		"status":       "rolled_back",
	})
}

func (s *Server) handleGetConflicts(c *gin.Context) {
	if s.syncMgr == nil {
		c.JSON(http.StatusOK, gin.H{
			"count": 0,
			"items": []store.ConflictEntry{},
		})
		return
	}

	conflicts := s.syncMgr.GetConflicts()
	if conflicts == nil {
		conflicts = []store.ConflictEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"count": len(conflicts),
		"items": conflicts,
	})
}

func (s *Server) handleResolveConflict(c *gin.Context) {
	if s.syncMgr == nil {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{
			Error:   "sync_manager_unavailable",
			Message: "Sync manager is not initialized",
		})
		return
	}

	key := c.Param("key")

	var req ResolveConflictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	updatedBy := req.UpdatedBy
	if updatedBy == "" {
		updatedBy = s.service + "-conflict-resolution"
	}

	version, err := s.syncMgr.ResolveConflict(key, req.ChooseLocal, updatedBy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "resolution_failed",
			Message: err.Error(),
		})
		return
	}

	if s.webhook != nil {
		entry, _ := s.store.Get(key)
		go s.webhook.Notify(context.Background(), "config.conflict_resolved", key, entry)
	}

	c.JSON(http.StatusOK, gin.H{
		"key":        key,
		"chose_local": req.ChooseLocal,
		"version":    version,
		"status":     "resolved",
	})
}

func (s *Server) handleSetStrategy(c *gin.Context) {
	if s.syncMgr == nil {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{
			Error:   "sync_manager_unavailable",
			Message: "Sync manager is not initialized",
		})
		return
	}

	var req SetStrategyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	validStrategies := map[store.MergeStrategy]bool{
		store.MergeStrategyLastWriteWins: true,
		store.MergeStrategyRemoteWins:    true,
		store.MergeStrategyLocalWins:     true,
		store.MergeStrategyManual:        true,
	}

	if !validStrategies[req.Strategy] {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_strategy",
			Message: fmt.Sprintf("Invalid strategy '%s'. Valid: last_write_wins, remote_wins, local_wins, manual", req.Strategy),
		})
		return
	}

	s.syncMgr.SetMergeStrategy(req.Strategy)

	c.JSON(http.StatusOK, gin.H{
		"strategy": req.Strategy,
		"status":   "updated",
	})
}

func (s *Server) handleGetLocalCache(c *gin.Context) {
	if s.syncMgr == nil {
		c.JSON(http.StatusOK, gin.H{
			"count": 0,
			"items": map[string]*store.ConfigEntry{},
		})
		return
	}

	cache := s.syncMgr.GetLocalCache()
	c.JSON(http.StatusOK, gin.H{
		"count": len(cache),
		"items": cache,
	})
}

func ParsePort(portStr string) int {
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return 8080
	}
	return port
}
