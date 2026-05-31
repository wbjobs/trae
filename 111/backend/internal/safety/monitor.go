package safety

import (
	"fmt"
	"log"
	"sync"
	"time"

	"chaos-injector/internal/istio"
	"chaos-injector/internal/metrics"
	"chaos-injector/internal/model"
	"chaos-injector/internal/store"
)

type Monitor struct {
	store     store.Store
	istioCtrl *istio.Controller
	metrics   *metrics.MetricsCollector

	mu          sync.RWMutex
	monitored   map[string]*experimentMonitor
	stopCh      map[string]chan struct{}
}

type experimentMonitor struct {
	experimentID string
	firstViolation time.Time
	violations    []model.SLOViolation
	graceTimer    *time.Timer
}

func NewMonitor(s store.Store, ic *istio.Controller, m *metrics.MetricsCollector) *Monitor {
	return &Monitor{
		store:     s,
		istioCtrl: ic,
		metrics:   m,
		monitored: make(map[string]*experimentMonitor),
		stopCh:    make(map[string]chan struct{}),
	}
}

func (mon *Monitor) StartMonitoring(experiment *model.ChaosExperiment) {
	mon.mu.Lock()
	if _, exists := mon.monitored[experiment.ID]; exists {
		mon.mu.Unlock()
		return
	}
	stopCh := make(chan struct{})
	mon.stopCh[experiment.ID] = stopCh
	mon.monitored[experiment.ID] = &experimentMonitor{
		experimentID: experiment.ID,
		violations:   make([]model.SLOViolation, 0),
	}
	mon.mu.Unlock()

	go mon.monitorLoop(experiment, stopCh)

	log.Printf("[Safety Monitor] Started monitoring experiment %s (%s)", experiment.ID, experiment.Name)
}

func (mon *Monitor) StopMonitoring(experimentID string) {
	mon.mu.Lock()
	defer mon.mu.Unlock()

	if ch, exists := mon.stopCh[experimentID]; exists {
		close(ch)
		delete(mon.stopCh, experimentID)
	}
	delete(mon.monitored, experimentID)

	log.Printf("[Safety Monitor] Stopped monitoring experiment %s", experimentID)
}

func (mon *Monitor) monitorLoop(experiment *model.ChaosExperiment, stopCh chan struct{}) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			exp, err := mon.store.GetExperiment(experiment.ID)
			if err != nil || exp.Status != model.StatusRunning {
				mon.StopMonitoring(experiment.ID)
				return
			}
			mon.checkExperiment(experiment)
		}
	}
}

func (mon *Monitor) checkExperiment(experiment *model.ChaosExperiment) {
	for _, target := range experiment.Targets {
		slo, err := mon.store.GetSLOForService(target.Service, target.Namespace)
		if err != nil || slo == nil {
			continue
		}

		chaosExps := mon.getActiveExperiments()
		currentMetrics := mon.metrics.GetGoldenMetrics(target.Service, chaosExps)

		violations := mon.detectViolations(slo, currentMetrics, target)

		if len(violations) > 0 {
			mon.handleViolations(experiment, slo, target, violations, currentMetrics)
		} else {
			mon.resetGracePeriod(experiment.ID)
		}
	}
}

func (mon *Monitor) getActiveExperiments() []model.ChaosExperiment {
	activeExps, _ := mon.store.GetActiveExperiments()
	result := make([]model.ChaosExperiment, len(activeExps))
	for i, exp := range activeExps {
		result[i] = *exp
	}
	return result
}

func (mon *Monitor) detectViolations(slo *model.SLOThreshold, metrics *model.GoldenMetrics, target model.TargetSpec) []model.SLOViolation {
	var violations []model.SLOViolation

	severity := "warning"
	if slo.IsCritical {
		severity = "critical"
	}

	if slo.MaxAvgLatencyMs > 0 && metrics.AvgLatency > slo.MaxAvgLatencyMs {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "avg_latency_ms",
			Threshold:  slo.MaxAvgLatencyMs,
			Actual:     metrics.AvgLatency,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	if slo.MaxP95LatencyMs > 0 && metrics.P95Latency > slo.MaxP95LatencyMs {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "p95_latency_ms",
			Threshold:  slo.MaxP95LatencyMs,
			Actual:     metrics.P95Latency,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	if slo.MaxP99LatencyMs > 0 && metrics.P99Latency > slo.MaxP99LatencyMs {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "p99_latency_ms",
			Threshold:  slo.MaxP99LatencyMs,
			Actual:     metrics.P99Latency,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	if slo.MinSuccessRate > 0 && metrics.SuccessRate < slo.MinSuccessRate {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "success_rate",
			Threshold:  slo.MinSuccessRate,
			Actual:     metrics.SuccessRate,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	if slo.MaxErrorRate > 0 && metrics.ErrorRate > slo.MaxErrorRate {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "error_rate",
			Threshold:  slo.MaxErrorRate,
			Actual:     metrics.ErrorRate,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	if slo.MinQPS > 0 && metrics.QPS < slo.MinQPS {
		violations = append(violations, model.SLOViolation{
			Service:    target.Service,
			Namespace:  target.Namespace,
			Metric:     "qps",
			Threshold:  slo.MinQPS,
			Actual:     metrics.QPS,
			Severity:   severity,
			IsCritical: slo.IsCritical,
		})
	}

	return violations
}

func (mon *Monitor) handleViolations(experiment *model.ChaosExperiment, slo *model.SLOThreshold, target model.TargetSpec, violations []model.SLOViolation, metrics *model.GoldenMetrics) {
	mon.mu.Lock()
	em, exists := mon.monitored[experiment.ID]
	if !exists {
		mon.mu.Unlock()
		return
	}

	hasCritical := false
	hasSevere := false
	for _, v := range violations {
		if v.IsCritical && (v.Metric == "success_rate" || v.Metric == "error_rate") {
			hasCritical = true
		}
		if v.Actual > v.Threshold*1.2 || (v.Metric == "success_rate" && v.Actual < v.Threshold*0.95) {
			hasSevere = true
		}
	}

	if hasCritical || hasSevere {
		em.violations = append(em.violations, violations...)

		if em.firstViolation.IsZero() {
			em.firstViolation = time.Now()

			gracePeriod := time.Duration(slo.GracePeriodSeconds) * time.Second
			em.graceTimer = time.AfterFunc(gracePeriod, func() {
				mon.autoStopExperiment(experiment, slo, target, violations, metrics)
			})
		}

		graceElapsed := time.Since(em.firstViolation)
		gracePeriod := time.Duration(slo.GracePeriodSeconds) * time.Second

		if graceElapsed >= gracePeriod || (hasCritical && slo.AutoStopEnabled) {
			mon.mu.Unlock()
			mon.autoStopExperiment(experiment, slo, target, violations, metrics)
			return
		}
	} else {
		em.violations = em.violations[:0]
		em.firstViolation = time.Time{}
		if em.graceTimer != nil {
			em.graceTimer.Stop()
			em.graceTimer = nil
		}
	}

	mon.mu.Unlock()
}

func (mon *Monitor) resetGracePeriod(experimentID string) {
	mon.mu.Lock()
	defer mon.mu.Unlock()

	if em, exists := mon.monitored[experimentID]; exists {
		em.violations = em.violations[:0]
		em.firstViolation = time.Time{}
		if em.graceTimer != nil {
			em.graceTimer.Stop()
			em.graceTimer = nil
		}
	}
}

func (mon *Monitor) autoStopExperiment(experiment *model.ChaosExperiment, slo *model.SLOThreshold, target model.TargetSpec, violations []model.SLOViolation, metrics *model.GoldenMetrics) {
	exp, err := mon.store.GetExperiment(experiment.ID)
	if err != nil || exp.Status != model.StatusRunning {
		return
	}

	for _, t := range experiment.Targets {
		mon.istioCtrl.RemoveFault(experiment.ID, t)
	}
	mon.istioCtrl.RemoveAllFaultsForExperiment(experiment.ID)

	if err := mon.store.UpdateStatus(experiment.ID, model.StatusCompleted); err != nil {
		log.Printf("[Safety Monitor] Failed to update status for %s: %v", experiment.ID, err)
	}

	event := model.NewSafetyEvent(experiment.ID, experiment.Name, model.ActionAutoStop,
		fmt.Sprintf("SLO threshold breached for %s.%s: auto-stopped due to %d violations", target.Service, target.Namespace, len(violations)))
	event.Violations = violations
	event.Service = target.Service
	event.Namespace = target.Namespace
	event.MetricsAfter = metrics

	mon.store.AddSafetyEvent(event)

	mon.StopMonitoring(experiment.ID)

	log.Printf("[Safety Monitor] AUTO-STOPPED experiment %s (%s) due to SLO violations on %s.%s",
		experiment.ID, experiment.Name, target.Service, target.Namespace)
}

func (mon *Monitor) AssessBlastRadius(experiment *model.ChaosExperiment) []model.BlastRadiusAssessment {
	var assessments []model.BlastRadiusAssessment

	for _, target := range experiment.Targets {
		assessment := model.BlastRadiusAssessment{
			Service:          target.Service,
			Namespace:        target.Namespace,
			IsCritical:       false,
			HasSLO:           false,
			EstimatedImpact:  "Unknown",
			RiskLevel:        "low",
		}

		slo, err := mon.store.GetSLOForService(target.Service, target.Namespace)
		if err == nil && slo != nil {
			assessment.HasSLO = true
			assessment.IsCritical = slo.IsCritical
			assessment.SLOThreshold = slo

			assessment.EstimatedImpact = mon.estimateImpact(experiment, slo)
			assessment.RiskLevel = mon.calculateRiskLevel(experiment, slo)
		} else {
			assessment.EstimatedImpact = mon.estimateImpactWithoutSLO(experiment)
			assessment.RiskLevel = "unknown"
		}

		assessments = append(assessments, assessment)
	}

	return assessments
}

func (mon *Monitor) estimateImpact(experiment *model.ChaosExperiment, slo *model.SLOThreshold) string {
	switch experiment.FaultType {
	case model.FaultDelay:
		if experiment.Delay != nil {
			avgMs := float64((experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2)
			impactPercent := (avgMs / slo.MaxAvgLatencyMs) * 100
			if impactPercent > 80 {
				return fmt.Sprintf("High: delay %.0fms exceeds 80%% of SLO limit (%.0fms)", avgMs, slo.MaxAvgLatencyMs)
			} else if impactPercent > 40 {
				return fmt.Sprintf("Medium: delay %.0fms is 40-80%% of SLO limit (%.0fms)", avgMs, slo.MaxAvgLatencyMs)
			}
			return fmt.Sprintf("Low: delay %.0fms is within SLO limit (%.0fms)", avgMs, slo.MaxAvgLatencyMs)
		}
	case model.FaultAbort:
		if experiment.Abort != nil {
			impactPercent := experiment.Abort.Percent
			if slo.MinSuccessRate > 0 && (100-impactPercent) < slo.MinSuccessRate {
				return fmt.Sprintf("High: abort %.0f%% would drop success rate below SLO (%.1f%%)", impactPercent, slo.MinSuccessRate)
			}
			return fmt.Sprintf("Medium: abort %.0f%% may reduce success rate", impactPercent)
		}
	case model.FaultInterrupt:
		if experiment.Interrupt != nil {
			return fmt.Sprintf("High: interrupt %.0f%% will cause connection errors", experiment.Interrupt.Percent)
		}
	case model.FaultCompound:
		hasDelay := experiment.Delay != nil && experiment.Delay.Percent > 0
		hasAbort := experiment.Abort != nil && experiment.Abort.Percent > 0
		if hasDelay && hasAbort {
			return "High: compound delay+abort affects multiple SLO dimensions"
		}
		if hasDelay {
			avgMs := float64((experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2)
			return fmt.Sprintf("Medium: delay %.0fms in compound fault", avgMs)
		}
		return fmt.Sprintf("Medium: abort HTTP %d in compound fault", experiment.Abort.HTTPStatus)
	}
	return "Unknown impact"
}

func (mon *Monitor) estimateImpactWithoutSLO(experiment *model.ChaosExperiment) string {
	switch experiment.FaultType {
	case model.FaultDelay:
		if experiment.Delay != nil {
			avgMs := float64((experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2)
			if avgMs > 500 {
				return fmt.Sprintf("High: delay %.0fms is significant", avgMs)
			}
			return fmt.Sprintf("Medium: delay %.0fms", avgMs)
		}
	case model.FaultAbort:
		if experiment.Abort != nil {
			if experiment.Abort.Percent > 20 {
				return fmt.Sprintf("High: abort %.0f%% of requests", experiment.Abort.Percent)
			}
			return fmt.Sprintf("Medium: abort %.0f%% of requests", experiment.Abort.Percent)
		}
	case model.FaultInterrupt:
		return "High: interrupt causes connection failures"
	case model.FaultCompound:
		return "Medium-High: compound fault"
	}
	return "No SLO defined for this service"
}

func (mon *Monitor) calculateRiskLevel(experiment *model.ChaosExperiment, slo *model.SLOThreshold) string {
	if slo.IsCritical {
		return "critical"
	}

	highRisk := false
	mediumRisk := false

	switch experiment.FaultType {
	case model.FaultDelay:
		if experiment.Delay != nil {
			avgMs := float64((experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2)
			if avgMs > slo.MaxAvgLatencyMs*0.8 {
				highRisk = true
			} else if avgMs > slo.MaxAvgLatencyMs*0.4 {
				mediumRisk = true
			}
		}
	case model.FaultAbort:
		if experiment.Abort != nil {
			if experiment.Abort.Percent > 20 {
				highRisk = true
			} else if experiment.Abort.Percent > 5 {
				mediumRisk = true
			}
		}
	case model.FaultInterrupt:
		highRisk = true
	case model.FaultCompound:
		if experiment.Delay != nil && experiment.Abort != nil {
			highRisk = true
		} else {
			mediumRisk = true
		}
	}

	if highRisk {
		return "high"
	}
	if mediumRisk {
		return "medium"
	}
	return "low"
}
