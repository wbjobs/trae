package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerStatus struct {
	ID        string
	Name      string
	Service   string
	State     string
	Status    string
	Image     string
	Running   bool
	CreatedAt string
	IP        string
	Exited    int
}

type ContainerStats struct {
	CPUPercent    float64
	MemUsage      uint64
	MemLimit      uint64
	MemPercent    float64
	NetInput      uint64
	NetOutput     uint64
	BlockInput    uint64
	BlockOutput   uint64
	Timestamp     time.Time
}

type DockerClient struct {
	cli *client.Client
	ctx context.Context
}

type statsJSON struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage        uint64            `json:"total_usage"`
			PercpuUsage       []uint64          `json:"percpu_usage"`
			UsageInKernelmode uint64            `json:"usage_in_kernelmode"`
			UsageInUsermode   uint64            `json:"usage_in_usermode"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
		ThrottlingData struct {
			Periods          uint64 `json:"periods"`
			ThrottledPeriods uint64 `json:"throttled_periods"`
			ThrottledTime    uint64 `json:"throttled_time"`
		} `json:"throttling_data"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage    uint64 `json:"usage"`
		MaxUsage uint64 `json:"max_usage"`
		Limit    uint64 `json:"limit"`
		Stats    struct {
			Cache uint64 `json:"cache"`
		} `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IoServiceBytesRecursive []struct {
			Major uint64 `json:"major"`
			Minor uint64 `json:"minor"`
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}

func NewDockerClient() (*DockerClient, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("创建 Docker 客户端失败: %w", err)
	}

	ctx := context.Background()
	_, err = cli.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf("无法连接到 Docker daemon: %w", err)
	}

	return &DockerClient{cli: cli, ctx: ctx}, nil
}

func (dc *DockerClient) Close() error {
	return dc.cli.Close()
}

func (dc *DockerClient) ListContainers(projectName string, services []string) ([]ContainerStatus, error) {
	var result []ContainerStatus

	containers, err := dc.cli.ContainerList(dc.ctx, container.ListOptions{
		All: true,
	})
	if err != nil {
		return nil, fmt.Errorf("列出容器失败: %w", err)
	}

	serviceSet := make(map[string]bool)
	for _, s := range services {
		serviceSet[s] = true
	}

	for _, c := range containers {
		svcName := extractServiceName(c, projectName)
		if svcName == "" || !serviceSet[svcName] {
			continue
		}

		ip := ""
		for _, n := range c.NetworkSettings.Networks {
			ip = n.IPAddress
			break
		}

		status := ContainerStatus{
			ID:        c.ID[:12],
			Name:      strings.TrimPrefix(c.Names[0], "/"),
			Service:   svcName,
			State:     c.State,
			Status:    c.Status,
			Image:     c.Image,
			Running:   c.State == "running",
			CreatedAt: time.Unix(c.Created, 0).Format("2006-01-02 15:04:05"),
			IP:        ip,
		}
		result = append(result, status)
	}

	return result, nil
}

func extractServiceName(c types.Container, projectName string) string {
	for _, name := range c.Names {
		name = strings.TrimPrefix(name, "/")
		if strings.HasPrefix(name, projectName+"-") {
			parts := strings.SplitN(name[len(projectName)+1:], "-", 2)
			if len(parts) > 0 {
				return parts[0]
			}
		}
	}
	for _, name := range c.Names {
		name = strings.TrimPrefix(name, "/")
		if strings.HasPrefix(name, projectName+"_") {
			parts := strings.SplitN(name[len(projectName)+1:], "_", 2)
			if len(parts) > 0 {
				return parts[0]
			}
		}
	}
	return ""
}

func (dc *DockerClient) StartContainer(containerID string) error {
	return dc.cli.ContainerStart(dc.ctx, containerID, container.StartOptions{})
}

func (dc *DockerClient) StopContainer(containerID string) error {
	timeout := 10 * time.Second
	return dc.cli.ContainerStop(dc.ctx, containerID, container.StopOptions{
		Timeout: &timeout,
	})
}

func (dc *DockerClient) RestartContainer(containerID string) error {
	timeout := 10 * time.Second
	return dc.cli.ContainerRestart(dc.ctx, containerID, container.StopOptions{
		Timeout: &timeout,
	})
}

func (dc *DockerClient) GetContainerLogs(containerID string, tailLines int) (<-chan string, error) {
	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       fmt.Sprintf("%d", tailLines),
	}

	reader, err := dc.cli.ContainerLogs(dc.ctx, containerID, options)
	if err != nil {
		return nil, fmt.Errorf("获取日志失败: %w", err)
	}

	logChan := make(chan string, 200)
	go func() {
		defer reader.Close()
		defer close(logChan)

		header := make([]byte, 8)
		buf := make([]byte, 8192)
		for {
			_, err := io.ReadFull(reader, header)
			if err != nil {
				return
			}

			size := uint32(header[4])<<24 | uint32(header[5])<<16 | uint32(header[6])<<8 | uint32(header[7])
			if size == 0 || size > 65536 {
				continue
			}

			frame := make([]byte, size)
			_, err = io.ReadFull(reader, frame)
			if err != nil {
				return
			}

			line := strings.TrimRight(string(frame), "\r\n")
			if line != "" {
				select {
				case logChan <- line:
				default:
				}
			}
		}
	}()

	return logChan, nil
}

func (dc *DockerClient) GetContainerStats(containerID string) (<-chan ContainerStats, error) {
	stats, err := dc.cli.ContainerStats(dc.ctx, containerID, true)
	if err != nil {
		return nil, fmt.Errorf("获取统计信息失败: %w", err)
	}

	statsChan := make(chan ContainerStats, 10)
	go func() {
		defer stats.Body.Close()
		defer close(statsChan)

		decoder := json.NewDecoder(stats.Body)
		for {
			var s statsJSON
			if err := decoder.Decode(&s); err != nil {
				if err == io.EOF {
					return
				}
				return
			}

			cpuPercent := calculateCPUPercent(s)
			memPercent := calculateMemPercent(s)
			netInput, netOutput := calculateNetwork(s)
			blockInput, blockOutput := calculateBlockIO(s)

			cs := ContainerStats{
				CPUPercent:  cpuPercent,
				MemUsage:    s.MemoryStats.Usage,
				MemLimit:    s.MemoryStats.Limit,
				MemPercent:  memPercent,
				NetInput:    netInput,
				NetOutput:   netOutput,
				BlockInput:  blockInput,
				BlockOutput: blockOutput,
				Timestamp:   time.Now(),
			}
			select {
			case statsChan <- cs:
			default:
			}
		}
	}()

	return statsChan, nil
}

func (dc *DockerClient) GetContainerStatsOnce(containerID string) (*ContainerStats, error) {
	stats, err := dc.cli.ContainerStats(dc.ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	var s statsJSON
	if err := json.NewDecoder(stats.Body).Decode(&s); err != nil {
		return nil, err
	}

	cpuPercent := calculateCPUPercent(s)
	memPercent := calculateMemPercent(s)
	netInput, netOutput := calculateNetwork(s)
	blockInput, blockOutput := calculateBlockIO(s)

	return &ContainerStats{
		CPUPercent:  cpuPercent,
		MemUsage:    s.MemoryStats.Usage,
		MemLimit:    s.MemoryStats.Limit,
		MemPercent:  memPercent,
		NetInput:    netInput,
		NetOutput:   netOutput,
		BlockInput:  blockInput,
		BlockOutput: blockOutput,
		Timestamp:   time.Now(),
	}, nil
}

func (dc *DockerClient) GetAllContainerStats(containerIDs []string) (map[string]*ContainerStats, error) {
	result := make(map[string]*ContainerStats)
	for _, id := range containerIDs {
		stats, err := dc.GetContainerStatsOnce(id)
		if err == nil {
			result[id] = stats
		}
	}
	return result, nil
}

func calculateCPUPercent(s statsJSON) float64 {
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage - s.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(s.CPUStats.SystemCPUUsage - s.PreCPUStats.SystemCPUUsage)
	onlineCPUs := float64(s.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if systemDelta > 0.0 && cpuDelta > 0.0 {
		return (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}
	return 0.0
}

func calculateMemPercent(s statsJSON) float64 {
	if s.MemoryStats.Limit > 0 {
		return float64(s.MemoryStats.Usage) / float64(s.MemoryStats.Limit) * 100.0
	}
	return 0.0
}

func calculateNetwork(s statsJSON) (uint64, uint64) {
	var rx, tx uint64
	for _, n := range s.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}
	return rx, tx
}

func calculateBlockIO(s statsJSON) (uint64, uint64) {
	var read, write uint64
	for _, entry := range s.BlkioStats.IoServiceBytesRecursive {
		switch entry.Op {
		case "Read":
			read += entry.Value
		case "Write":
			write += entry.Value
		}
	}
	return read, write
}

func (dc *DockerClient) InspectContainer(containerID string) (string, error) {
	info, err := dc.cli.ContainerInspect(dc.ctx, containerID)
	if err != nil {
		return "", err
	}
	return info.Name, nil
}
