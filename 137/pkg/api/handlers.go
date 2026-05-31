package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/common/model"

	"thanos-downsampler/pkg/config"
	"thanos-downsampler/pkg/metrics"
)

type Handler struct {
	metricsService *metrics.Service
	config         *config.Config
}

func NewHandler(metricsService *metrics.Service, cfg *config.Config) *Handler {
	return &Handler{
		metricsService: metricsService,
		config:         cfg,
	}
}

type QueryRequest struct {
	Targets []Target `json:"targets"`
	Range   Range   `json:"range"`
	IntervalMs int64 `json:"intervalMs"`
	MaxDataPoints int64 `json:"maxDataPoints"`
}

type Target struct {
	Target string `json:"target"`
	Type   string `json:"type"`
	RefID  string `json:"refId"`
}

type Range struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type TimeRange struct {
	From time.Time
	To   time.Time
}

type QueryResponse struct {
	Target     string          `json:"target"`
	DataPoints [][]interface{} `json:"datapoints"`
}

type SearchRequest struct {
	Target string `json:"target"`
}

type AnnotationRequest struct {
	Annotation Annotation `json:"annotation"`
	Range      Range     `json:"range"`
}

type Annotation struct {
	Name  string `json:"name"`
	Datasource string `json:"datasource"`
	Enable bool `json:"enable"`
	Query string `json:"query"`
}

type AnnotationResponse struct {
	Time int64  `json:"time"`
	Text string `json:"text"`
	Tags string `json:"tags,omitempty"`
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"version": "1.0.0",
	})
}

func (h *Handler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	end := time.Now()
	start := end.Add(-24 * time.Hour)

	labelValues, err := h.metricsService.LabelValues(ctx, "__name__", start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]string, 0, len(labelValues))
	for _, v := range labelValues {
		result = append(result, v)
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) Query(c *gin.Context) {
	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	timeRange, err := parseTimeRange(req.Range)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range: " + err.Error()})
		return
	}

	step := time.Duration(req.IntervalMs) * time.Millisecond
	if step < 15*time.Second {
		step = 15 * time.Second
	}

	responses := make([]QueryResponse, 0)

	for _, target := range req.Targets {
		opts := metrics.QueryOptions{
			Query:       target.Target,
			Start:       timeRange.From,
			End:         timeRange.To,
			Step:        step,
			Granularity: h.config.Downsampling.DefaultGranularity,
		}

		result, err := h.metricsService.QueryRange(c.Request.Context(), opts)
		if err != nil {
			continue
		}

		for _, stream := range result.Data {
			dataPoints := make([][]interface{}, 0, len(stream.Values))
			for _, v := range stream.Values {
				dataPoints = append(dataPoints, []interface{}{
					float64(v.Value),
					v.Timestamp.Unix() * 1000,
				})
			}

			label := stream.Metric.String()
			if len(stream.Metric) == 1 {
				if name, ok := stream.Metric[model.MetricNameLabel]; ok {
					label = string(name)
				}
			}

			if result.Downsampled {
				label = label + " (downsampled: " + result.Granularity + ")"
			}

			responses = append(responses, QueryResponse{
				Target:     label,
				DataPoints: dataPoints,
			})
		}
	}

	c.JSON(http.StatusOK, responses)
}

func (h *Handler) Annotations(c *gin.Context) {
	var req AnnotationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	responses := []AnnotationResponse{}
	c.JSON(http.StatusOK, responses)
}

func (h *Handler) TagKeys(c *gin.Context) {
	ctx := c.Request.Context()
	end := time.Now()
	start := end.Add(-24 * time.Hour)

	labelNames, err := h.metricsService.LabelNames(ctx, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]gin.H, 0, len(labelNames))
	for _, name := range labelNames {
		result = append(result, gin.H{"type": "string", "text": name})
	}

	c.JSON(http.StatusOK, result)
}

type TagValuesRequest struct {
	Key string `json:"key"`
}

func (h *Handler) TagValues(c *gin.Context) {
	var req TagValuesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	end := time.Now()
	start := end.Add(-24 * time.Hour)

	labelValues, err := h.metricsService.LabelValues(ctx, req.Key, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]string, 0, len(labelValues))
	for _, v := range labelValues {
		result = append(result, v)
	}

	c.JSON(http.StatusOK, result)
}

func parseTimeRange(r Range) (TimeRange, error) {
	from, err := parseGrafanaTime(r.From)
	if err != nil {
		return TimeRange{}, err
	}

	to, err := parseGrafanaTime(r.To)
	if err != nil {
		return TimeRange{}, err
	}

	return TimeRange{From: from, To: to}, nil
}

func parseGrafanaTime(s string) (time.Time, error) {
	if s == "now" {
		return time.Now(), nil
	}

	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}

	if ms, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(0, ms*int64(time.Millisecond)), nil
	}

	return time.Parse("2006-01-02T15:04:05.000Z", s)
}
