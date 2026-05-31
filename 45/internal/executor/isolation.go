package executor

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"

	pb "github.com/distributed-scheduler/worker/proto"
)

type IsolationManager interface {
	Setup(taskID string, quota *pb.ResourceQuota) error
	Apply(cmd *exec.Cmd) error
	Usage() (*pb.ResourceUsage, error)
	Cleanup() error
}

type NoopIsolation struct{}

func (n *NoopIsolation) Setup(taskID string, quota *pb.ResourceQuota) error { return nil }
func (n *NoopIsolation) Apply(cmd *exec.Cmd) error                           { return nil }
func (n *NoopIsolation) Usage() (*pb.ResourceUsage, error)                   { return &pb.ResourceUsage{}, nil }
func (n *NoopIsolation) Cleanup() error                                      { return nil }

type CgroupIsolation struct {
	taskID    string
	quota     *pb.ResourceQuota
	cgroupPath string
	mu        sync.Mutex
	setup     bool
}

func NewIsolationManager(task *pb.Task) IsolationManager {
	if !task.EnableIsolation || task.ResourceQuota == nil {
		return &NoopIsolation{}
	}

	switch runtime.GOOS {
	case "linux":
		return &CgroupIsolation{
			taskID: task.Id,
			quota:  task.ResourceQuota,
		}
	case "windows":
		return NewWindowsJobIsolation(task)
	case "darwin":
		return NewDarwinIsolation(task)
	default:
		return &NoopIsolation{}
	}
}

func (c *CgroupIsolation) Setup(taskID string, quota *pb.ResourceQuota) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.setup {
		return nil
	}

	basePath := "/sys/fs/cgroup"
	c.cgroupPath = fmt.Sprintf("%s/task-%s", basePath, taskID)

	if err := os.MkdirAll(c.cgroupPath, 0755); err != nil {
		return fmt.Errorf("create cgroup: %w", err)
	}

	if quota.CpuLimit > 0 {
		period := 100000
		quotaVal := int64(quota.CpuLimit * float64(period))
		if err := writeCgroupValue(c.cgroupPath, "cpu.max", fmt.Sprintf("%d %d", quotaVal, period)); err != nil {
			return fmt.Errorf("set cpu limit: %w", err)
		}
	}

	if quota.MemoryLimitBytes > 0 {
		if err := writeCgroupValue(c.cgroupPath, "memory.max", strconv.FormatInt(quota.MemoryLimitBytes, 10)); err != nil {
			return fmt.Errorf("set memory limit: %w", err)
		}
	}

	if quota.PidsLimit > 0 {
		if err := writeCgroupValue(c.cgroupPath, "pids.max", strconv.FormatInt(quota.PidsLimit, 10)); err != nil {
			return fmt.Errorf("set pids limit: %w", err)
		}
	}

	if quota.IoReadBps > 0 || quota.IoWriteBps > 0 {
		var ioMax string
		if quota.IoReadBps > 0 {
			ioMax += fmt.Sprintf("rbps=%d ", int64(quota.IoReadBps))
		}
		if quota.IoWriteBps > 0 {
			ioMax += fmt.Sprintf("wbps=%d ", int64(quota.IoWriteBps))
		}
		if ioMax != "" {
			if err := writeCgroupValue(c.cgroupPath, "io.max", ioMax); err != nil {
				return fmt.Errorf("set io limit: %w", err)
			}
		}
	}

	c.setup = true
	return nil
}

func (c *CgroupIsolation) Apply(cmd *exec.Cmd) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.setup {
		return nil
	}

	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}

	cmd.SysProcAttr.Cloneflags |= syscall.CLONE_NEWCGROUP

	if cmd.Process != nil {
		procsFile := c.cgroupPath + "/cgroup.procs"
		f, err := os.OpenFile(procsFile, os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return fmt.Errorf("open cgroup procs: %w", err)
		}
		defer f.Close()
		if _, err := f.WriteString(strconv.Itoa(cmd.Process.Pid)); err != nil {
			return fmt.Errorf("add process to cgroup: %w", err)
		}
	}

	return nil
}

func (c *CgroupIsolation) Usage() (*pb.ResourceUsage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.setup {
		return &pb.ResourceUsage{}, nil
	}

	usage := &pb.ResourceUsage{}

	if memUsage, err := readCgroupValue(c.cgroupPath, "memory.peak"); err == nil {
		if val, err := strconv.ParseInt(memUsage, 10, 64); err == nil {
			usage.MemoryPeakBytes = val
		}
	}

	if memCurrent, err := readCgroupValue(c.cgroupPath, "memory.current"); err == nil {
		if val, err := strconv.ParseInt(memCurrent, 10, 64); err == nil {
			usage.MemoryAvgBytes = val
		}
	}

	if cpuStat, err := readCgroupValue(c.cgroupPath, "cpu.stat"); err == nil {
		var usageUsec, userUsec, systemUsec int64
		for _, line := range strings.Split(cpuStat, "\n") {
			parts := strings.Fields(line)
			if len(parts) != 2 {
				continue
			}
			switch parts[0] {
			case "usage_usec":
				usageUsec, _ = strconv.ParseInt(parts[1], 10, 64)
			case "user_usec":
				userUsec, _ = strconv.ParseInt(parts[1], 10, 64)
			case "system_usec":
				systemUsec, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		}
		if usageUsec > 0 {
			usage.CpuUsagePercent = float64(userUsec+systemUsec) / float64(usageUsec) * 100
		}
	}

	return usage, nil
}

func (c *CgroupIsolation) Cleanup() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.setup {
		return nil
	}

	if err := os.RemoveAll(c.cgroupPath); err != nil {
		return fmt.Errorf("remove cgroup: %w", err)
	}

	c.setup = false
	return nil
}

func writeCgroupValue(cgroupPath, file, value string) error {
	fullPath := cgroupPath + "/" + file
	return os.WriteFile(fullPath, []byte(value), 0644)
}

func readCgroupValue(cgroupPath, file string) (string, error) {
	fullPath := cgroupPath + "/" + file
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}
