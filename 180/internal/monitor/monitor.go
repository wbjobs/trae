package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerStats struct {
	ID        string
	Name      string
	CPUPercent float64
	MemUsage  uint64
	MemLimit  uint64
	MemPercent float64
	NetInput  uint64
	NetOutput uint64
	BlockInput  uint64
	BlockOutput uint64
	PIDs      uint64
	Running   bool
}

type ContainerInfo struct {
	ID      string
	Name    string
	Image   string
	Status  string
	Running bool
}

type ContainerResources struct {
	CPUShares int64
	Memory    int64
}

type Monitor struct {
	cli *client.Client
}

func NewMonitor() (*Monitor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}
	return &Monitor{cli: cli}, nil
}

func (m *Monitor) ListContainers(ctx context.Context) ([]ContainerInfo, error) {
	containers, err := m.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	var result []ContainerInfo
	for _, c := range containers {
		name := strings.TrimPrefix(c.Names[0], "/")
		result = append(result, ContainerInfo{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			Running: c.State == "running",
		})
	}
	return result, nil
}

func (m *Monitor) GetContainerStats(ctx context.Context, containerID string) (*ContainerStats, error) {
	stats, err := m.cli.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	return parseStats(stats.Body, containerID)
}

func (m *Monitor) GetAllContainerStats(ctx context.Context) ([]ContainerStats, error) {
	containers, err := m.ListContainers(ctx)
	if err != nil {
		return nil, err
	}

	var result []ContainerStats
	for _, c := range containers {
		if !c.Running {
			result = append(result, ContainerStats{
				ID:      c.ID,
				Name:    c.Name,
				Running: false,
			})
			continue
		}

		stats, err := m.GetContainerStats(ctx, c.ID)
		if err != nil {
			result = append(result, ContainerStats{
				ID:      c.ID,
				Name:    c.Name,
				Running: true,
			})
			continue
		}
		stats.Name = c.Name
		stats.Running = true
		result = append(result, *stats)
	}
	return result, nil
}

func (m *Monitor) GetContainerResources(ctx context.Context, containerID string) (*ContainerResources, error) {
	inspect, err := m.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container: %w", err)
	}

	resources := &ContainerResources{
		CPUShares: inspect.HostConfig.CPUShares,
		Memory:    inspect.HostConfig.Memory,
	}

	return resources, nil
}

func (m *Monitor) UpdateContainerResources(ctx context.Context, containerID string, resources ContainerResources) error {
	updateConfig := container.UpdateConfig{
		CPUShares: resources.CPUShares,
		Memory:    resources.Memory,
	}

	_, err := m.cli.ContainerUpdate(ctx, containerID, updateConfig)
	if err != nil {
		return fmt.Errorf("failed to update container: %w", err)
	}

	return nil
}

func (m *Monitor) StreamContainerLogs(ctx context.Context, containerID string, tail string, since string) (<-chan string, <-chan error) {
	logsCh := make(chan string, 100)
	errCh := make(chan error, 1)

	go func() {
		defer close(logsCh)
		defer close(errCh)

		reader, err := m.cli.ContainerLogs(ctx, containerID, container.LogsOptions{
			ShowStdout: true,
			ShowStderr: true,
			Follow:     true,
			Tail:       tail,
			Since:      since,
		})
		if err != nil {
			errCh <- err
			return
		}

		closeCh := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				reader.Close()
			case <-closeCh:
			}
		}()
		defer func() {
			close(closeCh)
			reader.Close()
		}()

		buf := make([]byte, 4096)
		var lineBuf strings.Builder

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			n, err := reader.Read(buf)
			if err != nil {
				if err != io.EOF {
					select {
					case <-ctx.Done():
						return
					default:
						errCh <- err
					}
				}
				return
			}

			chunk := buf[:n]
			if len(chunk) > 8 {
				chunk = chunk[8:]
			}

			for _, b := range chunk {
				if b == '\n' {
					line := lineBuf.String()
					if line != "" {
						select {
						case logsCh <- line:
						case <-ctx.Done():
							return
						}
					}
					lineBuf.Reset()
				} else {
					lineBuf.WriteByte(b)
				}
			}
		}
	}()

	return logsCh, errCh
}

func (m *Monitor) StreamStats(ctx context.Context, interval time.Duration) (<-chan []ContainerStats, <-chan error) {
	statsCh := make(chan []ContainerStats)
	errCh := make(chan error, 1)

	go func() {
		defer close(statsCh)
		defer close(errCh)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				stats, err := m.GetAllContainerStats(ctx)
				if err != nil {
					errCh <- err
					continue
				}
				statsCh <- stats
			}
		}
	}()

	return statsCh, errCh
}

func (m *Monitor) Close() error {
	return m.cli.Close()
}

type dockerStatsResponse struct {
	ID      string        `json:"id"`
	Name    string        `json:"name"`
	PreCPU  cpuStats      `json:"precpu_stats"`
	CPU     cpuStats      `json:"cpu_stats"`
	Memory  memoryStats   `json:"memory_stats"`
	Networks map[string]networkStats `json:"networks"`
	BlkIO   blkioStats    `json:"blkio_stats"`
	PIDs    pidsStats     `json:"pids_stats"`
}

type cpuStats struct {
	CPUUsage       cpuUsage       `json:"cpu_usage"`
	SystemCPUUsage uint64         `json:"system_cpu_usage"`
	OnlineCPUs     uint32         `json:"online_cpus"`
}

type cpuUsage struct {
	TotalUsage        uint64            `json:"total_usage"`
	PercpuUsage       []uint64          `json:"percpu_usage"`
	UsageInKernelmode uint64            `json:"usage_in_kernelmode"`
	UsageInUsermode   uint64            `json:"usage_in_usermode"`
}

type memoryStats struct {
	Usage    uint64          `json:"usage"`
	Limit    uint64          `json:"limit"`
	MaxUsage uint64          `json:"max_usage"`
	Stats    map[string]uint64 `json:"stats"`
}

type networkStats struct {
	RxBytes uint64 `json:"rx_bytes"`
	TxBytes uint64 `json:"tx_bytes"`
}

type blkioStats struct {
	IOServiceBytesRecursive []blkioEntry `json:"io_service_bytes_recursive"`
}

type blkioEntry struct {
	Op    string `json:"op"`
	Value uint64 `json:"value"`
}

type pidsStats struct {
	Current uint64 `json:"current"`
}

func parseStats(body io.Reader, containerID string) (*ContainerStats, error) {
	var stats dockerStatsResponse
	if err := json.NewDecoder(body).Decode(&stats); err != nil {
		return nil, err
	}

	cpuPercent := calculateCPUPercent(&stats.PreCPU, &stats.CPU)
	memPercent := float64(0)
	memUsage := stats.Memory.Usage
	memLimit := stats.Memory.Limit
	if memLimit > 0 {
		memPercent = float64(memUsage) / float64(memLimit) * 100
	}

	var netInput, netOutput uint64
	for _, n := range stats.Networks {
		netInput += n.RxBytes
		netOutput += n.TxBytes
	}

	var blockInput, blockOutput uint64
	for _, b := range stats.BlkIO.IOServiceBytesRecursive {
		if b.Op == "Read" {
			blockInput += b.Value
		} else if b.Op == "Write" {
			blockOutput += b.Value
		}
	}

	return &ContainerStats{
		ID:          containerID,
		CPUPercent:  cpuPercent,
		MemUsage:    memUsage,
		MemLimit:    memLimit,
		MemPercent:  memPercent,
		NetInput:    netInput,
		NetOutput:   netOutput,
		BlockInput:  blockInput,
		BlockOutput: blockOutput,
		PIDs:        stats.PIDs.Current,
	}, nil
}

func calculateCPUPercent(previousCPU, currentCPU *cpuStats) float64 {
	cpuPercent := 0.0
	cpuDelta := float64(currentCPU.CPUUsage.TotalUsage) - float64(previousCPU.CPUUsage.TotalUsage)
	systemDelta := float64(currentCPU.SystemCPUUsage) - float64(previousCPU.SystemCPUUsage)

	if systemDelta > 0 && cpuDelta > 0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(currentCPU.OnlineCPUs) * 100
	}
	return cpuPercent
}
