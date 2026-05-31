//go:build darwin

package executor

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"

	pb "github.com/distributed-scheduler/worker/proto"
)

type DarwinIsolation struct {
	taskID string
	quota  *pb.ResourceQuota
	mu     sync.Mutex
	setup  bool
}

func NewDarwinIsolation(task *pb.Task) *DarwinIsolation {
	return &DarwinIsolation{
		taskID: task.Id,
		quota:  task.ResourceQuota,
	}
}

func (d *DarwinIsolation) Setup(taskID string, quota *pb.ResourceQuota) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.setup = true
	return nil
}

func (d *DarwinIsolation) Apply(cmd *exec.Cmd) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.setup {
		return nil
	}

	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}

	if d.quota.MemoryLimitBytes > 0 {
		if cmd.Env == nil {
			cmd.Env = os.Environ()
		}
		cmd.Env = append(cmd.Env, fmt.Sprintf("MallocMemoryLimit=%d", d.quota.MemoryLimitBytes))
	}

	return nil
}

func (d *DarwinIsolation) Usage() (*pb.ResourceUsage, error) {
	return &pb.ResourceUsage{}, nil
}

func (d *DarwinIsolation) Cleanup() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.setup = false
	return nil
}

func setRlimit(cmd *exec.Cmd, resource int, limit uint64) error {
	var rLimit syscall.Rlimit
	rLimit.Max = limit
	rLimit.Cur = limit
	return syscall.Setrlimit(resource, &rLimit)
}
