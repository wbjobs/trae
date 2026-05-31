package ui

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00BFFF")).
			Padding(0, 1)

	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FFFFFF")).
			Background(lipgloss.Color("#333333")).
			Padding(0, 1)

	headerActiveStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#000000")).
				Background(lipgloss.Color("#00BFFF")).
				Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#000000")).
			Background(lipgloss.Color("#444444")).
			Padding(0, 1)

	normalStyle = lipgloss.NewStyle().
			Padding(0, 1)

	stoppedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#666666")).
			Padding(0, 1)

	runningStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00FF00"))

	stoppedIndicatorStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#FF6600"))

	cpuHighStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF4444"))

	cpuMedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFAA00"))

	cpuLowStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00FF00"))

	memHighStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF4444"))

	memMedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFAA00"))

	memLowStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00FF00"))

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("#333333"))

	statusBarStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#808080")).
			Background(lipgloss.Color("#1a1a1a"))

	filterActiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#FFFF00"))
)

type columnDef struct {
	title    string
	key      string
	width    int
	sortable bool
}

func getColumns() []columnDef {
	return []columnDef{
		{title: "状态", key: "status", width: 12, sortable: false},
		{title: "容器名", key: "name", width: 25, sortable: true},
		{title: "CPU", key: "cpu", width: 10, sortable: true},
		{title: "内存 / 使用率", key: "mem", width: 25, sortable: true},
		{title: "网络 IO", key: "net", width: 25, sortable: true},
		{title: "磁盘 IO", key: "blk", width: 25, sortable: true},
		{title: "PIDs", key: "pids", width: 8, sortable: false},
	}
}

func (m *Model) tableView() string {
	cols := getColumns()

	var sb interface{} = &stringBuilder{}
	b := sb.(*stringBuilder)

	b.writeString(titleStyle.Render("🐳 Docker Container Monitor"))
	b.writeString("\n\n")

	if m.successMsg != "" {
		b.writeString(lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00FF00")).
			Render("✓ " + m.successMsg))
		b.writeString("\n\n")
	}

	if m.filterActive {
		b.writeString(filterActiveStyle.Render("🔍 过滤: " + m.filterInput.View())
	} else {
		b.writeString(statusBarStyle.Render(fmt.Sprintf("按 / 过滤 | 按 1-3 排序 | 按 Enter 查看日志 | 按 e 编辑资源 | 按 q 退出 | 共 %d 个容器", len(m.filteredRows))))
	}
	b.writeString("\n\n")

	header := m.renderHeader(cols)
	b.writeString(header)
	b.writeString("\n")

	body := m.renderBody(cols)
	b.writeString(body)

	if m.errMsg != "" {
		b.writeString("\n\n")
		b.writeString(lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF4444")).
			Render(m.errMsg))
	}

	b.writeString("\n\n")
	b.writeString(m.help.View(m.keys))

	return b.String()
}

func (m *Model) renderHeader(cols []columnDef) string {
	var headers []string

	for _, col := range cols {
		header := headerStyle.Render(col.title)

		if col.sortable {
			colKey := col.key
			if m.isColumnActive(colKey) {
				arrow := "↓"
				if m.sortDir == SortAsc {
					arrow = "↑"
				}
				header = headerActiveStyle.Render(col.title + " " + arrow)
			}
		}

		headers = append(headers, header)
	}

	return lipgloss.JoinHorizontal(lipgloss.Top, headers...)
}

func (m *Model) isColumnActive(colKey string) bool {
	switch colKey {
	case "name":
		return m.sortColumn == SortName
	case "cpu":
		return m.sortColumn == SortCPU
	case "mem":
		return m.sortColumn == SortMemory
	case "net":
		return m.sortColumn == SortNetIO
	case "blk":
		return m.sortColumn == SortBlockIO
	}
	return false
}

func (m *Model) renderBody(cols []columnDef) string {
	if len(m.filteredRows) == 0 {
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("#808080")).
			Padding(1, 2).
			Render("没有匹配的容器")
	}

	var rows []string

	for i, row := range m.filteredRows {
		isSelected := i == m.selectedRow
		rowStr := m.renderRow(cols, row, isSelected)
		rows = append(rows, rowStr)
	}

	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func (m *Model) renderRow(cols []columnDef, row ContainerRow, selected bool) string {
	var cells []string

	status := m.formatStatus(row)
	name := m.formatName(row)
	cpu := m.formatCPU(row)
	mem := m.formatMem(row)
	net := m.formatNet(row)
	blk := m.formatBlk(row)
	pids := m.formatPIDs(row)

	values := []string{status, name, cpu, mem, net, blk, pids}

	for i, val := range values {
		cell := val
		if selected {
			cell = selectedStyle.Render(val)
		}
		cells = append(cells, cell)
	}

	return lipgloss.JoinHorizontal(lipgloss.Top, cells...)
}

func (m *Model) formatStatus(row ContainerRow) string {
	if row.Running {
		return runningStyle.Render("●") + " Running"
	}
	return stoppedIndicatorStyle.Render("○") + " Stopped"
}

func (m *Model) formatName(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render(row.Name)
	}
	return normalStyle.Render(row.Name)
}

func (m *Model) formatCPU(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render("-")
	}
	str := fmt.Sprintf("%.2f%%", row.CPUPercent)
	if row.CPUPercent > 75 {
		return cpuHighStyle.Render(str)
	} else if row.CPUPercent > 50 {
		return cpuMedStyle.Render(str)
	}
	return cpuLowStyle.Render(str)
}

func (m *Model) formatMem(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render("-")
	}
	usage := formatBytes(row.MemUsage)
	percent := fmt.Sprintf("%.2f%%", row.MemPercent)
	str := fmt.Sprintf("%s / %s", usage, percent)
	if row.MemPercent > 75 {
		return memHighStyle.Render(str)
	} else if row.MemPercent > 50 {
		return memMedStyle.Render(str)
	}
	return memLowStyle.Render(str)
}

func (m *Model) formatNet(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render("-")
	}
	return fmt.Sprintf("↓ %s ↑ %s",
		formatBytes(row.NetInput),
		formatBytes(row.NetOutput))
}

func (m *Model) formatBlk(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render("-")
	}
	return fmt.Sprintf("↓ %s ↑ %s",
		formatBytes(row.BlockInput),
		formatBytes(row.BlockOutput))
}

func (m *Model) formatPIDs(row ContainerRow) string {
	if !row.Running {
		return stoppedStyle.Render("-")
	}
	return fmt.Sprintf("%d", row.PIDs)
}

type stringBuilder struct {
	buf []byte
}

func (b *stringBuilder) writeString(s string) {
	b.buf = append(b.buf, s...)
}

func (b *stringBuilder) String() string {
	return string(b.buf)
}
