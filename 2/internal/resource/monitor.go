package resource

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/distributed-scheduler/internal/models"
	"github.com/distributed-scheduler/internal/repository"
)

type Monitor struct {
	resourceRepo *repository.ResourceRepository
	stopCh       chan struct{}
	activeTasks  map[string]*taskMonitor
	mu           sync.Mutex
}

type taskMonitor struct {
	TaskID      string
	ExecutionID string
	Cmd         *exec.Cmd
	stopCh      chan struct{}
	LimitCPU    float64
	LimitMemory int
}

var monitor *Monitor

func InitMonitor() {
	monitor = &Monitor{
		resourceRepo: repository.NewResourceRepository(),
		activeTasks:  make(map[string]*taskMonitor),
	}
}

func GetMonitor() *Monitor {
	return monitor
}

func (m *Monitor) StartTaskMonitoring(taskID, executionID string, cmd *exec.Cmd, limitCPU float64, limitMemory int) {
	if m == nil {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	tm := &taskMonitor{
		TaskID:      taskID,
		ExecutionID: executionID,
		Cmd:         cmd,
		stopCh:      make(chan struct{}),
		LimitCPU:    limitCPU,
		LimitMemory: limitMemory,
	}

	m.activeTasks[executionID] = tm
	go m.monitorTask(tm)
}

func (m *Monitor) StopTaskMonitoring(executionID string) {
	if m == nil {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if tm, exists := m.activeTasks[executionID]; exists {
		close(tm.stopCh)
		delete(m.activeTasks, executionID)
	}
}

func (m *Monitor) monitorTask(tm *taskMonitor) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-tm.stopCh:
			return
		case <-ticker.C:
			if tm.Cmd == nil || tm.Cmd.Process == nil {
				continue
			}

			cpuPercent, memoryMB := m.getProcessUsage(tm.Cmd.Process.Pid)

			metric := &models.TaskResourceMetrics{
				TaskID:      tm.TaskID,
				ExecutionID: tm.ExecutionID,
				Timestamp:   time.Now(),
				CPUPercent:  cpuPercent,
				MemoryMB:    memoryMB,
			}

			if err := m.resourceRepo.SaveResourceMetric(metric); err != nil {
				log.Printf("Failed to save resource metric: %v", err)
			}

			m.checkResourceLimits(tm, cpuPercent, memoryMB)
		}
	}
}

func (m *Monitor) getProcessUsage(pid int) (float64, float64) {
	if pid <= 0 {
		return 0, 0
	}

	switch runtime.GOOS {
	case "windows":
		return m.getWindowsProcessUsage(pid)
	case "linux", "darwin":
		return m.getUnixProcessUsage(pid)
	default:
		return 0, 0
	}
}

func (m *Monitor) getWindowsProcessUsage(pid int) (float64, float64) {
	pidStr := strconv.Itoa(pid)
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Get-Process -Id %d | Select-Object CPU, WorkingSet64", pid))

	output, err := cmd.Output()
	if err != nil {
		return 0, 0
	}

	lines := strings.Split(string(output), "\n")
	if len(lines) < 3 {
		return 0, 0
	}

	dataLine := strings.TrimSpace(lines[2])
	fields := strings.Fields(dataLine)
	if len(fields) < 2 {
		return 0, 0
	}

	cpu, _ := strconv.ParseFloat(fields[0], 64)
	memKB, _ := strconv.ParseFloat(fields[1], 64)
	memoryMB := memKB / 1024 / 1024

	return cpu, memoryMB
}

func (m *Monitor) getUnixProcessUsage(pid int) (float64, float64) {
	pidStr := strconv.Itoa(pid)

	psCmd := exec.Command("ps", "-p", pidStr, "-o", "%cpu,%mem,rss=")
	output, err := psCmd.Output()
	if err != nil {
		return 0, 0
	}

	lines := strings.Split(string(output), "\n")
	if len(lines) < 2 {
		return 0, 0
	}

	dataLine := strings.TrimSpace(lines[1])
	fields := strings.Fields(dataLine)
	if len(fields) < 3 {
		return 0, 0
	}

	cpu, _ := strconv.ParseFloat(fields[0], 64)
	rssKB, _ := strconv.ParseFloat(fields[2], 64)
	memoryMB := rssKB / 1024

	return cpu, memoryMB
}

func (m *Monitor) checkResourceLimits(tm *taskMonitor, cpuPercent float64, memoryMB float64) {
	limitExceeded := false
	var limitType string

	if tm.LimitCPU > 0 && cpuPercent > tm.LimitCPU {
		limitExceeded = true
		limitType = "CPU"
	}

	if tm.LimitMemory > 0 && memoryMB > float64(tm.LimitMemory) {
		limitExceeded = true
		limitType = "Memory"
	}

	if limitExceeded {
		log.Printf("Resource limit exceeded for task %s (%s): CPU=%.2f%%, Memory=%.2fMB",
			tm.TaskID, limitType, cpuPercent, memoryMB)

		if tm.Cmd != nil && tm.Cmd.Process != nil {
			log.Printf("Terminating task %s due to resource limit exceeded", tm.TaskID)
			tm.Cmd.Process.Kill()
		}
	}
}
