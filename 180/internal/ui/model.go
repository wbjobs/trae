package ui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"docker-monitor/internal/monitor"
)

type ViewMode int

const (
	ViewTable ViewMode = iota
	ViewLogs
	ViewEdit
)

type EditField int

const (
	EditCPUShares EditField = iota
	EditMemory
)

type StatsUpdateMsg []monitor.ContainerStats
type LogLineMsg string
type LogErrorMsg error
type ErrorMsg error
type tickMsg time.Time
type ResourcesLoadedMsg monitor.ContainerResources
type ResourcesUpdatedMsg struct{}
type ResourcesUpdateErrorMsg error

type KeyMap struct {
	Up       key.Binding
	Down     key.Binding
	Filter   key.Binding
	Logs     key.Binding
	Edit     key.Binding
	Exit     key.Binding
	SortCPU  key.Binding
	SortMem  key.Binding
	SortName key.Binding
	Apply    key.Binding
	NextField key.Binding
}

var DefaultKeyMap = KeyMap{
	Up: key.NewBinding(
		key.WithKeys("up", "k"),
		key.WithHelp("↑/k", "上一行"),
	),
	Down: key.NewBinding(
		key.WithKeys("down", "j"),
		key.WithHelp("↓/j", "下一行"),
	),
	Filter: key.NewBinding(
		key.WithKeys("/"),
		key.WithHelp("/", "过滤容器"),
	),
	Logs: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("Enter", "查看日志"),
	),
	Edit: key.NewBinding(
		key.WithKeys("e"),
		key.WithHelp("e", "编辑资源"),
	),
	Exit: key.NewBinding(
		key.WithKeys("q", "esc"),
		key.WithHelp("q/esc", "退出"),
	),
	SortCPU: key.NewBinding(
		key.WithKeys("1"),
		key.WithHelp("1", "CPU排序"),
	),
	SortMem: key.NewBinding(
		key.WithKeys("2"),
		key.WithHelp("2", "内存排序"),
	),
	SortName: key.NewBinding(
		key.WithKeys("3"),
		key.WithHelp("3", "名称排序"),
	),
	Apply: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("Enter", "应用修改"),
	),
	NextField: key.NewBinding(
		key.WithKeys("tab"),
		key.WithHelp("Tab", "下一字段"),
	),
}

func (k KeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Filter, k.Logs, k.Edit, k.Exit}
}

func (k KeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down, k.Filter, k.Logs, k.Edit},
		{k.SortCPU, k.SortMem, k.SortName},
		{k.Exit},
	}
}

type Model struct {
	monitor      *monitor.Monitor
	ctx          context.Context
	cancel       context.CancelFunc

	mode         ViewMode
	help         help.Model
	keys         KeyMap

	filterInput  textinput.Model
	filterActive bool

	rows         []ContainerRow
	filteredRows []ContainerRow
	selectedRow  int

	sortColumn   SortColumn
	sortDir      SortDirection

	logsViewport viewport.Model
	logsBuffer   []string
	logsContext  context.Context
	logsCancel   context.CancelFunc
	currentLogID string
	logsMsgCh    chan LogLineMsg
	logsErrCh    chan LogErrorMsg
	logsDoneCh   chan struct{}
	logsMu       sync.Mutex

	editContainerID string
	editField      EditField
	editCPUShares   textinput.Model
	editMemory      textinput.Model
	editOriginal   monitor.ContainerResources

	width        int
	height       int

	loading      bool
	errMsg       string
	successMsg   string
}

func NewModel(m *monitor.Monitor) *Model {
	ctx, cancel := context.WithCancel(context.Background())

	fi := textinput.New()
	fi.Placeholder = "输入容器名过滤..."
	fi.CharLimit = 50
	fi.Width = 30

	cpuInput := textinput.New()
	cpuInput.Placeholder = "CPU Shares (默认 1024)"
	cpuInput.CharLimit = 10

	memInput := textinput.New()
	memInput.Placeholder = "内存 (如 512m, 2g)"
	memInput.CharLimit = 20

	return &Model{
		monitor:      m,
		ctx:          ctx,
		cancel:       cancel,
		mode:         ViewTable,
		help:         help.New(),
		keys:         DefaultKeyMap,
		filterInput:  fi,
		editCPUShares: cpuInput,
		editMemory:   memInput,
		sortColumn:   SortCPU,
		sortDir:      SortDesc,
		loading:      true,
	}
}

func (m *Model) Init() tea.Cmd {
	return tea.Batch(
		m.fetchStatsCmd(),
		m.waitForLogs(),
	)
}

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch {
		case key.Matches(msg, m.keys.Exit):
			if m.mode == ViewLogs {
				m.stopLogStreaming()
				m.mode = ViewTable
				return m, nil
			}
			if m.mode == ViewEdit {
				m.mode = ViewTable
				return m, nil
			}
			m.cancel()
			return m, tea.Quit

		case key.Matches(msg, m.keys.Filter):
			if m.mode == ViewTable {
				m.filterActive = true
				m.filterInput.Focus()
				return m, textinput.Blink
			}

		case key.Matches(msg, m.keys.Logs):
			if m.mode == ViewTable && len(m.filteredRows) > 0 && m.filteredRows[m.selectedRow].Running {
				m.startLogStreaming(m.filteredRows[m.selectedRow].ID)
				m.mode = ViewLogs
				return m, m.waitForLogs()
			}

		case key.Matches(msg, m.keys.Edit):
			if m.mode == ViewTable && len(m.filteredRows) > 0 && m.filteredRows[m.selectedRow].Running {
				return m, m.startEditMode(m.filteredRows[m.selectedRow].ID)
			}

		case key.Matches(msg, m.keys.NextField):
			if m.mode == ViewEdit {
				m.switchEditField()
				return m, nil
			}

		case key.Matches(msg, m.keys.Apply):
			if m.mode == ViewEdit {
				return m, m.applyResourceChanges()
			}

		case key.Matches(msg, m.keys.Up):
			if m.mode == ViewTable && !m.filterActive {
				if m.selectedRow > 0 {
					m.selectedRow--
				}
			} else if m.mode == ViewLogs {
				m.logsViewport.LineUp(1)
			}

		case key.Matches(msg, m.keys.Down):
			if m.mode == ViewTable && !m.filterActive {
				if m.selectedRow < len(m.filteredRows)-1 {
					m.selectedRow++
				}
			} else if m.mode == ViewLogs {
				m.logsViewport.LineDown(1)
			}

		case key.Matches(msg, m.keys.SortCPU):
			m.updateSortColumn(SortCPU)
		case key.Matches(msg, m.keys.SortMem):
			m.updateSortColumn(SortMemory)
		case key.Matches(msg, m.keys.SortName):
			m.updateSortColumn(SortName)

		default:
			if m.filterActive {
				if msg.String() == "esc" {
					m.filterActive = false
					m.filterInput.Blur()
					m.filterInput.SetValue("")
					m.applyFilter()
				} else if msg.String() == "enter" {
					m.filterActive = false
					m.filterInput.Blur()
					m.applyFilter()
				} else {
					var cmd tea.Cmd
					m.filterInput, cmd = m.filterInput.Update(msg)
					m.applyFilter()
					return m, cmd
				}
			} else if m.mode == ViewEdit {
				var cmd tea.Cmd
				if m.editField == EditCPUShares {
					m.editCPUShares, cmd = m.editCPUShares.Update(msg)
				} else {
					m.editMemory, cmd = m.editMemory.Update(msg)
				}
				return m, cmd
			}
		}

	case tickMsg:
		return m, tea.Batch(
			m.fetchStatsCmd(),
			tea.Tick(2*time.Second, func(t time.Time) tea.Msg {
				return tickMsg(t)
			}),
		)

	case StatsUpdateMsg:
		m.rows = NewContainerRows(msg)
		m.applyFilter()
		m.loading = false

	case LogLineMsg:
		line := string(msg)
		m.logsBuffer = append(m.logsBuffer, line)
		if len(m.logsBuffer) > 1000 {
			m.logsBuffer = m.logsBuffer[500:]
		}
		m.logsViewport.SetContent(strings.Join(m.logsBuffer, "\n"))
		m.logsViewport.GotoBottom()
		return m, m.waitForLogs()

	case LogErrorMsg:
		m.errMsg = fmt.Sprintf("日志错误: %v", msg)
		return m, m.waitForLogs()

	case ResourcesLoadedMsg:
		m.editOriginal = monitor.ContainerResources(msg)
		m.editCPUShares.SetValue(fmt.Sprintf("%d", m.editOriginal.CPUShares))
		if m.editOriginal.Memory > 0 {
			m.editMemory.SetValue(formatMemoryBytes(m.editOriginal.Memory))
		} else {
			m.editMemory.SetValue("")
		}
		m.editCPUShares.Focus()
		m.editField = EditCPUShares

	case ResourcesUpdatedMsg:
		m.successMsg = "资源限制已更新"
		m.mode = ViewTable
		return m, tea.Tick(3*time.Second, func(t time.Time) tea.Msg {
			return clearSuccessMsg{}
		})

	case ResourcesUpdateErrorMsg:
		m.errMsg = fmt.Sprintf("更新失败: %v", msg)

	case clearSuccessMsg:
		m.successMsg = ""

	case ErrorMsg:
		m.errMsg = msg.Error()

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.help.Width = msg.Width
		m.logsViewport.Width = msg.Width
		m.logsViewport.Height = msg.Height - 8
	}

	return m, nil
}

func (m *Model) View() string {
	if m.loading {
		return m.loadingView()
	}

	if m.mode == ViewLogs {
		return m.logsView()
	}

	if m.mode == ViewEdit {
		return m.editView()
	}

	return m.tableView()
}

func (m *Model) editView() string {
	var sb interface{} = &stringBuilder{}
	b := sb.(*stringBuilder)

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#00BFFF")).
		Render("🐳 编辑容器资源限制")
	b.writeString(title)
	b.writeString("\n\n")

	containerName := m.editContainerID
	for _, r := range m.rows {
		if r.ID == m.editContainerID {
			containerName = r.Name
			break
		}
	}

	containerInfo := fmt.Sprintf("容器: %s (ID: %s)", containerName, m.editContainerID)
	b.writeString(lipgloss.NewStyle().
		Foreground(lipgloss.Color("#808080")).
		Render(containerInfo))
	b.writeString("\n\n")

	labelStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF")).
		Bold(true).
		Width(20)

	valueStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#808080"))

	b.writeString(labelStyle.Render("原始 CPU Shares:"))
	b.writeString(valueStyle.Render(fmt.Sprintf("%d", m.editOriginal.CPUShares)))
	b.writeString("\n")

	b.writeString(labelStyle.Render("原始内存:"))
	if m.editOriginal.Memory > 0 {
		b.writeString(valueStyle.Render(formatMemoryBytes(m.editOriginal.Memory)))
	} else {
		b.writeString(valueStyle.Render("无限制"))
	}
	b.writeString("\n\n")

	b.writeString(lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00BFFF")).
		Bold(true).
		Render("新值:"))
	b.writeString("\n\n")

	cpuLabel := "CPU Shares"
	memLabel := "内存 (如 512m, 2g)"

	if m.editField == EditCPUShares {
		cpuLabel = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFF00")).
			Bold(true).
			Render(cpuLabel + " ←")
	} else {
		memLabel = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFF00")).
			Bold(true).
			Render(memLabel + " ←")
	}

	b.writeString(labelStyle.Render("CPU Shares:"))
	b.writeString(cpuLabel)
	b.writeString("\n")
	b.writeString(m.editCPUShares.View())
	b.writeString("\n\n")

	b.writeString(labelStyle.Render("内存:"))
	b.writeString(memLabel)
	b.writeString("\n")
	b.writeString(m.editMemory.View())
	b.writeString("\n\n")

	if m.errMsg != "" {
		b.writeString(lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF4444")).
			Render(m.errMsg))
		b.writeString("\n\n")
	}

	hintStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#808080")).
		Italic(true)

	b.writeString(hintStyle.Render("Tab 切换字段 | Enter 应用修改 | Esc 取消"))

	return b.String()
}

func (m *Model) updateSortColumn(col SortColumn) {
	if m.sortColumn == col {
		if m.sortDir == SortAsc {
			m.sortDir = SortDesc
		} else {
			m.sortDir = SortAsc
		}
	} else {
		m.sortColumn = col
		m.sortDir = SortDesc
	}
	m.applyFilter()
}

func (m *Model) applyFilter() {
	filter := m.filterInput.Value()
	m.filteredRows = FilterRows(m.rows, filter)
	m.filteredRows = SortRows(m.filteredRows, m.sortColumn, m.sortDir)
	if m.selectedRow >= len(m.filteredRows) {
		m.selectedRow = len(m.filteredRows) - 1
	}
	if m.selectedRow < 0 {
		m.selectedRow = 0
	}
}

func (m *Model) loadingView() string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#00BFFF")).
		Render("Docker Container Monitor")

	loading := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#808080")).
		Render("正在加载容器数据...")

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center,
		lipgloss.JoinVertical(lipgloss.Center, title, "", loading))
}

func (m *Model) fetchStatsCmd() tea.Cmd {
	return func() tea.Msg {
		stats, err := m.monitor.GetAllContainerStats(m.ctx)
		if err != nil {
			return ErrorMsg(err)
		}
		return StatsUpdateMsg(stats)
	}
}

func (m *Model) waitForLogs() tea.Cmd {
	return func() tea.Msg {
		m.logsMu.Lock()
		msgCh := m.logsMsgCh
		errCh := m.logsErrCh
		m.logsMu.Unlock()

		if msgCh == nil && errCh == nil {
			return nil
		}

		select {
		case line, ok := <-msgCh:
			if !ok {
				return nil
			}
			return line
		case err, ok := <-errCh:
			if !ok {
				return nil
			}
			return err
		case <-m.ctx.Done():
			return nil
		}
	}
}

func (m *Model) startLogStreaming(containerID string) {
	m.logsMu.Lock()
	defer m.logsMu.Unlock()

	if m.logsCancel != nil {
		m.logsCancel()
	}
	if m.logsDoneCh != nil {
		select {
		case <-m.logsDoneCh:
		case <-time.After(5 * time.Second):
		}
	}

	m.currentLogID = containerID
	m.logsBuffer = []string{}
	m.logsViewport = viewport.New(m.width, m.height-8)
	m.logsViewport.SetContent("")

	logCtx, logCancel := context.WithCancel(m.ctx)
	m.logsContext = logCtx
	m.logsCancel = logCancel

	m.logsMsgCh = make(chan LogLineMsg, 100)
	m.logsErrCh = make(chan LogErrorMsg, 1)
	m.logsDoneCh = make(chan struct{})

	logsCh, errCh := m.monitor.StreamContainerLogs(logCtx, containerID, "100", "")

	go func() {
		defer close(m.logsDoneCh)
		for {
			select {
			case <-logCtx.Done():
				return
			case line, ok := <-logsCh:
				if !ok {
					return
				}
				select {
				case m.logsMsgCh <- LogLineMsg(line):
				case <-logCtx.Done():
					return
				}
			case err, ok := <-errCh:
				if ok && err != nil {
					select {
					case m.logsErrCh <- LogErrorMsg(err):
					case <-logCtx.Done():
						return
					}
				}
				return
			}
		}
	}()
}

func (m *Model) stopLogStreaming() {
	m.logsMu.Lock()
	defer m.logsMu.Unlock()

	if m.logsCancel != nil {
		m.logsCancel()
	}

	if m.logsDoneCh != nil {
		select {
		case <-m.logsDoneCh:
		case <-time.After(5 * time.Second):
		}
	}

	m.logsCancel = nil
	m.logsMsgCh = nil
	m.logsErrCh = nil
	m.logsDoneCh = nil
	m.logsContext = nil
}

func (m *Model) startEditMode(containerID string) tea.Cmd {
	m.editContainerID = containerID
	m.mode = ViewEdit
	m.errMsg = ""

	return func() tea.Msg {
		resources, err := m.monitor.GetContainerResources(m.ctx, containerID)
		if err != nil {
			return ErrorMsg(err)
		}
		return ResourcesLoadedMsg(*resources)
	}
}

func (m *Model) switchEditField() {
	if m.editField == EditCPUShares {
		m.editCPUShares.Blur()
		m.editField = EditMemory
		m.editMemory.Focus()
	} else {
		m.editMemory.Blur()
		m.editField = EditCPUShares
		m.editCPUShares.Focus()
	}
}

func (m *Model) applyResourceChanges() tea.Cmd {
	cpuShares, err := strconv.ParseInt(m.editCPUShares.Value(), 10, 64)
	if err != nil {
		m.errMsg = "CPU Shares 必须是数字"
		return nil
	}
	if cpuShares < 0 || cpuShares > 262144 {
		m.errMsg = "CPU Shares 范围: 0-262144"
		return nil
	}

	memory, err := parseMemoryInput(m.editMemory.Value())
	if err != nil {
		m.errMsg = fmt.Sprintf("内存格式错误: %v", err)
		return nil
	}

	return func() tea.Msg {
		resources := monitor.ContainerResources{
			CPUShares: cpuShares,
			Memory:    memory,
		}
		err := m.monitor.UpdateContainerResources(m.ctx, m.editContainerID, resources)
		if err != nil {
			return ResourcesUpdateErrorMsg(err)
		}
		return ResourcesUpdatedMsg{}
	}
}

func parseMemoryInput(input string) (int64, error) {
	input = strings.TrimSpace(strings.ToLower(input))
	if input == "" {
		return 0, nil
	}

	multipliers := map[string]int64{
		"b":  1,
		"k":  1024,
		"kb": 1024,
		"m":  1024 * 1024,
		"mb": 1024 * 1024,
		"g":  1024 * 1024 * 1024,
		"gb": 1024 * 1024 * 1024,
	}

	for suffix, mult := range multipliers {
		if strings.HasSuffix(input, suffix) {
			numStr := strings.TrimSuffix(input, suffix)
			num, err := strconv.ParseFloat(numStr, 64)
			if err != nil {
				return 0, err
			}
			return int64(num * float64(mult)), nil
		}
	}

	num, err := strconv.ParseInt(input, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("无效的内存格式: %s", input)
	}
	return num, nil
}

func formatMemoryBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%db", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f%c", float64(bytes)/float64(div), "kmg"[exp])
}

type clearSuccessMsg struct{}
