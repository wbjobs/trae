package tui

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"k8s.io/client-go/kubernetes"

	"k8s-topology/pkg/k8s"
	"k8s-topology/pkg/tree"
)

var (
	kindColors = map[string]lipgloss.Color{
		"Deployment": lipgloss.Color("#61AFEF"),
		"ReplicaSet": lipgloss.Color("#E5C07B"),
		"Pod":        lipgloss.Color("#98C379"),
		"Container":  lipgloss.Color("#C678DD"),
	}

	selectedStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#56B6C2")).
			Foreground(lipgloss.Color("#282C34")).
			Bold(true)

	kindStyle = func(kind string) lipgloss.Style {
		c, ok := kindColors[kind]
		if !ok {
			c = lipgloss.Color("#ABB2BF")
		}
		return lipgloss.NewStyle().Foreground(c).Bold(true)
	}

	statusReadyStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#98C379"))
	statusPendingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#E5C07B"))
	statusFailedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#E06C75"))
	statusUnknownStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#ABB2BF"))

	helpStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#5C6370")).Italic(true)
	filterStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#E5C07B")).Bold(true)
	titleStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#61AFEF")).Bold(true).Padding(0, 1)
	modalStyle  = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("#61AFEF")).Padding(1, 2)

	addedBadge    = lipgloss.NewStyle().Foreground(lipgloss.Color("#98C379")).Bold(true).Render("[+]")
	modifiedBadge = lipgloss.NewStyle().Foreground(lipgloss.Color("#E5C07B")).Bold(true).Render("[~]")
	deletedBadge  = lipgloss.NewStyle().Foreground(lipgloss.Color("#E06C75")).Bold(true).Render("[-]")

	watchActiveStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#98C379")).Bold(true).Render("●")
	watchInactiveStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#5C6370")).Render("○")
)

type Model struct {
	clientset *kubernetes.Clientset
	namespace string
	watchMode bool
	watcher   *k8s.Watcher

	roots    []*tree.TreeNode
	flatten  []*tree.FlattenItem
	selected int

	changes map[string]tree.ChangeType

	filterInput textinput.Model
	filterMode  bool

	modalText string
	showModal bool

	width  int
	height int

	errMsg    string
	lastEvent string
}

func NewModel(clientset *kubernetes.Clientset, namespace string, watchMode bool) *Model {
	ti := textinput.New()
	ti.Placeholder = "输入命名空间过滤..."
	ti.CharLimit = 64
	ti.Width = 30

	return &Model{
		clientset:   clientset,
		namespace:   namespace,
		watchMode:   watchMode,
		selected:    0,
		filterInput: ti,
		changes:     make(map[string]tree.ChangeType),
	}
}

type tickMsg time.Time

func (m *Model) Init() tea.Cmd {
	return tea.Batch(
		m.loadTopology,
		m.startWatcherIfNeeded(),
	)
}

func (m *Model) startWatcherIfNeeded() tea.Cmd {
	if !m.watchMode {
		return nil
	}
	return func() tea.Msg {
		ctx := context.Background()
		w := k8s.NewWatcher(m.clientset, m.namespace)
		if err := w.Start(ctx); err != nil {
			return errMsg{err: fmt.Errorf("watch 启动失败: %w", err)}
		}
		m.watcher = w
		return watcherStarted{}
	}
}

type watcherStarted struct{}

func (m *Model) loadTopology() tea.Msg {
	ctx := context.Background()
	nodes, err := k8s.BuildTopology(ctx, m.clientset, m.namespace)
	if err != nil {
		return errMsg{err: err}
	}
	m.roots = tree.BuildTree(nodes)
	if len(m.changes) > 0 {
		tree.ApplyChanges(m.roots, m.changes)
	}
	m.flatten = tree.Flatten(m.roots)
	if m.selected >= len(m.flatten) {
		m.selected = 0
	}
	return topologyLoaded{}
}

type topologyLoaded struct{}
type errMsg struct{ err error }

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		return m.handleKey(msg)
	case tea.MouseMsg:
		return m.handleMouse(msg)
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case topologyLoaded:
		return m, nil
	case watcherStarted:
		return m, m.watchTick()
	case []k8s.WatchEvent:
		return m.handleWatchEvents(msg)
	case tickMsg:
		return m, m.watchTick()
	case errMsg:
		m.errMsg = msg.err.Error()
		return m, nil
	}
	return m, nil
}

func (m *Model) watchTick() tea.Cmd {
	if m.watcher == nil {
		return tea.Tick(200*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
	}
	return tea.Batch(
		tea.Tick(500*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) }),
		m.readWatcherEvents(),
	)
}

func (m *Model) readWatcherEvents() tea.Cmd {
	return func() tea.Msg {
		if m.watcher == nil {
			return nil
		}
		select {
		case events := <-m.watcher.Events():
			return events
		default:
			return nil
		}
	}
}

func (m *Model) handleWatchEvents(events []k8s.WatchEvent) (tea.Model, tea.Cmd) {
	if len(events) == 0 {
		return m, nil
	}

	now := time.Now().Format("15:04:05")
	m.lastEvent = fmt.Sprintf("%s 检测到 %d 个变化", now, len(events))

	for _, evt := range events {
		id := fmt.Sprintf("%s/%s/%s", evt.Kind, evt.Namespace, evt.Name)
		switch evt.Type {
		case k8s.EventAdded:
			m.changes[id] = tree.ChangeAdded
		case k8s.EventModified:
			if _, exists := m.changes[id]; !exists || m.changes[id] != tree.ChangeAdded {
				m.changes[id] = tree.ChangeModified
			}
		case k8s.EventDeleted:
			m.changes[id] = tree.ChangeDeleted
		}
	}

	return m, m.loadTopology
}

func (m *Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.filterMode {
		return m.handleFilterKey(msg)
	}
	if m.showModal {
		switch msg.String() {
		case "esc", "q", "enter":
			m.showModal = false
			m.modalText = ""
		}
		return m, nil
	}

	switch msg.String() {
	case "q", "ctrl+c":
		if m.watcher != nil {
			m.watcher.Stop()
		}
		return m, tea.Quit
	case "up", "k":
		if m.selected > 0 {
			m.selected--
		}
	case "down", "j":
		if m.selected < len(m.flatten)-1 {
			m.selected++
		}
	case "enter", " ", "left", "right":
		if len(m.flatten) > 0 && m.selected < len(m.flatten) {
			m.flatten[m.selected].Node.Toggle()
			m.flatten = tree.Flatten(m.roots)
		}
	case "e":
		m.expandAll()
	case "c":
		m.collapseAll()
	case "1":
		tree.ExpandByKind(m.roots, "Deployment")
		m.flatten = tree.Flatten(m.roots)
	case "2":
		tree.ExpandByKind(m.roots, "ReplicaSet")
		m.flatten = tree.Flatten(m.roots)
	case "3":
		tree.ExpandByKind(m.roots, "Pod")
		m.flatten = tree.Flatten(m.roots)
	case "!":
		tree.CollapseByKind(m.roots, "Deployment")
		m.flatten = tree.Flatten(m.roots)
	case "@":
		tree.CollapseByKind(m.roots, "ReplicaSet")
		m.flatten = tree.Flatten(m.roots)
	case "#":
		tree.CollapseByKind(m.roots, "Pod")
		m.flatten = tree.Flatten(m.roots)
	case "r":
		m.changes = make(map[string]tree.ChangeType)
		return m, m.loadTopology
	case "f":
		m.filterMode = true
		m.filterInput.Focus()
		return m, textinput.Blink
	case "y":
		if len(m.flatten) > 0 && m.selected < len(m.flatten) {
			m.showResourceDetail()
		}
	case "w":
		m.toggleWatchMode()
	case "g":
		m.selected = 0
	case "G":
		if len(m.flatten) > 0 {
			m.selected = len(m.flatten) - 1
		}
	}
	return m, nil
}

func (m *Model) toggleWatchMode() {
	if m.watchMode {
		m.watchMode = false
		if m.watcher != nil {
			m.watcher.Stop()
			m.watcher = nil
		}
		m.changes = make(map[string]tree.ChangeType)
		m.lastEvent = ""
	} else {
		m.watchMode = true
	}
}

func (m *Model) handleFilterKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.filterMode = false
		m.filterInput.Blur()
		m.filterInput.Reset()
		m.namespace = ""
		return m, m.loadTopology
	case "enter":
		m.filterMode = false
		m.filterInput.Blur()
		m.namespace = strings.TrimSpace(m.filterInput.Value())
		return m, m.loadTopology
	default:
		var cmd tea.Cmd
		m.filterInput, cmd = m.filterInput.Update(msg)
		return m, cmd
	}
}

func (m *Model) handleMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	if m.showModal {
		if msg.Type == tea.MouseLeft {
			m.showModal = false
			m.modalText = ""
		}
		return m, nil
	}
	if msg.Type != tea.MouseLeft {
		return m, nil
	}
	headerHeight := 3
	if m.watchMode {
		headerHeight++
	}
	row := msg.Y - headerHeight
	if row < 0 || row >= len(m.flatten) {
		return m, nil
	}
	m.selected = row
	if msg.Button == tea.MouseButtonLeft && msg.Alt {
		m.showResourceDetail()
		return m, nil
	}
	return m, nil
}

func (m *Model) showResourceDetail() {
	if m.selected >= len(m.flatten) {
		return
	}
	node := m.flatten[m.selected].Node
	m.modalText = node.Data.EnsureYAML()
	m.showModal = true
}

func (m *Model) expandAll() {
	for _, r := range m.roots {
		r.ExpandAll()
	}
	m.flatten = tree.Flatten(m.roots)
}

func (m *Model) collapseAll() {
	for _, r := range m.roots {
		r.CollapseAll()
	}
	m.flatten = tree.Flatten(m.roots)
}

func (m *Model) View() string {
	if m.showModal {
		return m.viewModal()
	}
	if m.errMsg != "" {
		return fmt.Sprintf("错误: %s\n\n按 q 退出\n", m.errMsg)
	}
	if len(m.roots) == 0 {
		return "正在加载集群资源拓扑...\n"
	}

	var sb strings.Builder

	sb.WriteString(titleStyle.Render("K8s 资源拓扑查看器"))
	if m.namespace != "" {
		sb.WriteString(filterStyle.Render(fmt.Sprintf(" [命名空间: %s]", m.namespace)))
	}
	watchIndicator := watchInactiveStyle
	if m.watchMode {
		watchIndicator = watchActiveStyle
	}
	sb.WriteString(fmt.Sprintf("  %s Watch 模式(%s)", watchIndicator, boolStr(m.watchMode)))
	sb.WriteString("\n")

	if m.watchMode && m.lastEvent != "" {
		sb.WriteString(helpStyle.Render(fmt.Sprintf("  上次刷新: %s\n", m.lastEvent)))
	}

	if m.filterMode {
		sb.WriteString("过滤: " + m.filterInput.View() + "\n")
	} else {
		sb.WriteString(helpStyle.Render("↑/↓:移动  Enter:展开/折叠  e:全展开  c:全折叠\n"))
		sb.WriteString(helpStyle.Render("1/2/3:展开Deploy/RS/Pod  !/@/#:折叠Deploy/RS/Pod\n"))
		sb.WriteString(helpStyle.Render("f:过滤  r:刷新  w:Watch切换  y:YAML  q:退出\n"))
	}

	bodyHeight := m.height - 6
	if m.watchMode {
		bodyHeight--
	}
	if bodyHeight < 5 {
		bodyHeight = 10
	}

	start := 0
	if m.selected >= bodyHeight {
		start = m.selected - bodyHeight + 1
	}
	if start < 0 {
		start = 0
	}
	end := start + bodyHeight
	if end > len(m.flatten) {
		end = len(m.flatten)
	}

	for i := start; i < end; i++ {
		item := m.flatten[i]
		line := renderLine(item, i == m.selected)
		sb.WriteString(line)
		sb.WriteString("\n")
	}

	if len(m.flatten) == 0 {
		sb.WriteString(helpStyle.Render("  (无资源)"))
	}

	return sb.String()
}

func renderLine(item *tree.FlattenItem, selected bool) string {
	node := item.Node
	data := node.Data

	indent := strings.Repeat("  ", item.Depth)
	var marker string
	if len(node.Children) > 0 {
		if node.State == tree.Expanded {
			marker = "▼ "
		} else {
			marker = "▶ "
		}
	} else {
		marker = "  "
	}

	kindLabel := fmt.Sprintf("[%s]", data.Kind)
	coloredKind := kindStyle(data.Kind).Render(kindLabel)

	statusColored := colorStatus(data.Status)

	var changeBadge string
	switch node.Change {
	case tree.ChangeAdded:
		changeBadge = " " + addedBadge
	case tree.ChangeModified:
		changeBadge = " " + modifiedBadge
	case tree.ChangeDeleted:
		changeBadge = " " + deletedBadge
	}

	line := fmt.Sprintf("%s%s%s %s  %s%s", indent, marker, coloredKind, data.Name, statusColored, changeBadge)
	if selected {
		line = selectedStyle.Render(line)
	}
	return line
}

func colorStatus(status string) string {
	s := strings.ToLower(status)
	switch {
	case strings.Contains(s, "running"), strings.Contains(s, "ready"):
		return statusReadyStyle.Render(status)
	case strings.Contains(s, "pending"), strings.Contains(s, "waiting"):
		return statusPendingStyle.Render(status)
	case strings.Contains(s, "failed"), strings.Contains(s, "error"), strings.Contains(s, "terminated"):
		return statusFailedStyle.Render(status)
	default:
		return statusUnknownStyle.Render(status)
	}
}

func boolStr(b bool) string {
	if b {
		return "开"
	}
	return "关"
}

func (m *Model) viewModal() string {
	w := m.width - 4
	if w < 40 {
		w = 40
	}
	h := m.height - 6
	if h < 10 {
		h = 10
	}

	lines := strings.Split(m.modalText, "\n")
	var visible []string
	for i, line := range lines {
		if i >= h {
			visible = append(visible, "...")
			break
		}
		if len(line) > w-4 {
			line = line[:w-4] + "..."
		}
		visible = append(visible, line)
	}

	content := strings.Join(visible, "\n")
	title := " 资源 YAML 摘要 (按 Esc 关闭) "
	return modalStyle.Width(w).Render(title + "\n" + content)
}
