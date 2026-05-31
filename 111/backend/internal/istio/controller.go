package istio

import (
	"fmt"
	"sync"
	"time"

	"chaos-injector/internal/model"
)

type ConflictError struct {
	Service      string
	Namespace    string
	ExistingType model.FaultType
	NewType      model.FaultType
	ExperimentID string
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf(
		"conflict: target %s.%s already has %s fault (experiment %s), cannot apply %s fault simultaneously. Use fault_type='compound' to combine delay+abort in a single rule.",
		e.Service, e.Namespace, e.ExistingType, e.ExperimentID, e.NewType,
	)
}

type VirtualServiceFault struct {
	ExperimentID string
	Target       model.TargetSpec
	FaultType    model.FaultType
	DelayMs      int
	DelayPercent float64
	HTTPStatus   int
	AbortPercent float64
	InterruptPercent float64
	IsCompound   bool
	AppliedAt    time.Time
}

func (f *VirtualServiceFault) DisplayType() string {
	if f.IsCompound {
		return "delay+abort"
	}
	return string(f.FaultType)
}

type Controller struct {
	mu           sync.RWMutex
	activeFaults map[string]*VirtualServiceFault
}

func NewController() *Controller {
	return &Controller{
		activeFaults: make(map[string]*VirtualServiceFault),
	}
}

func (c *Controller) CheckConflict(target model.TargetSpec, newFaultType model.FaultType, excludeExperimentID string) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, fault := range c.activeFaults {
		if fault.ExperimentID == excludeExperimentID {
			continue
		}
		if fault.Target.Service == target.Service &&
			fault.Target.Namespace == target.Namespace {
			return &ConflictError{
				Service:      target.Service,
				Namespace:    target.Namespace,
				ExistingType: fault.FaultType,
				NewType:      newFaultType,
				ExperimentID: fault.ExperimentID,
			}
		}
	}
	return nil
}

func (c *Controller) ApplyFault(experiment *model.ChaosExperiment, target model.TargetSpec) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, fault := range c.activeFaults {
		if fault.ExperimentID != experiment.ID &&
			fault.Target.Service == target.Service &&
			fault.Target.Namespace == target.Namespace {
			return &ConflictError{
				Service:      target.Service,
				Namespace:    target.Namespace,
				ExistingType: fault.FaultType,
				NewType:      experiment.FaultType,
				ExperimentID: fault.ExperimentID,
			}
		}
	}

	fault := &VirtualServiceFault{
		ExperimentID: experiment.ID,
		Target:       target,
		FaultType:    experiment.FaultType,
		AppliedAt:    time.Now(),
	}

	switch experiment.FaultType {
	case model.FaultDelay:
		if experiment.Delay != nil {
			avgMs := (experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2
			fault.DelayMs = avgMs
			fault.DelayPercent = experiment.Delay.Percent
		}
	case model.FaultAbort:
		if experiment.Abort != nil {
			fault.HTTPStatus = experiment.Abort.HTTPStatus
			fault.AbortPercent = experiment.Abort.Percent
		}
	case model.FaultInterrupt:
		if experiment.Interrupt != nil {
			fault.InterruptPercent = experiment.Interrupt.Percent
			fault.HTTPStatus = 503
		}
	case model.FaultCompound:
		fault.IsCompound = true
		if experiment.Delay != nil {
			avgMs := (experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2
			fault.DelayMs = avgMs
			fault.DelayPercent = experiment.Delay.Percent
		}
		if experiment.Abort != nil {
			fault.HTTPStatus = experiment.Abort.HTTPStatus
			fault.AbortPercent = experiment.Abort.Percent
		}
	}

	key := c.faultKey(experiment.ID, target)
	c.activeFaults[key] = fault

	fmt.Printf("[Istio Controller] Applied %s fault to %s.%s (percent=%.0f%%)\n",
		fault.DisplayType(), target.Service, target.Namespace, fault.Percent())

	return nil
}

func (f *VirtualServiceFault) Percent() float64 {
	if f.DelayPercent > 0 {
		return f.DelayPercent
	}
	if f.AbortPercent > 0 {
		return f.AbortPercent
	}
	if f.InterruptPercent > 0 {
		return f.InterruptPercent
	}
	return 0
}

func (c *Controller) RemoveFault(experimentID string, target model.TargetSpec) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	key := c.faultKey(experimentID, target)
	delete(c.activeFaults, key)

	fmt.Printf("[Istio Controller] Removed fault from %s.%s (experiment: %s)\n",
		target.Service, target.Namespace, experimentID)

	return nil
}

func (c *Controller) RemoveAllFaultsForExperiment(experimentID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for key := range c.activeFaults {
		if c.activeFaults[key].ExperimentID == experimentID {
			delete(c.activeFaults, key)
		}
	}

	fmt.Printf("[Istio Controller] Removed all faults for experiment %s\n", experimentID)
	return nil
}

func (c *Controller) GetActiveFaults() []*VirtualServiceFault {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*VirtualServiceFault, 0, len(c.activeFaults))
	for _, fault := range c.activeFaults {
		result = append(result, fault)
	}
	return result
}

func (c *Controller) HasFault(service, namespace string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, fault := range c.activeFaults {
		if fault.Target.Service == service && fault.Target.Namespace == namespace {
			return true
		}
	}
	return false
}

func (c *Controller) GetFaultForService(service, namespace string) *VirtualServiceFault {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, fault := range c.activeFaults {
		if fault.Target.Service == service && fault.Target.Namespace == namespace {
			return fault
		}
	}
	return nil
}

func (c *Controller) GetFaultsForService(service, namespace string) []*VirtualServiceFault {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var result []*VirtualServiceFault
	for _, fault := range c.activeFaults {
		if fault.Target.Service == service && fault.Target.Namespace == namespace {
			result = append(result, fault)
		}
	}
	return result
}

func (c *Controller) faultKey(experimentID string, target model.TargetSpec) string {
	return fmt.Sprintf("%s-%s-%s-%s", experimentID, target.Service, target.Namespace, target.Version)
}

func GenerateVirtualServiceYAML(experiment *model.ChaosExperiment, target model.TargetSpec) string {
	yaml := fmt.Sprintf(`apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: %s-chaos
  namespace: %s
spec:
  hosts:
  - %s
  http:`, target.Service, target.Namespace, target.Service)

	switch experiment.FaultType {
	case model.FaultDelay:
		if experiment.Delay != nil {
			avgMs := (experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2
			yaml += fmt.Sprintf(`
  - fault:
      delay:
        percentage:
          value: %.1f
        fixedDelay: %dms
    route:
    - destination:
        host: %s
        subset: %s`, experiment.Delay.Percent, avgMs, target.Service, target.Subset)
		}
	case model.FaultAbort:
		if experiment.Abort != nil {
			yaml += fmt.Sprintf(`
  - fault:
      abort:
        percentage:
          value: %.1f
        httpStatus: %d
    route:
    - destination:
        host: %s
        subset: %s`, experiment.Abort.Percent, experiment.Abort.HTTPStatus, target.Service, target.Subset)
		}
	case model.FaultInterrupt:
		if experiment.Interrupt != nil {
			yaml += fmt.Sprintf(`
  - fault:
      abort:
        percentage:
          value: %.1f
        httpStatus: 503
    route:
    - destination:
        host: %s
        subset: %s`, experiment.Interrupt.Percent, target.Service, target.Subset)
		}
	case model.FaultCompound:
		hasDelay := experiment.Delay != nil
		hasAbort := experiment.Abort != nil

		if hasDelay && hasAbort {
			avgMs := (experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2
			yaml += fmt.Sprintf(`
  - fault:
      delay:
        percentage:
          value: %.1f
        fixedDelay: %dms
      abort:
        percentage:
          value: %.1f
        httpStatus: %d
    route:
    - destination:
        host: %s
        subset: %s`,
				experiment.Delay.Percent, avgMs,
				experiment.Abort.Percent, experiment.Abort.HTTPStatus,
				target.Service, target.Subset)
		} else if hasDelay {
			avgMs := (experiment.Delay.MinMs + experiment.Delay.MaxMs) / 2
			yaml += fmt.Sprintf(`
  - fault:
      delay:
        percentage:
          value: %.1f
        fixedDelay: %dms
    route:
    - destination:
        host: %s
        subset: %s`, experiment.Delay.Percent, avgMs, target.Service, target.Subset)
		} else if hasAbort {
			yaml += fmt.Sprintf(`
  - fault:
      abort:
        percentage:
          value: %.1f
        httpStatus: %d
    route:
    - destination:
        host: %s
        subset: %s`, experiment.Abort.Percent, experiment.Abort.HTTPStatus, target.Service, target.Subset)
		}
	}

	yaml += fmt.Sprintf(`
---
# Chaos Experiment: %s
# Fault Type: %s
# Applied at: %s`, experiment.Name, experiment.FaultType, time.Now().Format(time.RFC3339))

	return yaml
}
