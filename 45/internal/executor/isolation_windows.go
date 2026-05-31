//go:build windows

package executor

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"unsafe"

	pb "github.com/distributed-scheduler/worker/proto"
)

type WindowsJobIsolation struct {
	taskID string
	quota  *pb.ResourceQuota
	jobHandle syscall.Handle
	mu     sync.Mutex
	setup  bool
}

func NewWindowsJobIsolation(task *pb.Task) *WindowsJobIsolation {
	return &WindowsJobIsolation{
		taskID: task.Id,
		quota:  task.ResourceQuota,
	}
}

func (j *WindowsJobIsolation) Setup(taskID string, quota *pb.ResourceQuota) error {
	j.mu.Lock()
	defer j.mu.Unlock()

	if j.setup {
		return nil
	}

	jobHandle, err := syscall.CreateJobObject(nil, nil)
	if err != nil {
		return fmt.Errorf("create job object: %w", err)
	}

	var info syscall.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	info.BasicLimitInformation.LimitFlags = syscall.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

	if quota.MemoryLimitBytes > 0 {
		info.BasicLimitInformation.LimitFlags |= syscall.JOB_OBJECT_LIMIT_PROCESS_MEMORY
		info.ProcessMemoryLimit = uintptr(quota.MemoryLimitBytes)
	}

	if quota.PidsLimit > 0 {
		info.BasicLimitInformation.LimitFlags |= syscall.JOB_OBJECT_LIMIT_ACTIVE_PROCESS
		info.BasicLimitInformation.ActiveProcessLimit = uint32(quota.PidsLimit)
	}

	infoPtr := unsafe.Pointer(&info)
	infoSize := uint32(unsafe.Sizeof(info))

	if err := syscall.SetInformationJobObject(
		jobHandle,
		syscall.JobObjectExtendedLimitInformation,
		infoPtr,
		infoSize,
	); err != nil {
		syscall.CloseHandle(jobHandle)
		return fmt.Errorf("set job object limits: %w", err)
	}

	j.jobHandle = jobHandle
	j.setup = true
	return nil
}

func (j *WindowsJobIsolation) Apply(cmd *exec.Cmd) error {
	j.mu.Lock()
	defer j.mu.Unlock()

	if !j.setup {
		return nil
	}

	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}

	cmd.SysProcAttr.CreationFlags |= syscall.CREATE_SUSPENDED

	if cmd.Process != nil {
		processHandle, err := syscall.OpenProcess(
			syscall.PROCESS_ALL_ACCESS,
			false,
			uint32(cmd.Process.Pid),
		)
		if err != nil {
			return fmt.Errorf("open process: %w", err)
		}
		defer syscall.CloseHandle(processHandle)

		if err := syscall.AssignProcessToJobObject(j.jobHandle, processHandle); err != nil {
			return fmt.Errorf("assign to job object: %w", err)
		}
	}

	return nil
}

func (j *WindowsJobIsolation) Usage() (*pb.ResourceUsage, error) {
	return &pb.ResourceUsage{}, nil
}

func (j *WindowsJobIsolation) Cleanup() error {
	j.mu.Lock()
	defer j.mu.Unlock()

	if !j.setup {
		return nil
	}

	if err := syscall.TerminateJobObject(j.jobHandle, 1); err != nil {
		return fmt.Errorf("terminate job object: %w", err)
	}

	if err := syscall.CloseHandle(j.jobHandle); err != nil {
		return fmt.Errorf("close job object: %w", err)
	}

	j.setup = false
	return nil
}
