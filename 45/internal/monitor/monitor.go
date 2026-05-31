package monitor

import (
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	pb "github.com/distributed-scheduler/worker/proto"
)

type ResourceMonitor struct {
	runningTasks int32
}

func NewResourceMonitor() *ResourceMonitor {
	return &ResourceMonitor{}
}

func (m *ResourceMonitor) SetRunningTasks(count int32) {
	m.runningTasks = count
}

func (m *ResourceMonitor) GetResourceUsage() (*pb.NodeResource, error) {
	cpuPercent, err := getCPUUsage()
	if err != nil {
		return nil, err
	}

	memoryInfo, err := getMemoryUsage()
	if err != nil {
		return nil, err
	}

	diskInfo, err := getDiskUsage()
	if err != nil {
		return nil, err
	}

	return &pb.NodeResource{
		CpuUsage:     cpuPercent,
		MemoryUsage:  memoryInfo.usedPercent,
		MemoryTotal:  memoryInfo.total,
		MemoryUsed:   memoryInfo.used,
		DiskUsage:    diskInfo.usedPercent,
		DiskTotal:    diskInfo.total,
		DiskUsed:     diskInfo.used,
		RunningTasks: m.runningTasks,
		Timestamp:    time.Now().Unix(),
	}, nil
}

type memoryStats struct {
	total       float64
	used        float64
	usedPercent float64
}

type diskStats struct {
	total       float64
	used        float64
	usedPercent float64
}

func getCPUUsage() (float64, error) {
	percents, err := cpu.Percent(1*time.Second, false)
	if err != nil {
		return 0, err
	}
	if len(percents) > 0 {
		return percents[0], nil
	}
	return 0, nil
}

func getMemoryUsage() (*memoryStats, error) {
	vm, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}

	return &memoryStats{
		total:       float64(vm.Total) / 1024 / 1024 / 1024,
		used:        float64(vm.Used) / 1024 / 1024 / 1024,
		usedPercent: vm.UsedPercent,
	}, nil
}

func getDiskUsage() (*diskStats, error) {
	parts, err := disk.Partitions(false)
	if err != nil {
		return nil, err
	}

	var totalDisk, usedDisk uint64
	for _, part := range parts {
		usage, err := disk.Usage(part.Mountpoint)
		if err != nil {
			continue
		}
		totalDisk += usage.Total
		usedDisk += usage.Used
	}

	var usedPercent float64
	if totalDisk > 0 {
		usedPercent = float64(usedDisk) / float64(totalDisk) * 100
	}

	return &diskStats{
		total:       float64(totalDisk) / 1024 / 1024 / 1024,
		used:        float64(usedDisk) / 1024 / 1024 / 1024,
		usedPercent: usedPercent,
	}, nil
}
