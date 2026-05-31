package tui

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"dlog/internal/docker"
	"dlog/internal/filter"
)

type Mode int

const (
	NormalMode Mode = iota
	SearchMode
	InputMode
	StatsMode
)

type LogLine struct {
	Container  string
	Timestamp  string
	Content    string
	Rendered   string
	HasMatch   bool
}

type SecondBucket struct {
	Second  string
	Counts  map[string]int
	Total   int
}

type Model struct {
	keyMap KeyMap

	containers []string
	filter     *filter.Filter

	allLines   []LogLine
	viewLines  []LogLine
	scrollPos  int
	maxScroll  int

	mode       Mode
	searchInput textinput.Model
	searchMatches []int
	currentMatch  int

	statusMsg  string
	errMsg     string

	width  int
	height int

	streamer *docker.LogStreamer
	ctx      context.Context
	cancel   context.CancelFunc

	autoScroll bool

	statsBuckets   []SecondBucket
	statsPeak      int
	statsPeakTime  string
	currentSecond  string
	statsMax       int
}

type logTickMsg struct{}

type errorMsg struct {
	err error
}

func NewModel(containers []string, showTimestamp bool) (*Model, error) {
	streamer, err := docker.NewLogStreamer()
	if err != nil {
		return nil, fmt.Errorf("failed to create log streamer: %w", err)
	}

	ti := textinput.New()
	ti.Placeholder = "enter regex pattern..."
	ti.CharLimit = 200
	ti.Width = 40

	f := filter.New(showTimestamp)

	ctx, cancel := context.WithCancel(context.Background())

	return &Model{
		keyMap:     DefaultKeyMap(),
		containers: containers,
		filter:     f,
		searchInput: ti,
		streamer:   streamer,
		ctx:        ctx,
		cancel:     cancel,
		autoScroll: true,
	}, nil
}

func (m *Model) Init() tea.Cmd {
	for _, c := range m.containers {
		err := m.streamer.StreamContainerLogs(m.ctx, c, true, "")
		if err != nil {
			m.errMsg = fmt.Sprintf("Error streaming %s: %v", c, err)
		}
	}
	return tea.Batch(
		m.readLogs(),
		m.readErrors(),
	)
}

func (m *Model) readLogs() tea.Cmd {
	return func() tea.Msg {
		select {
		case entry := <-m.streamer.Entries():
			return entry
		case <-m.ctx.Done():
			return nil
		}
	}
}

func (m *Model) readErrors() tea.Cmd {
	return func() tea.Msg {
		select {
		case err := <-m.streamer.Errors():
			return errorMsg{err: err}
		case <-m.ctx.Done():
			return nil
		}
	}
}

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch m.mode {
		case SearchMode:
			return m.updateSearchMode(msg)
		default:
			return m.updateNormalMode(msg)
		}

	case docker.LogEntry:
		return m.handleLogEntry(msg)

	case errorMsg:
		m.errMsg = msg.err.Error()
		return m, m.readErrors()

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.updateMaxScroll()
		return m, nil

	case tea.QuitMsg:
		return m, tea.Quit

	default:
		return m, nil
	}
}

func (m *Model) updateNormalMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keyMap.Quit):
		m.cancel()
		return m, tea.Quit

	case key.Matches(msg, m.keyMap.Up):
		m.autoScroll = false
		if m.scrollPos > 0 {
			m.scrollPos--
		}
		return m, nil

	case key.Matches(msg, m.keyMap.Down):
		m.autoScroll = false
		if m.scrollPos < m.maxScroll {
			m.scrollPos++
		}
		return m, nil

	case key.Matches(msg, m.keyMap.PageUp):
		m.autoScroll = false
		pageSize := m.height / 2
		m.scrollPos -= pageSize
		if m.scrollPos < 0 {
			m.scrollPos = 0
		}
		return m, nil

	case key.Matches(msg, m.keyMap.PageDown):
		m.autoScroll = false
		pageSize := m.height / 2
		m.scrollPos += pageSize
		if m.scrollPos > m.maxScroll {
			m.scrollPos = m.maxScroll
		}
		return m, nil

	case key.Matches(msg, m.keyMap.Top):
		m.autoScroll = false
		m.scrollPos = 0
		return m, nil

	case key.Matches(msg, m.keyMap.Bottom):
		m.autoScroll = true
		m.scrollPos = m.maxScroll
		return m, nil

	case key.Matches(msg, m.keyMap.Search):
		m.mode = SearchMode
		m.searchInput.Focus()
		m.searchInput.SetValue("")
		m.statusMsg = "Search: "
		return m, nil

	case key.Matches(msg, m.keyMap.NextMatch):
		if len(m.searchMatches) > 0 {
			m.currentMatch++
			if m.currentMatch >= len(m.searchMatches) {
				m.currentMatch = 0
			}
			m.autoScroll = false
			m.scrollPos = m.searchMatches[m.currentMatch]
			if m.scrollPos > m.maxScroll {
				m.scrollPos = m.maxScroll
			}
		}
		return m, nil

	case key.Matches(msg, m.keyMap.PrevMatch):
		if len(m.searchMatches) > 0 {
			m.currentMatch--
			if m.currentMatch < 0 {
				m.currentMatch = len(m.searchMatches) - 1
			}
			m.autoScroll = false
			m.scrollPos = m.searchMatches[m.currentMatch]
			if m.scrollPos > m.maxScroll {
				m.scrollPos = m.maxScroll
			}
		}
		return m, nil

	case key.Matches(msg, m.keyMap.ToggleStats):
		if m.mode == StatsMode {
			m.mode = NormalMode
			m.statusMsg = ""
		} else {
			m.mode = StatsMode
			m.statusMsg = "Stats Mode"
		}
		return m, nil
	}

	return m, nil
}

func (m *Model) updateSearchMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEnter:
		pattern := m.searchInput.Value()
		if pattern == "" {
			m.mode = NormalMode
			m.statusMsg = ""
			m.filter.SetSearch("")
			m.refreshView()
			return m, nil
		}
		err := m.filter.SetSearch(pattern)
		if err != nil {
			m.errMsg = fmt.Sprintf("Invalid regex: %v", err)
			return m, nil
		}
		m.mode = NormalMode
		m.statusMsg = fmt.Sprintf("Search: %s", pattern)
		m.refreshView()
		m.findSearchMatches()
		return m, nil

	case tea.KeyEsc:
		m.mode = NormalMode
		m.statusMsg = ""
		m.searchInput.SetValue("")
		m.filter.SetSearch("")
		m.refreshView()
		return m, nil

	default:
		var cmd tea.Cmd
		m.searchInput, cmd = m.searchInput.Update(msg)
		return m, cmd
	}
}

func (m *Model) handleLogEntry(entry docker.LogEntry) (tea.Model, tea.Cmd) {
	if !m.filter.MatchesFilter(entry.Content) {
		return m, m.readLogs()
	}

	hl := m.filter.Process(entry.Container, entry.Timestamp, entry.Content)
	line := LogLine{
		Container: hl.Container,
		Timestamp: hl.Timestamp,
		Content:   hl.RawContent,
		Rendered:  hl.Rendered,
		HasMatch:  hl.HasMatch,
	}

	m.allLines = append(m.allLines, line)
	m.viewLines = append(m.viewLines, line)

	m.updateMaxScroll()

	if m.autoScroll {
		m.scrollPos = m.maxScroll
	}

	if m.filter.HasSearch() && hl.HasMatch {
		m.searchMatches = append(m.searchMatches, len(m.viewLines)-1)
	}

	m.trackStats(entry.Container)

	return m, m.readLogs()
}

func (m *Model) trackStats(container string) {
	now := time.Now()
	second := now.Format("15:04:05")

	if second != m.currentSecond {
		if len(m.statsBuckets) > 0 {
			last := m.statsBuckets[len(m.statsBuckets)-1]
			if last.Total > m.statsPeak {
				m.statsPeak = last.Total
				m.statsPeakTime = last.Second
			}
		}
		m.statsBuckets = append(m.statsBuckets, SecondBucket{
			Second: second,
			Counts: make(map[string]int),
		})
		maxBuckets := 120
		if len(m.statsBuckets) > maxBuckets {
			m.statsBuckets = m.statsBuckets[len(m.statsBuckets)-maxBuckets:]
		}
		m.currentSecond = second
	}

	if len(m.statsBuckets) == 0 {
		m.statsBuckets = append(m.statsBuckets, SecondBucket{
			Second: second,
			Counts: make(map[string]int),
		})
		m.currentSecond = second
	}

	cur := &m.statsBuckets[len(m.statsBuckets)-1]
	cur.Counts[container]++
	cur.Total++

	if cur.Total > m.statsMax {
		m.statsMax = cur.Total
	}
	if cur.Total > m.statsPeak {
		m.statsPeak = cur.Total
		m.statsPeakTime = second
	}
}

func (m *Model) refreshView() {
	m.viewLines = m.viewLines[:0]
	for _, line := range m.allLines {
		if !m.filter.MatchesFilter(line.Content) {
			continue
		}
		hl := m.filter.Process(line.Container, line.Timestamp, line.Content)
		m.viewLines = append(m.viewLines, LogLine{
			Container: hl.Container,
			Timestamp: hl.Timestamp,
			Content:   hl.RawContent,
			Rendered:  hl.Rendered,
			HasMatch:  hl.HasMatch,
		})
	}
	m.updateMaxScroll()
}

func (m *Model) findSearchMatches() {
	m.searchMatches = m.searchMatches[:0]
	m.currentMatch = 0
	for i, line := range m.viewLines {
		if line.HasMatch {
			m.searchMatches = append(m.searchMatches, i)
		}
	}
}

func (m *Model) updateMaxScroll() {
	viewHeight := m.height - 4
	if viewHeight < 1 {
		viewHeight = 1
	}
	maxScroll := len(m.viewLines) - viewHeight
	if maxScroll < 0 {
		maxScroll = 0
	}
	m.maxScroll = maxScroll
	if m.scrollPos > m.maxScroll {
		m.scrollPos = m.maxScroll
	}
}

func (m *Model) View() string {
	var b strings.Builder

	if m.mode == StatsMode {
		return m.viewStats()
	}

	title := TitleStyle.Render(fmt.Sprintf("dlog - Docker Log Viewer | Containers: %s", strings.Join(m.containers, ", ")))
	b.WriteString(title)
	b.WriteString("\n\n")

	viewHeight := m.height - 4
	if viewHeight < 1 {
		viewHeight = 1
	}

	start := m.scrollPos
	end := start + viewHeight
	if end > len(m.viewLines) {
		end = len(m.viewLines)
	}

	for i := start; i < end; i++ {
		line := m.viewLines[i]
		b.WriteString(line.Rendered)
		b.WriteString("\n")
	}

	b.WriteString(strings.Repeat("─", m.width))
	b.WriteString("\n")

	if m.errMsg != "" {
		b.WriteString(NoMatchesStyle.Render(fmt.Sprintf("Error: %s", m.errMsg)))
		b.WriteString("\n")
	}

	if m.mode == SearchMode {
		b.WriteString(InputStyle.Render("/"))
		b.WriteString(m.searchInput.View())
	} else {
		statusParts := []string{}
		if m.statusMsg != "" {
			statusParts = append(statusParts, m.statusMsg)
		}
		statusParts = append(statusParts, fmt.Sprintf("Lines: %d", len(m.viewLines)))
		if m.filter.HasSearch() {
			statusParts = append(statusParts, fmt.Sprintf("Matches: %d/%d", m.currentMatch+1, len(m.searchMatches)))
		}
		statusParts = append(statusParts, "[q]quit [s]tats [j/k]scroll [/]search [n/N]match")
		b.WriteString(StatusBarStyle.Render(strings.Join(statusParts, " | ")))
	}

	return b.String()
}

func (m *Model) viewStats() string {
	var b strings.Builder

	title := TitleStyle.Render(fmt.Sprintf("dlog - Log Statistics | Containers: %s", strings.Join(m.containers, ", ")))
	b.WriteString(title)
	b.WriteString("\n\n")

	if len(m.statsBuckets) == 0 {
		b.WriteString(HelpStyle.Render("No data yet..."))
		b.WriteString("\n")
		b.WriteString(strings.Repeat("─", m.width))
		b.WriteString("\n")
		b.WriteString(StatusBarStyle.Render("[q]quit [s]tats [/]search"))
		return b.String()
	}

	sortedContainers := make([]string, 0, len(m.containers))
	sortedContainers = append(sortedContainers, m.containers...)
	sort.Strings(sortedContainers)

	blockChars := []string{"█", "▓", "▒", "░", "■", "●", "◆", "▲"}

	maxBarWidth := m.width - 30
	if maxBarWidth < 10 {
		maxBarWidth = 10
	}

	maxVal := m.statsMax
	if maxVal < 1 {
		maxVal = 1
	}

	visibleBuckets := m.height - 8
	if visibleBuckets < 5 {
		visibleBuckets = 5
	}
	startIdx := len(m.statsBuckets) - visibleBuckets
	if startIdx < 0 {
		startIdx = 0
	}
	buckets := m.statsBuckets[startIdx:]

	for bi, bucket := range buckets {
		b.WriteString(fmt.Sprintf("%s ", bucket.Second))

		totalChars := 0
		if maxVal > 0 {
			totalChars = int(float64(bucket.Total) / float64(maxVal) * float64(maxBarWidth))
			if bucket.Total > 0 && totalChars == 0 {
				totalChars = 1
			}
		}

		barSegments := make([]string, 0)
		segmentsLeft := totalChars
		for ci, cname := range sortedContainers {
			count := bucket.Counts[cname]
			if count == 0 {
				continue
			}
			proportion := float64(count) / float64(bucket.Total)
			segLen := int(proportion * float64(totalChars))
			if count > 0 && segLen == 0 && totalChars > 0 {
				segLen = 1
			}
			if segLen > segmentsLeft {
				segLen = segmentsLeft
			}
			if segLen > 0 {
				char := blockChars[ci%len(blockChars)]
				barSegments = append(barSegments, strings.Repeat(char, segLen))
				segmentsLeft -= segLen
			}
		}

		bar := strings.Join(barSegments, "")
		if len(bar) < totalChars {
			bar += strings.Repeat(" ", totalChars-len(bar))
		}

		b.WriteString(bar)
		b.WriteString(fmt.Sprintf(" %3d", bucket.Total))

		if bi == len(buckets)-1 {
			b.WriteString(" ◄ now")
		}
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(strings.Repeat("─", m.width))
	b.WriteString("\n")

	b.WriteString("Legend: ")
	for ci, cname := range sortedContainers {
		char := blockChars[ci%len(blockChars)]
		b.WriteString(fmt.Sprintf("%s=%s ", char, cname))
	}
	b.WriteString("\n")

	b.WriteString(strings.Repeat("─", m.width))
	b.WriteString("\n")

	totalLines := 0
	for _, bucket := range m.statsBuckets {
		totalLines += bucket.Total
	}

	numSeconds := len(m.statsBuckets)
	avgQPS := 0.0
	if numSeconds > 0 {
		avgQPS = float64(totalLines) / float64(numSeconds)
	}

	statusParts := []string{}
	statusParts = append(statusParts, fmt.Sprintf("Peak QPS: %d @ %s", m.statsPeak, m.statsPeakTime))
	statusParts = append(statusParts, fmt.Sprintf("Avg QPS: %.1f", avgQPS))
	statusParts = append(statusParts, fmt.Sprintf("Total: %d lines / %d sec", totalLines, numSeconds))
	statusParts = append(statusParts, "[s]tats [q]uit")
	b.WriteString(StatusBarStyle.Render(strings.Join(statusParts, " | ")))

	return b.String()
}

func (m *Model) Cleanup() {
	m.cancel()
	if m.streamer != nil {
		m.streamer.Close()
	}
}
