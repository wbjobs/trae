package api

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"thanos-downsampler/pkg/config"
	"thanos-downsampler/pkg/metrics"
)

type Server struct {
	engine *gin.Engine
	config *config.Config
	handler *Handler
}

func NewServer(cfg *config.Config, metricsService *metrics.Service) *Server {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(gin.Logger())

	handler := NewHandler(metricsService, cfg)

	server := &Server{
		engine: engine,
		config: cfg,
		handler: handler,
	}

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	s.engine.GET("/", s.handler.Health)
	s.engine.GET("/health", s.handler.Health)

	grafana := s.engine.Group("/grafana")
	{
		grafana.POST("/search", s.handler.Search)
		grafana.POST("/query", s.handler.Query)
		grafana.POST("/annotations", s.handler.Annotations)
		grafana.GET("/tag-keys", s.handler.TagKeys)
		grafana.POST("/tag-values", s.handler.TagValues)
	}

	api := s.engine.Group("/api/v1")
	{
		api.GET("/query", s.handleQuery)
		api.GET("/query_range", s.handleQueryRange)
		api.GET("/labels", s.handleLabels)
		api.GET("/label/:name/values", s.handleLabelValues)
	}

	s.engine.GET("/status", s.handleStatus)
}

func (s *Server) handleQuery(c *gin.Context) {
	query := c.Query("query")
	timeStr := c.Query("time")

	ts := time.Now()
	if timeStr != "" {
		if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
			ts = t
		}
	}

	result, err := s.handler.metricsService.Query(c.Request.Context(), query, ts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status": "error",
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data": gin.H{
			"resultType": "vector",
			"result":     result,
		},
	})
}

func (s *Server) handleQueryRange(c *gin.Context) {
	query := c.Query("query")
	startStr := c.Query("start")
	endStr := c.Query("end")
	stepStr := c.Query("step")
	granularity := c.Query("granularity")
	forceRaw := c.Query("force_raw") == "true"

	start, err := time.Parse(time.RFC3339, startStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start time"})
		return
	}

	end, err := time.Parse(time.RFC3339, endStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end time"})
		return
	}

	step, err := time.ParseDuration(stepStr)
	if err != nil {
		step = time.Minute
	}

	opts := metrics.QueryOptions{
		Query:       query,
		Start:       start,
		End:         end,
		Step:        step,
		Granularity: granularity,
		ForceRaw:    forceRaw,
	}

	result, err := s.handler.metricsService.QueryRange(c.Request.Context(), opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status": "error",
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data": gin.H{
			"resultType": "matrix",
			"result":     result.Data,
		},
		"downsampled": result.Downsampled,
		"granularity": result.Granularity,
		"from_cache":  result.FromCache,
	})
}

func (s *Server) handleLabels(c *gin.Context) {
	start := time.Now().Add(-24 * time.Hour)
	end := time.Now()

	labels, err := s.handler.metricsService.LabelNames(c.Request.Context(), start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status": "error",
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   labels,
	})
}

func (s *Server) handleLabelValues(c *gin.Context) {
	name := c.Param("name")
	start := time.Now().Add(-24 * time.Hour)
	end := time.Now()

	values, err := s.handler.metricsService.LabelValues(c.Request.Context(), name, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status": "error",
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   values,
	})
}

func (s *Server) handleStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"version": "1.0.0",
		"config": gin.H{
			"auto_threshold_days": s.config.Downsampling.AutoThresholdDays,
			"granularities":       s.config.Downsampling.Granularities,
			"default_granularity": s.config.Downsampling.DefaultGranularity,
			"cache_enabled":       s.config.Cache.Enabled,
			"thanos_endpoints":    s.config.Thanos.Endpoints,
		},
	})
}

func (s *Server) Run() error {
	addr := s.config.GetServerAddr()
	srv := &http.Server{
		Addr:    addr,
		Handler: s.engine,
	}

	go func() {
		log.Printf("Server starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
	return nil
}
