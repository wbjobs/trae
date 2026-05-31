package api

import (
	"fmt"
	"net/http"
	"time"

	"chaos-injector/internal/istio"
	"chaos-injector/internal/metrics"
	"chaos-injector/internal/model"
	"chaos-injector/internal/safety"
	"chaos-injector/internal/store"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	store        store.Store
	istioCtrl    *istio.Controller
	metrics      *metrics.MetricsCollector
	safetyMonitor *safety.Monitor
}

func NewHandler(s store.Store, ctrl *istio.Controller, m *metrics.MetricsCollector, sm *safety.Monitor) *Handler {
	return &Handler{
		store:        s,
		istioCtrl:    ctrl,
		metrics:      m,
		safetyMonitor: sm,
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	r.GET("/health", h.healthCheck)

	api := r.Group("/api/v1")
	{
		experiments := api.Group("/experiments")
		{
			experiments.POST("", h.createExperiment)
			experiments.GET("", h.listExperiments)
			experiments.GET("/:id", h.getExperiment)
			experiments.PUT("/:id", h.updateExperiment)
			experiments.DELETE("/:id", h.deleteExperiment)
			experiments.POST("/:id/start", h.startExperiment)
			experiments.POST("/:id/pause", h.pauseExperiment)
			experiments.POST("/:id/resume", h.resumeExperiment)
			experiments.POST("/:id/stop", h.stopExperiment)
			experiments.GET("/:id/vs-yaml", h.getVirtualServiceYAML)
			experiments.POST("/check-conflict", h.checkConflict)
			experiments.GET("/:id/blast-radius", h.getBlastRadius)
			experiments.GET("/:id/safety-events", h.getSafetyEventsForExperiment)
		}

		slo := api.Group("/slo")
		{
			slo.POST("", h.createSLO)
			slo.GET("", h.listSLOs)
			slo.GET("/:id", h.getSLO)
			slo.PUT("/:id", h.updateSLO)
			slo.DELETE("/:id", h.deleteSLO)
		}

		api.GET("/safety-events", h.listSafetyEvents)
		api.GET("/topology", h.getTopology)
		api.GET("/metrics/:service", h.getMetrics)
		api.GET("/services", h.getServices)
		api.GET("/faults", h.listActiveFaults)
	}
}

func (h *Handler) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) createExperiment(c *gin.Context) {
	var req model.ExperimentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	exp := model.NewExperiment(req.Name, req.FaultType)
	exp.Description = req.Description
	exp.Delay = req.Delay
	exp.Abort = req.Abort
	exp.Interrupt = req.Interrupt
	exp.Targets = req.Targets
	exp.Duration = req.Duration
	exp.Labels = req.Labels

	if err := validateExperiment(exp); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.store.CreateExperiment(exp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, exp)
}

func (h *Handler) listExperiments(c *gin.Context) {
	experiments, err := h.store.ListExperiments()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, experiments)
}

func (h *Handler) getExperiment(c *gin.Context) {
	id := c.Param("id")
	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, exp)
}

func (h *Handler) updateExperiment(c *gin.Context) {
	id := c.Param("id")

	var req model.ExperimentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existing, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	existing.Name = req.Name
	existing.Description = req.Description
	existing.FaultType = req.FaultType
	existing.Delay = req.Delay
	existing.Abort = req.Abort
	existing.Interrupt = req.Interrupt
	existing.Targets = req.Targets
	existing.Duration = req.Duration
	existing.Labels = req.Labels

	if err := validateExperiment(existing); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.store.UpdateExperiment(id, existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

func (h *Handler) deleteExperiment(c *gin.Context) {
	id := c.Param("id")

	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if exp.Status == model.StatusRunning {
		h.istioCtrl.RemoveAllFaultsForExperiment(id)
		h.safetyMonitor.StopMonitoring(id)
	}

	if err := h.store.DeleteExperiment(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "experiment deleted"})
}

func (h *Handler) startExperiment(c *gin.Context) {
	id := c.Param("id")

	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	for _, target := range exp.Targets {
		if err := h.istioCtrl.CheckConflict(target, exp.FaultType, exp.ID); err != nil {
			c.JSON(http.StatusConflict, gin.H{
				"error":   err.Error(),
				"target":  target.Service + "." + target.Namespace,
				"type":    "conflict",
			})
			return
		}
	}

	for _, target := range exp.Targets {
		if err := h.istioCtrl.ApplyFault(exp, target); err != nil {
			if conflictErr, ok := err.(*istio.ConflictError); ok {
				c.JSON(http.StatusConflict, gin.H{
					"error":        conflictErr.Error(),
					"target":       conflictErr.Service + "." + conflictErr.Namespace,
					"existing_type": conflictErr.ExistingType,
					"new_type":     conflictErr.NewType,
					"experiment_id": conflictErr.ExperimentID,
					"type":         "conflict",
				})
			} else {
				h.store.UpdateStatus(id, model.StatusFailed)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to apply fault: %v", err)})
			}
			return
		}
	}

	if err := h.store.UpdateStatus(id, model.StatusRunning); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.safetyMonitor.StartMonitoring(exp)

	go h.scheduleAutoStop(id, exp.Duration)

	startEvent := model.NewSafetyEvent(exp.ID, exp.Name, model.ActionWarn, "Experiment started by user")
	h.store.AddSafetyEvent(startEvent)

	c.JSON(http.StatusOK, gin.H{"message": "experiment started", "experiment": exp})
}

func (h *Handler) pauseExperiment(c *gin.Context) {
	id := c.Param("id")

	if err := h.store.UpdateStatus(id, model.StatusPaused); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	h.safetyMonitor.StopMonitoring(id)

	c.JSON(http.StatusOK, gin.H{"message": "experiment paused"})
}

func (h *Handler) resumeExperiment(c *gin.Context) {
	id := c.Param("id")

	if err := h.store.UpdateStatus(id, model.StatusRunning); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	exp, err := h.store.GetExperiment(id)
	if err == nil {
		h.safetyMonitor.StartMonitoring(exp)
	}

	c.JSON(http.StatusOK, gin.H{"message": "experiment resumed"})
}

func (h *Handler) stopExperiment(c *gin.Context) {
	id := c.Param("id")

	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	for _, target := range exp.Targets {
		h.istioCtrl.RemoveFault(id, target)
	}

	h.istioCtrl.RemoveAllFaultsForExperiment(id)

	h.safetyMonitor.StopMonitoring(id)

	if err := h.store.UpdateStatus(id, model.StatusCompleted); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "experiment stopped"})
}

func (h *Handler) getTopology(c *gin.Context) {
	activeExps, _ := h.store.GetActiveExperiments()
	topology := h.metrics.GetTopology(activeExps)
	c.JSON(http.StatusOK, topology)
}

func (h *Handler) getMetrics(c *gin.Context) {
	service := c.Param("service")
	activeExps, _ := h.store.GetActiveExperiments()

	chaosExps := make([]model.ChaosExperiment, len(activeExps))
	for i, exp := range activeExps {
		chaosExps[i] = *exp
	}

	m := h.metrics.GetGoldenMetrics(service, chaosExps)
	c.JSON(http.StatusOK, m)
}

func (h *Handler) getServices(c *gin.Context) {
	services := h.metrics.GetAllServices()
	c.JSON(http.StatusOK, services)
}

func (h *Handler) listActiveFaults(c *gin.Context) {
	faults := h.istioCtrl.GetActiveFaults()
	c.JSON(http.StatusOK, faults)
}

func (h *Handler) getVirtualServiceYAML(c *gin.Context) {
	id := c.Param("id")

	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	yamls := make([]string, len(exp.Targets))
	for i, target := range exp.Targets {
		yamls[i] = istio.GenerateVirtualServiceYAML(exp, target)
	}

	c.Data(http.StatusOK, "text/yaml; charset=utf-8", []byte(joinYAMLs(yamls)))
}

func (h *Handler) scheduleAutoStop(experimentID string, durationStr string) {
	duration, err := time.ParseDuration(durationStr)
	if err != nil {
		duration = 5 * time.Minute
	}

	timer := time.NewTimer(duration)
	<-timer.C

	exp, err := h.store.GetExperiment(experimentID)
	if err != nil {
		return
	}

	if exp.Status == model.StatusRunning {
		for _, target := range exp.Targets {
			h.istioCtrl.RemoveFault(experimentID, target)
		}
		h.istioCtrl.RemoveAllFaultsForExperiment(experimentID)
		h.safetyMonitor.StopMonitoring(experimentID)
		h.store.UpdateStatus(experimentID, model.StatusCompleted)
	}
}

func (h *Handler) checkConflict(c *gin.Context) {
	var req struct {
		Targets      []model.TargetSpec `json:"targets" binding:"required"`
		FaultType    model.FaultType    `json:"fault_type" binding:"required"`
		ExperimentID string             `json:"experiment_id,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	conflicts := make([]gin.H, 0)
	for _, target := range req.Targets {
		if err := h.istioCtrl.CheckConflict(target, req.FaultType, req.ExperimentID); err != nil {
			if conflictErr, ok := err.(*istio.ConflictError); ok {
				conflicts = append(conflicts, gin.H{
					"service":       conflictErr.Service,
					"namespace":     conflictErr.Namespace,
					"existing_type": conflictErr.ExistingType,
					"new_type":      conflictErr.NewType,
					"experiment_id": conflictErr.ExperimentID,
					"message":       conflictErr.Error(),
				})
			}
		}
	}

	if len(conflicts) > 0 {
		c.JSON(http.StatusConflict, gin.H{
			"has_conflict": true,
			"conflicts":    conflicts,
		})
	} else {
		c.JSON(http.StatusOK, gin.H{"has_conflict": false})
	}
}

func (h *Handler) createSLO(c *gin.Context) {
	var req model.SLOThresholdRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slo := model.NewSLOThreshold(req.Service, req.Namespace)
	slo.IsCritical = req.IsCritical
	slo.MaxAvgLatencyMs = req.MaxAvgLatencyMs
	slo.MaxP95LatencyMs = req.MaxP95LatencyMs
	slo.MaxP99LatencyMs = req.MaxP99LatencyMs
	slo.MinSuccessRate = req.MinSuccessRate
	slo.MaxErrorRate = req.MaxErrorRate
	slo.MinQPS = req.MinQPS
	slo.AutoStopEnabled = req.AutoStopEnabled
	slo.GracePeriodSeconds = req.GracePeriodSeconds

	if err := h.store.CreateSLO(slo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, slo)
}

func (h *Handler) listSLOs(c *gin.Context) {
	slos, err := h.store.ListSLOs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, slos)
}

func (h *Handler) getSLO(c *gin.Context) {
	id := c.Param("id")
	slo, err := h.store.GetSLO(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, slo)
}

func (h *Handler) updateSLO(c *gin.Context) {
	id := c.Param("id")

	var req model.SLOThresholdRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slo, err := h.store.GetSLO(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	slo.IsCritical = req.IsCritical
	slo.MaxAvgLatencyMs = req.MaxAvgLatencyMs
	slo.MaxP95LatencyMs = req.MaxP95LatencyMs
	slo.MaxP99LatencyMs = req.MaxP99LatencyMs
	slo.MinSuccessRate = req.MinSuccessRate
	slo.MaxErrorRate = req.MaxErrorRate
	slo.MinQPS = req.MinQPS
	slo.AutoStopEnabled = req.AutoStopEnabled
	slo.GracePeriodSeconds = req.GracePeriodSeconds

	if err := h.store.UpdateSLO(id, slo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, slo)
}

func (h *Handler) deleteSLO(c *gin.Context) {
	id := c.Param("id")
	if err := h.store.DeleteSLO(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "SLO deleted"})
}

func (h *Handler) getBlastRadius(c *gin.Context) {
	id := c.Param("id")

	exp, err := h.store.GetExperiment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	assessments := h.safetyMonitor.AssessBlastRadius(exp)

	hasHighRisk := false
	hasCritical := false
	for _, a := range assessments {
		if a.RiskLevel == "high" || a.RiskLevel == "critical" {
			hasHighRisk = true
		}
		if a.IsCritical {
			hasCritical = true
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"experiment_id":    id,
		"experiment_name":  exp.Name,
		"assessments":      assessments,
		"has_high_risk":    hasHighRisk,
		"has_critical_svc": hasCritical,
	})
}

func (h *Handler) listSafetyEvents(c *gin.Context) {
	events := h.store.ListSafetyEvents(50)
	c.JSON(http.StatusOK, events)
}

func (h *Handler) getSafetyEventsForExperiment(c *gin.Context) {
	id := c.Param("id")
	events := h.store.ListSafetyEventsForExperiment(id)
	c.JSON(http.StatusOK, events)
}

func validateExperiment(exp *model.ChaosExperiment) error {
	if exp.Name == "" {
		return fmt.Errorf("name is required")
	}
	if exp.FaultType == "" {
		return fmt.Errorf("fault_type is required")
	}
	if len(exp.Targets) == 0 {
		return fmt.Errorf("at least one target is required")
	}
	if exp.Duration == "" {
		return fmt.Errorf("duration is required")
	}

	switch exp.FaultType {
	case model.FaultDelay:
		if exp.Delay == nil {
			return fmt.Errorf("delay spec is required for fault type 'delay'")
		}
		if exp.Delay.MinMs < 50 || exp.Delay.MaxMs > 2000 {
			return fmt.Errorf("delay must be between 50ms and 2000ms")
		}
		if exp.Delay.MinMs > exp.Delay.MaxMs {
			return fmt.Errorf("min_ms must be <= max_ms")
		}
		if exp.Delay.Percent <= 0 || exp.Delay.Percent > 100 {
			return fmt.Errorf("delay percent must be between 0 and 100")
		}
	case model.FaultAbort:
		if exp.Abort == nil {
			return fmt.Errorf("abort spec is required for fault type 'abort'")
		}
		if exp.Abort.HTTPStatus < 400 || exp.Abort.HTTPStatus > 599 {
			return fmt.Errorf("http_status must be between 400 and 599")
		}
		if exp.Abort.Percent <= 0 || exp.Abort.Percent > 100 {
			return fmt.Errorf("abort percent must be between 0 and 100")
		}
	case model.FaultInterrupt:
		if exp.Interrupt == nil {
			return fmt.Errorf("interrupt spec is required for fault type 'interrupt'")
		}
		if exp.Interrupt.Percent <= 0 || exp.Interrupt.Percent > 100 {
			return fmt.Errorf("interrupt percent must be between 0 and 100")
		}
	case model.FaultCompound:
		if exp.Delay == nil && exp.Abort == nil {
			return fmt.Errorf("compound fault requires at least delay or abort spec")
		}
		if exp.Delay != nil {
			if exp.Delay.MinMs < 50 || exp.Delay.MaxMs > 2000 {
				return fmt.Errorf("delay must be between 50ms and 2000ms")
			}
			if exp.Delay.MinMs > exp.Delay.MaxMs {
				return fmt.Errorf("min_ms must be <= max_ms")
			}
			if exp.Delay.Percent <= 0 || exp.Delay.Percent > 100 {
				return fmt.Errorf("delay percent must be between 0 and 100")
			}
		}
		if exp.Abort != nil {
			if exp.Abort.HTTPStatus < 400 || exp.Abort.HTTPStatus > 599 {
				return fmt.Errorf("http_status must be between 400 and 599")
			}
			if exp.Abort.Percent <= 0 || exp.Abort.Percent > 100 {
				return fmt.Errorf("abort percent must be between 0 and 100")
			}
		}
	default:
		return fmt.Errorf("invalid fault type: %s", exp.FaultType)
	}

	return nil
}

func joinYAMLs(yamls []string) string {
	result := ""
	for i, y := range yamls {
		if i > 0 {
			result += "\n---\n"
		}
		result += y
	}
	return result
}
