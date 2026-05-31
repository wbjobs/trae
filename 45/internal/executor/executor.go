package executor

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	pb "github.com/distributed-scheduler/worker/proto"
)

type LogCallback func(content string, isStderr bool, timestamp int64)
type ResourceMonitorCallback func(usage *pb.ResourceUsage)

type TaskExecutor struct {
	task          *pb.Task
	ctx           context.Context
	cancel        context.CancelFunc
	cmd           *exec.Cmd
	logCb         LogCallback
	resourceCb    ResourceMonitorCallback
	mu            sync.Mutex
	running       bool
	stdoutBuf     *strings.Builder
	stderrBuf     *strings.Builder
	isolation     IsolationManager
	resourceUsage *pb.ResourceUsage
	resourceMu    sync.Mutex
}

func NewTaskExecutor(task *pb.Task) *TaskExecutor {
	return &TaskExecutor{
		task:          task,
		stdoutBuf:     &strings.Builder{},
		stderrBuf:     &strings.Builder{},
		isolation:     NewIsolationManager(task),
		resourceUsage: &pb.ResourceUsage{},
	}
}

func (e *TaskExecutor) SetLogCallback(cb LogCallback) {
	e.logCb = cb
}

func (e *TaskExecutor) SetResourceMonitorCallback(cb ResourceMonitorCallback) {
	e.resourceCb = cb
}

func (e *TaskExecutor) Execute() (*pb.TaskResult, error) {
	timeout := time.Duration(e.task.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 1 * time.Hour
	}

	e.ctx, e.cancel = context.WithTimeout(context.Background(), timeout)
	defer e.cancel()

	startTime := time.Now().Unix()

	if err := e.isolation.Setup(e.task.Id, e.task.ResourceQuota); err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1,
			fmt.Sprintf("setup isolation: %v", err), startTime), err
	}
	defer e.isolation.Cleanup()

	cmd, err := e.buildCommand()
	if err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1, err.Error(), startTime), err
	}

	if err := e.isolation.Apply(cmd); err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1,
			fmt.Sprintf("apply isolation: %v", err), startTime), err
	}

	e.cmd = cmd
	e.running = true

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1, err.Error(), startTime), err
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1, err.Error(), startTime), err
	}

	if err := cmd.Start(); err != nil {
		return e.buildResult(pb.TaskStatus_FAILED, -1, err.Error(), startTime), err
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go e.streamLogs(stdoutPipe, false, &wg)
	go e.streamLogs(stderrPipe, true, &wg)

	monitorStop := make(chan struct{})
	go e.startResourceMonitoring(monitorStop)

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-e.ctx.Done():
		close(monitorStop)
		_ = cmd.Process.Kill()
		<-done
		wg.Wait()
		return e.buildResult(pb.TaskStatus_TIMEOUT, -1, "task timeout", startTime), nil
	case err := <-done:
		close(monitorStop)
		wg.Wait()
		e.running = false

		if finalUsage, err := e.isolation.Usage(); err == nil {
			e.resourceMu.Lock()
			e.resourceUsage = finalUsage
			e.resourceMu.Unlock()
		}

		if err != nil {
			exitCode := -1
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
			return e.buildResult(pb.TaskStatus_FAILED, int32(exitCode), err.Error(), startTime), nil
		}
		return e.buildResult(pb.TaskStatus_SUCCESS, 0, "", startTime), nil
	}
}

func (e *TaskExecutor) Cancel() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running || e.cancel == nil {
		return fmt.Errorf("task is not running")
	}

	e.cancel()
	if e.cmd != nil && e.cmd.Process != nil {
		return e.cmd.Process.Kill()
	}
	return nil
}

func (e *TaskExecutor) startResourceMonitoring(stopCh chan struct{}) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			usage, err := e.isolation.Usage()
			if err != nil {
				continue
			}

			e.resourceMu.Lock()
			if usage.MemoryPeakBytes > e.resourceUsage.MemoryPeakBytes {
				e.resourceUsage.MemoryPeakBytes = usage.MemoryPeakBytes
			}
			if usage.MemoryAvgBytes > 0 {
				if e.resourceUsage.MemoryAvgBytes == 0 {
					e.resourceUsage.MemoryAvgBytes = usage.MemoryAvgBytes
				} else {
					e.resourceUsage.MemoryAvgBytes = (e.resourceUsage.MemoryAvgBytes + usage.MemoryAvgBytes) / 2
				}
			}
			e.resourceUsage.CpuUsagePercent = usage.CpuUsagePercent
			if e.resourceCb != nil {
				e.resourceCb(usage)
			}
			e.resourceMu.Unlock()
		}
	}
}

func (e *TaskExecutor) buildCommand() (*exec.Cmd, error) {
	var cmd *exec.Cmd

	switch e.task.Type {
	case pb.TaskType_SHELL:
		cmd = e.buildShellCommand()
	case pb.TaskType_PYTHON:
		cmd = e.buildPythonCommand()
	case pb.TaskType_DOCKER:
		cmd = e.buildDockerCommand()
	default:
		return nil, fmt.Errorf("unsupported task type: %v", e.task.Type)
	}

	if e.task.WorkingDirectory != "" {
		cmd.Dir = e.task.WorkingDirectory
	}

	if len(e.task.Environment) > 0 {
		env := os.Environ()
		for k, v := range e.task.Environment {
			env = append(env, fmt.Sprintf("%s=%s", k, v))
		}
		cmd.Env = env
	}

	if e.task.RunAsUser != "" {
		e.applyUserAndGroup(cmd)
	}

	return cmd, nil
}

func (e *TaskExecutor) applyUserAndGroup(cmd *exec.Cmd) {
	if runtime.GOOS != "linux" {
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	if e.task.RunAsUser != "" {
		if uid, err := strconv.Atoi(e.task.RunAsUser); err == nil {
			cmd.SysProcAttr.Credential = &syscall.Credential{
				Uid: uint32(uid),
			}
		}
		if e.task.RunAsGroup != "" {
			if gid, err := strconv.Atoi(e.task.RunAsGroup); err == nil {
				if cmd.SysProcAttr.Credential == nil {
					cmd.SysProcAttr.Credential = &syscall.Credential{}
				}
				cmd.SysProcAttr.Credential.Gid = uint32(gid)
			}
		}
	}
}

func (e *TaskExecutor) buildShellCommand() *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.CommandContext(e.ctx, "cmd", "/C", e.task.Command)
	}
	return exec.CommandContext(e.ctx, "bash", "-c", e.task.Command)
}

func (e *TaskExecutor) buildPythonCommand() *exec.Cmd {
	args := []string{"-c", e.task.Command}
	for k, v := range e.task.Parameters {
		args = append(args, fmt.Sprintf("--%s=%s", k, v))
	}
	return exec.CommandContext(e.ctx, "python", args...)
}

func (e *TaskExecutor) buildDockerCommand() *exec.Cmd {
	image := e.task.Parameters["image"]
	if image == "" {
		image = "alpine:latest"
	}

	args := []string{"run", "--rm"}

	if e.task.ReadOnlyRootfs {
		args = append(args, "--read-only")
	}

	if e.task.NetworkMode != "" {
		args = append(args, "--network", e.task.NetworkMode)
	} else {
		args = append(args, "--network", "none")
	}

	for _, cap := range e.task.CapAdd {
		args = append(args, "--cap-add", cap)
	}

	for _, cap := range e.task.CapDrop {
		args = append(args, "--cap-drop", cap)
	}

	for _, opt := range e.task.SecurityOpt {
		args = append(args, "--security-opt", opt)
	}

	if e.task.RunAsUser != "" {
		userArg := e.task.RunAsUser
		if e.task.RunAsGroup != "" {
			userArg = fmt.Sprintf("%s:%s", e.task.RunAsUser, e.task.RunAsGroup)
		}
		args = append(args, "--user", userArg)
	}

	for k, v := range e.task.Environment {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}

	if e.task.ResourceQuota != nil {
		if e.task.ResourceQuota.MemoryLimitBytes > 0 {
			args = append(args, "-m", fmt.Sprintf("%db", e.task.ResourceQuota.MemoryLimitBytes))
		}
		if e.task.ResourceQuota.CpuLimit > 0 {
			args = append(args, "--cpus", fmt.Sprintf("%.2f", e.task.ResourceQuota.CpuLimit))
		}
		if e.task.ResourceQuota.CpuShares > 0 {
			args = append(args, "--cpu-shares", fmt.Sprintf("%d", e.task.ResourceQuota.CpuShares))
		}
		if e.task.ResourceQuota.PidsLimit > 0 {
			args = append(args, "--pids-limit", fmt.Sprintf("%d", e.task.ResourceQuota.PidsLimit))
		}
	}

	for k, v := range e.task.Parameters {
		switch k {
		case "image":
		case "memory", "cpu", "cpu-shares", "pids-limit":
		default:
			args = append(args, fmt.Sprintf("--%s=%s", k, v))
		}
	}

	args = append(args, image)

	if e.task.Command != "" {
		if runtime.GOOS == "windows" {
			args = append(args, "cmd", "/C", e.task.Command)
		} else {
			args = append(args, "sh", "-c", e.task.Command)
		}
	}

	return exec.CommandContext(e.ctx, "docker", args...)
}

func (e *TaskExecutor) streamLogs(pipe io.ReadCloser, isStderr bool, wg *sync.WaitGroup) {
	defer wg.Done()
	defer pipe.Close()

	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		now := time.Now().Unix()

		if isStderr {
			e.stderrBuf.WriteString(line + "\n")
		} else {
			e.stdoutBuf.WriteString(line + "\n")
		}

		if e.logCb != nil {
			e.logCb(line, isStderr, now)
		}
	}
}

func (e *TaskExecutor) buildResult(status pb.TaskStatus, exitCode int32, errorMsg string, startTime int64) *pb.TaskResult {
	e.resourceMu.Lock()
	usage := *e.resourceUsage
	e.resourceMu.Unlock()

	return &pb.TaskResult{
		TaskId:        e.task.Id,
		Status:        status,
		ExitCode:      exitCode,
		ErrorMessage:  errorMsg,
		StartTime:     startTime,
		EndTime:       time.Now().Unix(),
		ResourceUsage: &usage,
	}
}

func (e *TaskExecutor) GetStdout() string {
	return e.stdoutBuf.String()
}

func (e *TaskExecutor) GetStderr() string {
	return e.stderrBuf.String()
}

func (e *TaskExecutor) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running
}

func (e *TaskExecutor) GetResourceUsage() *pb.ResourceUsage {
	e.resourceMu.Lock()
	defer e.resourceMu.Unlock()
	usage := *e.resourceUsage
	return &usage
}
