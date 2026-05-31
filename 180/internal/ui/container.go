package ui

import (
	"fmt"
	"strings"

	"docker-monitor/internal/monitor"
)

type SortColumn int

const (
	SortName SortColumn = iota
	SortCPU
	SortMemory
	SortNetIO
	SortBlockIO
)

type SortDirection int

const (
	SortAsc SortDirection = iota
	SortDesc
)

type ContainerRow struct {
	ID         string
	Name       string
	CPUPercent float64
	MemUsage   uint64
	MemLimit   uint64
	MemPercent float64
	NetInput   uint64
	NetOutput  uint64
	BlockInput uint64
	BlockOutput uint64
	PIDs       uint64
	Running    bool
}

func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func formatBytesPerSec(bytes uint64) string {
	return formatBytes(bytes) + "/s"
}

func NewContainerRow(stats monitor.ContainerStats) ContainerRow {
	return ContainerRow{
		ID:          stats.ID,
		Name:        stats.Name,
		CPUPercent:  stats.CPUPercent,
		MemUsage:    stats.MemUsage,
		MemLimit:    stats.MemLimit,
		MemPercent:  stats.MemPercent,
		NetInput:    stats.NetInput,
		NetOutput:   stats.NetOutput,
		BlockInput:  stats.BlockInput,
		BlockOutput: stats.BlockOutput,
		PIDs:        stats.PIDs,
		Running:     stats.Running,
	}
}

func NewContainerRows(stats []monitor.ContainerStats) []ContainerRow {
	rows := make([]ContainerRow, len(stats))
	for i, s := range stats {
		rows[i] = NewContainerRow(s)
	}
	return rows
}

func (r ContainerRow) CPUStr() string {
	if !r.Running {
		return "-"
	}
	return fmt.Sprintf("%.2f%%", r.CPUPercent)
}

func (r ContainerRow) MemStr() string {
	if !r.Running {
		return "-"
	}
	return fmt.Sprintf("%s / %.2f%%", formatBytes(r.MemUsage), r.MemPercent)
}

func (r ContainerRow) NetIOStr() string {
	if !r.Running {
		return "-"
	}
	return fmt.Sprintf("↑ %s ↓ %s", formatBytes(r.NetOutput), formatBytes(r.NetInput))
}

func (r ContainerRow) BlockIOStr() string {
	if !r.Running {
		return "-"
	}
	return fmt.Sprintf("↑ %s ↓ %s", formatBytes(r.BlockOutput), formatBytes(r.BlockInput))
}

func (r ContainerRow) StatusStr() string {
	if r.Running {
		return "● Running"
	}
	return "○ Stopped"
}

func FilterRows(rows []ContainerRow, filter string) []ContainerRow {
	if filter == "" {
		return rows
	}
	filter = strings.ToLower(filter)
	var filtered []ContainerRow
	for _, r := range rows {
		if strings.Contains(strings.ToLower(r.Name), filter) {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

func SortRows(rows []ContainerRow, column SortColumn, direction SortDirection) []ContainerRow {
	sorted := make([]ContainerRow, len(rows))
	copy(sorted, rows)

	less := func(i, j int) bool {
		switch column {
		case SortName:
			if direction == SortAsc {
				return sorted[i].Name < sorted[j].Name
			}
			return sorted[i].Name > sorted[j].Name
		case SortCPU:
			if direction == SortAsc {
				return sorted[i].CPUPercent < sorted[j].CPUPercent
			}
			return sorted[i].CPUPercent > sorted[j].CPUPercent
		case SortMemory:
			if direction == SortAsc {
				return sorted[i].MemPercent < sorted[j].MemPercent
			}
			return sorted[i].MemPercent > sorted[j].MemPercent
		case SortNetIO:
			netI := sorted[i].NetInput + sorted[i].NetOutput
			netJ := sorted[j].NetInput + sorted[j].NetOutput
			if direction == SortAsc {
				return netI < netJ
			}
			return netI > netJ
		case SortBlockIO:
			blockI := sorted[i].BlockInput + sorted[i].BlockOutput
			blockJ := sorted[j].BlockInput + sorted[j].BlockOutput
			if direction == SortAsc {
				return blockI < blockJ
			}
			return blockI > blockJ
		default:
			return false
		}
	}

	sortBy(sorted, less)
	return sorted
}

func sortBy(rows []ContainerRow, less func(i, j int) bool) {
	n := len(rows)
	for i := 0; i < n-1; i++ {
		for j := 0; j < n-i-1; j++ {
			if !less(j, j+1) {
				rows[j], rows[j+1] = rows[j+1], rows[j]
			}
		}
	}
}
