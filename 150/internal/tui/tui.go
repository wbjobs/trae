package tui

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"ssh-bastion/internal/audit"
	"ssh-bastion/internal/config"
	sshclient "ssh-bastion/internal/ssh"
	"ssh-bastion/internal/player"
	"ssh-bastion/internal/share"
)

type ViewMode int

const (
	ViewServerList ViewMode = iota
	ViewConnecting
	ViewSession
	ViewPlayback
	ViewHelp
	ViewAudit
	ViewAuditSearch
	ViewAuditTop
)

const readTimeout = 500 * time.Millisecond

type SessionState struct {
	Session      *sshclient.Session
	Player       *player.Player
	PlaybackBuf  strings.Builder
	PlaybackIdx  int
	PlaybackDone bool
	ShareViewer  *share.Viewer
	InShareMode  bool
	Disconnected bool
}

type AuditState struct {
	SearchKeyword string
	SearchServer  string
	SearchResults []audit.CommandRecord
	TopResults    []audit.CommandCount
	TotalCmds     int
	UniqueCmds    int
	FirstSeen     time.Time
	LastSeen      time.Time
	Servers       []string
	SelectedIdx   int
	Mode          int
}

type Model struct {
	cfg        *config.Config
	mode       ViewMode
	selected   int
	serverList []string
	status     string
	session    *SessionState
	audit      *AuditState
	width      int
	height     int
	err        error
	logs       []string
	shareID    string
	shareMode  bool
}

var (
	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("205")).
			Bold(true).
			MarginBottom(1)

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("12")).
			Background(lipgloss.Color("8")).
			Bold(true)

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			Italic(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("242"))

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62")).
			Padding(0, 1)

	activeBorderStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("39")).
				Padding(0, 1)

	auditItemStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("86"))

	auditRankStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("184")).
			Bold(true)
)

type (
	sessionOutputMsg struct {
		data []byte
	}
	sessionErrMsg struct {
		err error
	}
	playbackFrameMsg struct {
		data []byte
		idx  int
	}
	connectSuccessMsg struct {
		session    *sshclient.Session
		serverName string
	}
	connectErrorMsg struct {
		err error
	}
	shareJoinMsg struct {
		shareID string
		viewer  *share.Viewer
	}
	shareDataMsg struct {
		data []byte
	}
	shareErrMsg struct {
		err error
	}
	auditSearchResultMsg struct {
		results []audit.CommandRecord
	}
	auditTopResultMsg struct {
		results []audit.CommandCount
	}
	auditStatsResultMsg struct {
		total    int
		unique   int
		first    time.Time
		last     time.Time
	}
	auditServersResultMsg struct {
		servers []string
	}
	auditErrMsg struct {
		err error
	}
	tickMsg struct{}
)

func NewModel(cfg *config.Config) *Model {
	return &Model{
		cfg:        cfg,
		mode:       ViewServerList,
		serverList: cfg.ServerNames(),
		selected:   0,
		status:     "Select a server to connect",
		session:    &SessionState{},
		audit:      &AuditState{Mode: 0},
	}
}

func (m *Model) Init() tea.Cmd {
	return nil
}

func isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	if strings.Contains(err.Error(), "connection reset") ||
		strings.Contains(err.Error(), "broken pipe") ||
		strings.Contains(err.Error(), "use of closed network connection") ||
		strings.Contains(err.Error(), "EOF") {
		return true
	}
	return false
}

func (m *Model) cleanupSession(err error) {
	if m.session.Session != nil {
		m.session.Session.Close()
		m.session.Session = nil
	}
	m.session.ShareViewer = nil
	m.session.InShareMode = false
	m.session.Disconnected = true

	if err != nil {
		m.err = err
		m.status = fmt.Sprintf("Connection closed: %v", err)
	} else {
		m.status = "Disconnected"
	}

	m.mode = ViewServerList
}

func (m *Model) cleanupAuditView() {
	m.audit.SearchKeyword = ""
	m.audit.SearchResults = nil
	m.audit.TopResults = nil
}

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		return m.handleKey(msg)

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case sessionOutputMsg:
		if m.session.Session != nil && !m.session.Disconnected {
			m.session.Session.Write(msg.data)
		}
		if !m.session.InShareMode && !m.session.Disconnected {
			m.session.PlaybackBuf.Write(msg.data)
		}
		if m.session.Disconnected {
			return m, nil
		}
		return m, m.readSessionOutput()

	case sessionErrMsg:
		m.cleanupSession(msg.err)
		return m, nil

	case playbackFrameMsg:
		if !m.session.PlaybackDone {
			m.session.PlaybackBuf.Write(msg.data)
			m.session.PlaybackIdx = msg.idx
		}
		return m, m.playbackNext()

	case connectSuccessMsg:
		m.session.Session = msg.session
		m.session.Disconnected = false
		m.session.PlaybackBuf.Reset()
		m.session.Session.StartAudit()
		m.status = fmt.Sprintf("Connected to %s", msg.serverName)
		m.mode = ViewSession
		return m, m.readSessionOutput()

	case connectErrorMsg:
		m.err = msg.err
		m.status = fmt.Sprintf("Connection failed: %v", msg.err)
		m.mode = ViewServerList
		return m, nil

	case shareJoinMsg:
		m.session.ShareViewer = msg.viewer
		m.session.InShareMode = true
		m.session.Disconnected = false
		m.session.PlaybackBuf.Reset()
		m.shareID = msg.shareID
		m.status = fmt.Sprintf("Joined shared session: %s", msg.shareID)
		m.mode = ViewSession
		return m, m.readShareOutput()

	case shareDataMsg:
		if !m.session.Disconnected {
			m.session.PlaybackBuf.Write(msg.data)
		}
		if m.session.Disconnected {
			return m, nil
		}
		return m, m.readShareOutput()

	case shareErrMsg:
		m.err = msg.err
		m.status = fmt.Sprintf("Share session closed: %v", msg.err)
		m.session.InShareMode = false
		m.session.ShareViewer = nil
		m.session.Disconnected = true
		m.mode = ViewServerList
		return m, nil

	case auditSearchResultMsg:
		m.audit.SearchResults = msg.results
		m.status = fmt.Sprintf("Found %d commands", len(msg.results))
		return m, nil

	case auditTopResultMsg:
		m.audit.TopResults = msg.results
		m.status = fmt.Sprintf("Top %d commands", len(msg.results))
		return m, nil

	case auditStatsResultMsg:
		m.audit.TotalCmds = msg.total
		m.audit.UniqueCmds = msg.unique
		m.audit.FirstSeen = msg.first
		m.audit.LastSeen = msg.last
		return m, nil

	case auditServersResultMsg:
		m.audit.Servers = msg.servers
		return m, nil

	case auditErrMsg:
		m.err = msg.err
		m.status = fmt.Sprintf("Audit error: %v", msg.err)
		return m, nil

	case tickMsg:
		if m.session.Session != nil && !m.session.InShareMode && !m.session.Disconnected {
			return m, m.readSessionOutput()
		}
		return m, nil
	}

	return m, nil
}

func (m *Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c":
		if m.session.Session != nil {
			m.session.Session.Close()
			m.session.Session = nil
		}
		m.session.Disconnected = true
		if m.session.Player != nil {
			m.session.Player.Close()
			m.session.Player = nil
		}
		return m, tea.Quit

	case "q":
		if m.mode == ViewPlayback {
			m.stopPlayback()
			m.mode = ViewServerList
			return m, nil
		}
		if m.mode == ViewSession {
			m.cleanupSession(nil)
			return m, nil
		}
		if m.mode == ViewAudit || m.mode == ViewAuditSearch || m.mode == ViewAuditTop {
			m.cleanupAuditView()
			m.mode = ViewServerList
			return m, nil
		}
		return m, tea.Quit

	case "ctrl+h":
		if m.mode == ViewHelp {
			m.mode = ViewServerList
		} else {
			m.mode = ViewHelp
		}
		return m, nil

	case "ctrl+r":
		if m.mode == ViewServerList {
			m.shareMode = !m.shareMode
			if m.shareMode {
				m.status = "Share mode enabled - will share session on connect"
			} else {
				m.status = "Share mode disabled"
			}
		}
		return m, nil

	case "tab":
		if m.mode == ViewAudit || m.mode == ViewAuditTop || m.mode == ViewAuditSearch {
			m.audit.Mode = (m.audit.Mode + 1) % 3
			m.mode = ViewAudit
			switch m.audit.Mode {
			case 0:
				m.mode = ViewAudit
				return m, m.loadAuditStats()
			case 1:
				m.mode = ViewAuditTop
				return m, m.loadAuditTop()
			case 2:
				m.mode = ViewAuditSearch
				return m, nil
			}
		}
		return m, nil
	}

	switch m.mode {
	case ViewServerList:
		return m.handleServerListKey(msg)
	case ViewSession:
		return m.handleSessionKey(msg)
	case ViewPlayback:
		return m.handlePlaybackKey(msg)
	case ViewAudit:
		return m.handleAuditKey(msg)
	case ViewAuditSearch:
		return m.handleAuditSearchKey(msg)
	case ViewAuditTop:
		return m.handleAuditKey(msg)
	}

	return m, nil
}

func (m *Model) handleServerListKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.selected > 0 {
			m.selected--
		}
	case "down", "j":
		if m.selected < len(m.serverList)-1 {
			m.selected++
		}
	case "home", "g":
		m.selected = 0
	case "end", "G":
		m.selected = len(m.serverList) - 1
	case "enter":
		server := m.cfg.GetServer(m.serverList[m.selected])
		if server != nil {
			m.status = fmt.Sprintf("Connecting to %s...", server.Name)
			m.mode = ViewConnecting
			m.session.Disconnected = false
			return m, m.connectServer(server)
		}
	case "p":
		if m.selected < len(m.serverList) {
			server := m.cfg.GetServer(m.serverList[m.selected])
			if server != nil {
				return m, m.startPlayback(server)
			}
		}
	case "s":
		sessions := share.ListSessions()
		if len(sessions) > 0 {
			m.status = fmt.Sprintf("Available shared sessions: %v", sessions)
		} else {
			m.status = "No shared sessions available"
		}
	case "a":
		m.audit.Mode = 0
		m.mode = ViewAudit
		return m, tea.Batch(m.loadAuditStats(), m.loadAuditServers())
	}
	return m, nil
}

func (m *Model) handleSessionKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.session.InShareMode {
		return m, nil
	}

	if m.session.Session == nil || m.session.Disconnected {
		m.cleanupSession(nil)
		return m, nil
	}

	switch msg.String() {
	case "ctrl+d":
		m.cleanupSession(nil)
		return m, nil
	}

	return m, func() tea.Msg {
		if m.session.Session != nil && !m.session.Disconnected {
			m.session.Session.WriteStdin([]byte(msg.String()))
			_, err := m.session.Session.StdinPipe.Write([]byte(msg.String()))
			if err != nil {
				if isConnectionError(err) {
					return sessionErrMsg{err: fmt.Errorf("stdin write failed: %w", err)}
				}
			}
		}
		return tickMsg{}
	}
}

func (m *Model) handleAuditKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.audit.SelectedIdx > 0 {
			m.audit.SelectedIdx--
		}
	case "down", "j":
		if m.mode == ViewAuditTop {
			if m.audit.SelectedIdx < len(m.audit.TopResults)-1 {
				m.audit.SelectedIdx++
			}
		} else if m.mode == ViewAudit {
			if m.audit.SelectedIdx < len(m.audit.Servers)-1 {
				m.audit.SelectedIdx++
			}
		}
	case "t":
		m.audit.Mode = 1
		m.mode = ViewAuditTop
		return m, m.loadAuditTop()
	case "/":
		m.audit.Mode = 2
		m.audit.SearchKeyword = ""
		m.audit.SearchResults = nil
		m.mode = ViewAuditSearch
		return m, nil
	case "s":
		server := ""
		if m.audit.SelectedIdx < len(m.audit.Servers) {
			server = m.audit.Servers[m.audit.SelectedIdx]
		}
		return m, m.loadAuditTopFor(server)
	case "r":
		return m, tea.Batch(m.loadAuditStats(), m.loadAuditServers())
	}
	return m, nil
}

func (m *Model) handleAuditSearchKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "backspace":
		if len(m.audit.SearchKeyword) > 0 {
			m.audit.SearchKeyword = m.audit.SearchKeyword[:len(m.audit.SearchKeyword)-1]
		}
		return m, nil
	case "enter":
		server := ""
		if m.audit.SelectedIdx < len(m.audit.Servers) {
			server = m.audit.Servers[m.audit.SelectedIdx]
		}
		return m, m.loadAuditSearch(server, m.audit.SearchKeyword)
	case "esc":
		m.audit.SearchKeyword = ""
		m.audit.Mode = 0
		m.mode = ViewAudit
		return m, nil
	default:
		if len(msg.String()) == 1 && msg.String() >= " " && msg.String() <= "~" {
			m.audit.SearchKeyword += msg.String()
		}
		return m, nil
	}
}

func (m *Model) handlePlaybackKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case " ":
		if m.session.Player != nil {
			m.session.Player.SetPaused(!m.session.Player.Paused())
			if !m.session.Player.Paused() {
				return m, m.playbackNext()
			}
		}
	case "right", "l":
		if m.session.Player != nil {
			m.session.Player.Seek(m.session.Player.CurrentIdx() + 10)
		}
	case "left", "h":
		if m.session.Player != nil {
			m.session.Player.Seek(m.session.Player.CurrentIdx() - 10)
		}
	case ">":
		if m.session.Player != nil {
			m.session.Player.SetSpeed(m.session.Player.Speed() * 1.5)
		}
	case "<":
		if m.session.Player != nil {
			m.session.Player.SetSpeed(m.session.Player.Speed() / 1.5)
		}
	case "r":
		m.restartPlayback()
		return m, m.playbackNext()
	}
	return m, nil
}

func (m *Model) connectServer(server *config.ServerConfig) tea.Cmd {
	return func() tea.Msg {
		sess, err := sshclient.Connect(server)
		if err != nil {
			return connectErrorMsg{err: err}
		}

		if server.Record {
			if err := sess.StartRecording(server.RecordDir); err != nil {
				m.logs = append(m.logs, fmt.Sprintf("Recording start failed: %v", err))
			} else {
				m.logs = append(m.logs, fmt.Sprintf("Recording to %s", sess.Recorder.FilePath()))
			}
		}

		if m.shareMode {
			shareID := fmt.Sprintf("share-%s-%d", server.Name, time.Now().Unix())
			sess.StartShare(shareID)
			m.shareID = shareID
			m.logs = append(m.logs, fmt.Sprintf("Session shared as: %s", shareID))
		}

		return connectSuccessMsg{
			session:    sess,
			serverName: server.Name,
		}
	}
}

func (m *Model) loadAuditStats() tea.Cmd {
	return func() tea.Msg {
		auditor := audit.GetAuditor()
		if auditor == nil {
			return auditErrMsg{err: fmt.Errorf("audit not initialized")}
		}
		total, unique, first, last, err := auditor.Stats("")
		if err != nil {
			return auditErrMsg{err: err}
		}
		return auditStatsResultMsg{total: total, unique: unique, first: first, last: last}
	}
}

func (m *Model) loadAuditServers() tea.Cmd {
	return func() tea.Msg {
		auditor := audit.GetAuditor()
		if auditor == nil {
			return auditErrMsg{err: fmt.Errorf("audit not initialized")}
		}
		servers, err := auditor.ListServers()
		if err != nil {
			return auditErrMsg{err: err}
		}
		return auditServersResultMsg{servers: servers}
	}
}

func (m *Model) loadAuditTop() tea.Cmd {
	return func() tea.Msg {
		auditor := audit.GetAuditor()
		if auditor == nil {
			return auditErrMsg{err: fmt.Errorf("audit not initialized")}
		}
		results, err := auditor.TopCommands("", 10)
		if err != nil {
			return auditErrMsg{err: err}
		}
		return auditTopResultMsg{results: results}
	}
}

func (m *Model) loadAuditTopFor(server string) tea.Cmd {
	return func() tea.Msg {
		auditor := audit.GetAuditor()
		if auditor == nil {
			return auditErrMsg{err: fmt.Errorf("audit not initialized")}
		}
		results, err := auditor.TopCommands(server, 10)
		if err != nil {
			return auditErrMsg{err: err}
		}
		return auditTopResultMsg{results: results}
	}
}

func (m *Model) loadAuditSearch(server, keyword string) tea.Cmd {
	return func() tea.Msg {
		auditor := audit.GetAuditor()
		if auditor == nil {
			return auditErrMsg{err: fmt.Errorf("audit not initialized")}
		}
		results, err := auditor.Search(server, keyword, 50)
		if err != nil {
			return auditErrMsg{err: err}
		}
		return auditSearchResultMsg{results: results}
	}
}

func (m *Model) readSessionOutput() tea.Cmd {
	return func() tea.Msg {
		if m.session.Session == nil || m.session.Disconnected {
			return nil
		}

		type readResult struct {
			data []byte
			err  error
		}
		resultCh := make(chan readResult, 1)

		go func() {
			buf := make([]byte, 4096)
			n, err := m.session.Session.StdoutPipe.Read(buf)
			if n > 0 {
				resultCh <- readResult{data: buf[:n], err: err}
			} else {
				resultCh <- readResult{err: err}
			}
		}()

		select {
		case result := <-resultCh:
			if result.err != nil {
				if isConnectionError(result.err) {
					return sessionErrMsg{err: fmt.Errorf("connection lost: %w", result.err)}
				}
				return sessionErrMsg{err: result.err}
			}
			if len(result.data) > 0 {
				return sessionOutputMsg{data: result.data}
			}
			return tickMsg{}

		case <-time.After(readTimeout):
			return tickMsg{}
		}
	}
}

func (m *Model) readShareOutput() tea.Cmd {
	return func() tea.Msg {
		if m.session.ShareViewer == nil || m.session.Disconnected {
			return nil
		}

		type readResult struct {
			data []byte
			ok   bool
		}
		resultCh := make(chan readResult, 1)

		go func() {
			data, ok := <-m.session.ShareViewer.Data
			resultCh <- readResult{data: data, ok: ok}
		}()

		select {
		case result := <-resultCh:
			if !result.ok {
				return shareErrMsg{err: fmt.Errorf("share channel closed")}
			}
			return shareDataMsg{data: result.data}

		case <-time.After(readTimeout):
			return tickMsg{}
		}
	}
}

func (m *Model) startPlayback(server *config.ServerConfig) tea.Cmd {
	recordDir := server.RecordDir
	if recordDir == "" {
		recordDir = "./recordings"
	}

	files, err := os.ReadDir(recordDir)
	if err != nil {
		m.err = err
		m.status = fmt.Sprintf("Read record dir: %v", err)
		return nil
	}

	var latestFile string
	var latestTime time.Time
	for _, f := range files {
		if !f.IsDir() && strings.HasPrefix(f.Name(), server.Name) && strings.HasSuffix(f.Name(), ".ttyrec") {
			info, err := f.Info()
			if err == nil && info.ModTime().After(latestTime) {
				latestTime = info.ModTime()
				latestFile = f.Name()
			}
		}
	}

	if latestFile == "" {
		m.status = fmt.Sprintf("No recordings found for %s", server.Name)
		return nil
	}

	fullPath := recordDir + "/" + latestFile
	p, err := player.New(fullPath)
	if err != nil {
		m.err = err
		m.status = fmt.Sprintf("Open recording: %v", err)
		return nil
	}

	m.session.Player = p
	m.session.PlaybackBuf.Reset()
	m.session.PlaybackIdx = 0
	m.session.PlaybackDone = false
	m.mode = ViewPlayback
	m.status = fmt.Sprintf("Playing: %s (%d frames)", latestFile, p.TotalFrames())

	return m.playbackNext()
}

func (m *Model) playbackNext() tea.Cmd {
	if m.session.Player == nil || m.session.Player.Paused() {
		return nil
	}

	frame, ok := m.session.Player.NextFrame()
	if !ok {
		m.session.PlaybackDone = true
		return nil
	}

	return func() tea.Msg {
		delay := time.Duration(float64(frame.Delay) / m.session.Player.Speed())
		time.Sleep(delay)
		return playbackFrameMsg{
			data: frame.Data,
			idx:  m.session.Player.CurrentIdx(),
		}
	}
}

func (m *Model) stopPlayback() {
	if m.session.Player != nil {
		m.session.Player.Close()
		m.session.Player = nil
	}
	m.session.PlaybackBuf.Reset()
	m.session.PlaybackIdx = 0
	m.session.PlaybackDone = false
}

func (m *Model) restartPlayback() {
	if m.session.Player != nil {
		m.session.Player.Seek(0)
		m.session.Player.SetPaused(false)
		m.session.PlaybackBuf.Reset()
		m.session.PlaybackIdx = 0
		m.session.PlaybackDone = false
	}
}

func (m *Model) View() string {
	switch m.mode {
	case ViewServerList:
		return m.viewServerList()
	case ViewConnecting:
		return m.viewConnecting()
	case ViewSession:
		return m.viewSession()
	case ViewPlayback:
		return m.viewPlayback()
	case ViewHelp:
		return m.viewHelp()
	case ViewAudit:
		return m.viewAudit()
	case ViewAuditSearch:
		return m.viewAuditSearch()
	case ViewAuditTop:
		return m.viewAuditTop()
	default:
		return ""
	}
}

func (m *Model) viewServerList() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("SSH Bastion - Server List"))
	b.WriteString("\n\n")

	if len(m.serverList) == 0 {
		b.WriteString(statusStyle.Render("No servers configured"))
		return b.String()
	}

	for i, name := range m.serverList {
		prefix := "  "
		server := m.cfg.GetServer(name)
		jumpInfo := ""
		if server.JumpHost != "" {
			jumpInfo = fmt.Sprintf(" [via %s]", server.JumpHost)
		}
		recordInfo := ""
		if server.Record {
			recordInfo = " [REC]"
		}

		line := fmt.Sprintf("%s@%s:%d%s%s",
			server.User, server.Host, server.Port, jumpInfo, recordInfo)

		if i == m.selected {
			prefix = "▶ "
			b.WriteString(selectedStyle.Render(prefix + name + "  " + line))
		} else {
			b.WriteString(prefix + name + "  " + helpStyle.Render(line))
		}
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(statusStyle.Render(m.status))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("↑/↓:select  enter:connect  p:playback  s:list shared  a:audit  ctrl+r:toggle share  ctrl+h:help  q:quit"))

	if m.shareMode {
		b.WriteString("\n")
		b.WriteString(selectedStyle.Render("  [SHARING ENABLED]"))
	}

	return b.String()
}

func (m *Model) viewConnecting() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("Connecting..."))
	b.WriteString("\n\n")
	b.WriteString(statusStyle.Render(m.status))
	return b.String()
}

func (m *Model) viewSession() string {
	var b strings.Builder

	title := "SSH Session"
	if m.session.InShareMode {
		title = fmt.Sprintf("Shared Session - %s", m.shareID)
	} else if m.selected < len(m.serverList) {
		title = fmt.Sprintf("SSH Session - %s", m.serverList[m.selected])
	}

	b.WriteString(titleStyle.Render(title))
	b.WriteString("\n\n")

	if m.session.PlaybackBuf.Len() > 0 {
		b.WriteString(borderStyle.Render(m.session.PlaybackBuf.String()))
	} else {
		b.WriteString(statusStyle.Render("Waiting for output..."))
	}

	b.WriteString("\n\n")
	if m.session.InShareMode {
		b.WriteString(helpStyle.Render("View-only mode  q:disconnect  ctrl+c:quit"))
	} else if m.session.Disconnected {
		b.WriteString(selectedStyle.Render("  [CONNECTION LOST]  q:return to list  ctrl+c:quit"))
	} else {
		b.WriteString(helpStyle.Render("Type to interact  ctrl+d:disconnect  ctrl+c:quit"))
	}

	for _, log := range m.logs {
		b.WriteString("\n")
		b.WriteString(helpStyle.Render("  " + log))
	}

	return b.String()
}

func (m *Model) viewAudit() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Command Audit"))
	b.WriteString("\n\n")

	b.WriteString(activeBorderStyle.Render(fmt.Sprintf(
		"Total Commands: %d  |  Unique Commands: %d  |  First Seen: %s  |  Last Seen: %s",
		m.audit.TotalCmds,
		m.audit.UniqueCmds,
		m.audit.FirstSeen.Format("2006-01-02 15:04"),
		m.audit.LastSeen.Format("2006-01-02 15:04"),
	)))
	b.WriteString("\n\n")

	b.WriteString(selectedStyle.Render("  Servers with recorded commands:"))
	b.WriteString("\n\n")

	if len(m.audit.Servers) == 0 {
		b.WriteString(statusStyle.Render("  No servers found in audit database"))
	} else {
		for i, srv := range m.audit.Servers {
			prefix := "  "
			if i == m.audit.SelectedIdx {
				prefix = "▶ "
				b.WriteString(selectedStyle.Render(prefix + srv))
			} else {
				b.WriteString(prefix + srv)
			}
			b.WriteString("\n")
		}
	}

	b.WriteString("\n")
	b.WriteString(statusStyle.Render(m.status))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("↑/↓:select server  t:top commands  s:top for selected  /:search  r:refresh  tab:switch view  q:back"))

	return b.String()
}

func (m *Model) viewAuditTop() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Top 10 Commands"))
	b.WriteString("\n\n")

	if len(m.audit.TopResults) == 0 {
		b.WriteString(statusStyle.Render("  No command data available"))
	} else {
		maxCount := 0
		for _, r := range m.audit.TopResults {
			if r.Count > maxCount {
				maxCount = r.Count
			}
		}

		for i, r := range m.audit.TopResults {
			barLen := 0
			if maxCount > 0 {
				barLen = r.Count * 20 / maxCount
			}
			bar := strings.Repeat("█", barLen)
			if barLen == 0 && r.Count > 0 {
				bar = "▏"
			}

			rank := fmt.Sprintf("%2d.", i+1)
			line := fmt.Sprintf("%s %-25s %5d  %s",
				auditRankStyle.Render(rank),
				auditItemStyle.Render(shorten(r.Command, 25)),
				r.Count,
				bar,
			)
			b.WriteString(line)
			b.WriteString("\n")
		}
	}

	b.WriteString("\n")
	b.WriteString(statusStyle.Render(m.status))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("tab:switch view  s:filter by selected server  r:refresh  q:back"))

	return b.String()
}

func (m *Model) viewAuditSearch() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Search Commands"))
	b.WriteString("\n\n")

	b.WriteString(selectedStyle.Render("  Keyword: "))
	if m.audit.SearchKeyword == "" {
		b.WriteString(statusStyle.Render("[type to search, enter to execute]"))
	} else {
		b.WriteString(m.audit.SearchKeyword)
	}
	b.WriteString("\n\n")

	if m.audit.SelectedIdx < len(m.audit.Servers) {
		b.WriteString(helpStyle.Render(fmt.Sprintf("  Filter server: %s  (↑/↓ to change)", m.audit.Servers[m.audit.SelectedIdx])))
	} else {
		b.WriteString(helpStyle.Render("  Filter server: [all]  (↑/↓ to change)"))
	}
	b.WriteString("\n\n")

	if len(m.audit.SearchResults) > 0 {
		b.WriteString(selectedStyle.Render(fmt.Sprintf("  Found %d commands:", len(m.audit.SearchResults))))
		b.WriteString("\n\n")

		for i, rec := range m.audit.SearchResults {
			if i >= 20 {
				b.WriteString(helpStyle.Render(fmt.Sprintf("  ... and %d more", len(m.audit.SearchResults)-20)))
				break
			}
			line := fmt.Sprintf("  [%s] %s@%s: %s",
				rec.Timestamp.Format("15:04:05"),
				rec.User,
				rec.Server,
				shorten(rec.Command, 60),
			)
			b.WriteString(line)
			b.WriteString("\n")
		}
	} else if m.audit.SearchKeyword != "" {
		b.WriteString(statusStyle.Render("  No results. Press enter to search."))
	}

	b.WriteString("\n")
	b.WriteString(statusStyle.Render(m.status))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("type:keyword  ↑/↓:select server  enter:search  esc:clear  tab:switch view  q:back"))

	return b.String()
}

func shorten(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func (m *Model) viewPlayback() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Session Playback"))
	b.WriteString("\n\n")

	if m.session.Player != nil {
		progress := fmt.Sprintf("Frame: %d/%d  Speed: %.1fx",
			m.session.Player.CurrentIdx(),
			m.session.Player.TotalFrames(),
			m.session.Player.Speed())
		b.WriteString(statusStyle.Render(progress))
		b.WriteString("\n\n")

		if m.session.PlaybackBuf.Len() > 0 {
			b.WriteString(activeBorderStyle.Render(m.session.PlaybackBuf.String()))
		} else {
			b.WriteString(statusStyle.Render("No data..."))
		}

		if m.session.Player.Paused() {
			b.WriteString("\n")
			b.WriteString(selectedStyle.Render("  [PAUSED]"))
		}
		if m.session.PlaybackDone {
			b.WriteString("\n")
			b.WriteString(statusStyle.Render("  [PLAYBACK COMPLETE]  r:restart  q:quit"))
		}
	}

	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("space:pause/resume  ←/→:seek  >:speed up  <:speed down  r:restart  q:quit"))

	return b.String()
}

func (m *Model) viewHelp() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Help"))
	b.WriteString("\n\n")

	helpText := `
Server List:
  ↑/k, ↓/j    Navigate server list
  g/G         Go to top/bottom
  enter       Connect to selected server
  p           Play latest recording
  s           List active shared sessions
  a           Open command audit
  ctrl+r      Toggle session sharing
  ctrl+h      Show/hide this help
  q           Quit

SSH Session:
  Any key     Sent to remote shell (and audited)
  ctrl+d      Disconnect from server
  ctrl+c      Quit application

Command Audit:
  ↑/↓         Select server / Navigate results
  t           Show Top 10 commands
  s           Top commands for selected server
  /           Search commands by keyword
  r           Refresh data
  tab         Switch between views
  q           Return to server list

Playback:
  space       Pause/resume playback
  ←/→         Seek backward/forward 10 frames
  >/<         Increase/decrease playback speed
  r           Restart playback from beginning
  q           Exit playback

Configuration:
  Servers are read from config.yaml in the current directory.
  Recordings are saved in the directory specified per server.
  Commands are audited to SQLite database automatically.
  Sessions can be shared for multi-user viewing.
`
	b.WriteString(helpText)
	b.WriteString("\n")
	b.WriteString(helpStyle.Render("Press ctrl+h to return to server list"))

	return b.String()
}

var _ = sort.Strings
