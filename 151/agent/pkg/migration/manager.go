package migration

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"runtime"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type PlayerData struct {
	PlayerID   string                 `json:"playerId"`
	PlayerName string                 `json:"playerName"`
	Level      int32                  `json:"level"`
	Data       map[string]interface{} `json:"data"`
	DataSize   int64                  `json:"dataSize"`
}

type MigrationRecord struct {
	PlayerID    string    `json:"playerId"`
	PlayerName  string    `json:"playerName"`
	Level       int32     `json:"level"`
	DataSize    int64     `json:"dataSize"`
	MigrateTime time.Time `json:"migrateTime"`
	Status      string    `json:"status"`
	TargetPod   string    `json:"targetPod"`
}

type PortInfo struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	InUse    bool   `json:"inUse"`
	Pid      int    `json:"pid,omitempty"`
}

type DrainStatus struct {
	Phase          string     `json:"phase"`
	NewConnections bool       `json:"newConnections"`
	ActiveSessions int32      `json:"activeSessions"`
	StartTime      *time.Time `json:"startTime,omitempty"`
	Completed      bool       `json:"completed"`
}

type ShutdownStatus struct {
	Phase       string     `json:"phase"`
	SignalSent  bool       `json:"signalSent"`
	ProcessExited bool     `json:"processExited"`
	PortsReleased []int    `json:"portsReleased"`
	StartTime   *time.Time `json:"startTime,omitempty"`
	Completed   bool       `json:"completed"`
	Error       string     `json:"error,omitempty"`
}

type ResourceMetrics struct {
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryPercent float64 `json:"memoryPercent"`
	MemoryRSS     int64   `json:"memoryRSS"`
	MemoryLimit   int64   `json:"memoryLimit"`
	OnlinePlayers int32   `json:"onlinePlayers"`
	Timestamp     time.Time `json:"timestamp"`
	PodName       string  `json:"podName"`
}

type Manager struct {
	mu               sync.RWMutex
	podName          string
	podNamespace     string
	players          map[string]*PlayerData
	migrationHistory []MigrationRecord
	isFrozen         bool
	gameServerPid    int
	gamePorts        []int
	drainStatus      *DrainStatus
	shutdownStatus   *ShutdownStatus
	lastCPUStats     *cpuStats
}

var (
	globalManager *Manager
	once          sync.Once
)

func NewManager(podName, podNamespace string) *Manager {
	once = sync.Once{}
	once = sync.Once{}
	m := &Manager{
		podName:      podName,
		podNamespace: podNamespace,
		players:      make(map[string]*PlayerData),
		isFrozen:     false,
		gamePorts:    []int{9000, 9001},
	}
	globalManager = m
	return m
}

func GetManager() *Manager {
	return globalManager
}

func (m *Manager) SetGameServerPid(pid int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gameServerPid = pid
}

func (m *Manager) SetGamePorts(ports []int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gamePorts = ports
}

func (m *Manager) GetGamePorts() []int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.gamePorts
}

func (m *Manager) AddPlayer(player *PlayerData) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.players[player.PlayerID] = player
}

func (m *Manager) RemovePlayer(playerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.players, playerID)
}

func (m *Manager) GetPlayer(playerID string) (*PlayerData, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	player, exists := m.players[playerID]
	return player, exists
}

func (m *Manager) GetAllPlayers() []PlayerData {
	m.mu.RLock()
	defer m.mu.RUnlock()
	players := make([]PlayerData, 0, len(m.players))
	for _, p := range m.players {
		players = append(players, *p)
	}
	return players
}

func (m *Manager) GetPlayerCount() int32 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return int32(len(m.players))
}

func (m *Manager) FreezePlayers() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.isFrozen = true
}

func (m *Manager) UnfreezePlayers() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.isFrozen = false
}

func (m *Manager) IsFrozen() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.isFrozen
}

func (m *Manager) ExportPlayerData(playerID string) ([]byte, error) {
	player, exists := m.GetPlayer(playerID)
	if !exists {
		return nil, fmt.Errorf("player %s not found", playerID)
	}

	data, err := json.Marshal(player)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal player data: %w", err)
	}

	return data, nil
}

func (m *Manager) ImportPlayerData(data []byte) error {
	var player PlayerData
	if err := json.Unmarshal(data, &player); err != nil {
		return fmt.Errorf("failed to unmarshal player data: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isFrozen {
		return fmt.Errorf("players are frozen, cannot import new players")
	}

	m.players[player.PlayerID] = &player
	return nil
}

func (m *Manager) RecordMigration(playerID, playerName string, level int32, dataSize int64, status, targetPod string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.migrationHistory = append(m.migrationHistory, MigrationRecord{
		PlayerID:    playerID,
		PlayerName:  playerName,
		Level:       level,
		DataSize:    dataSize,
		MigrateTime: time.Now(),
		Status:      status,
		TargetPod:   targetPod,
	})
}

func (m *Manager) GetMigrationHistory() []MigrationRecord {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.migrationHistory
}

func (m *Manager) GetMigrationStats() (total, successful, failed int32) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total = int32(len(m.migrationHistory))
	for _, record := range m.migrationHistory {
		if record.Status == "success" {
			successful++
		} else {
			failed++
		}
	}
	return
}

func (m *Manager) ClearPlayers() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.players = make(map[string]*PlayerData)
}

func (m *Manager) StartDrain() *DrainStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	m.drainStatus = &DrainStatus{
		Phase:          "draining",
		NewConnections: false,
		ActiveSessions: int32(len(m.players)),
		StartTime:      &now,
		Completed:      false,
	}
	m.isFrozen = true
	return m.drainStatus
}

func (m *Manager) GetDrainStatus() *DrainStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.drainStatus == nil {
		return &DrainStatus{
			Phase:          "idle",
			NewConnections: true,
			ActiveSessions: int32(len(m.players)),
			Completed:      false,
		}
	}
	if len(m.players) == 0 {
		m.drainStatus.Completed = true
		m.drainStatus.ActiveSessions = 0
	}
	return m.drainStatus
}

func (m *Manager) StartShutdown() *ShutdownStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	m.shutdownStatus = &ShutdownStatus{
		Phase:       "shutting_down",
		SignalSent:  false,
		ProcessExited: false,
		PortsReleased: []int{},
		StartTime:   &now,
		Completed:   false,
	}
	return m.shutdownStatus
}

func (m *Manager) SendShutdownSignal() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.gameServerPid == 0 {
		m.gameServerPid = m.findGameServerPid()
	}

	if m.gameServerPid == 0 {
		m.shutdownStatus.SignalSent = true
		m.shutdownStatus.ProcessExited = true
		m.shutdownStatus.Phase = "no_process"
		return nil
	}

	process, err := os.FindProcess(m.gameServerPid)
	if err != nil {
		m.shutdownStatus.Error = fmt.Sprintf("failed to find process: %v", err)
		return fmt.Errorf("failed to find game server process: %w", err)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		m.shutdownStatus.Error = fmt.Sprintf("failed to send SIGTERM: %v", err)
		return fmt.Errorf("failed to send SIGTERM: %w", err)
	}

	m.shutdownStatus.SignalSent = true
	m.shutdownStatus.Phase = "waiting_exit"
	return nil
}

func (m *Manager) SendForceKillSignal() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.gameServerPid == 0 {
		m.shutdownStatus.ProcessExited = true
		return nil
	}

	process, err := os.FindProcess(m.gameServerPid)
	if err != nil {
		return fmt.Errorf("failed to find game server process: %w", err)
	}

	if err := process.Signal(syscall.SIGKILL); err != nil {
		return fmt.Errorf("failed to send SIGKILL: %w", err)
	}

	m.shutdownStatus.Phase = "force_killed"
	return nil
}

func (m *Manager) CheckProcessExited() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.gameServerPid == 0 {
		m.shutdownStatus.ProcessExited = true
		return true
	}

	process, err := os.FindProcess(m.gameServerPid)
	if err != nil {
		m.shutdownStatus.ProcessExited = true
		return true
	}

	err = process.Signal(syscall.Signal(0))
	if err != nil {
		m.shutdownStatus.ProcessExited = true
		m.shutdownStatus.Phase = "exited"
		return true
	}

	return false
}

func (m *Manager) CheckPortsReleased() ([]PortInfo, error) {
	m.mu.RLock()
	ports := make([]int, len(m.gamePorts))
	copy(ports, m.gamePorts)
	m.mu.RUnlock()

	results := make([]PortInfo, 0, len(ports))
	allReleased := true

	for _, port := range ports {
		portInfo := PortInfo{
			Port:     port,
			Protocol: "tcp",
			InUse:    false,
		}

		inUse, pid := m.checkPortInUse(port)
		if inUse {
			portInfo.InUse = true
			portInfo.Pid = pid
			allReleased = false
		}

		results = append(results, portInfo)
	}

	m.mu.Lock()
	if allReleased && m.shutdownStatus != nil {
		m.shutdownStatus.PortsReleased = ports
		m.shutdownStatus.Completed = true
		m.shutdownStatus.Phase = "completed"
	}
	m.mu.Unlock()

	return results, nil
}

func (m *Manager) checkPortInUse(port int) (bool, int) {
	addr := fmt.Sprintf(":%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return true, m.findListeningPid(port)
	}
	ln.Close()
	return false, 0
}

func (m *Manager) findListeningPid(port int) int {
	if data, err := os.ReadFile("/proc/net/tcp"); err == nil {
		return m.parseProcNetTCP(string(data), port)
	}
	return 0
}

func (m *Manager) parseProcNetTCP(content string, port int) int {
	lines := splitLines(content)
	targetHex := fmt.Sprintf("%04X", port)

	for _, line := range lines[1:] {
		fields := splitFields(line)
		if len(fields) < 10 {
			continue
		}

		localAddr := fields[1]
		parts := splitString(localAddr, ":")
		if len(parts) != 2 {
			continue
		}

		if parts[1] == targetHex {
			inode := fields[9]
			pid := m.findPidByInode(inode)
			if pid > 0 {
				return pid
			}
		}
	}
	return 0
}

func (m *Manager) findPidByInode(inode string) int {
	procDirs, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}

	for _, dir := range procDirs {
		if !dir.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(dir.Name())
		if err != nil {
			continue
		}

		fdDir := fmt.Sprintf("/proc/%d/fd", pid)
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}

		for _, fd := range fds {
			link, err := os.Readlink(fmt.Sprintf("%s/%s", fdDir, fd.Name()))
			if err != nil {
				continue
			}
			if contains(link, inode) {
				return pid
			}
		}
	}
	return 0
}

func (m *Manager) findGameServerPid() int {
	procDirs, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}

	for _, dir := range procDirs {
		if !dir.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(dir.Name())
		if err != nil {
			continue
		}

		cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}

		if contains(string(cmdline), "gameserver") || contains(string(cmdline), "game_server") {
			return pid
		}
	}
	return 0
}

func (m *Manager) GetShutdownStatus() *ShutdownStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.shutdownStatus == nil {
		return &ShutdownStatus{
			Phase:       "idle",
			SignalSent:  false,
			ProcessExited: false,
			PortsReleased: []int{},
			Completed:   false,
		}
	}
	return m.shutdownStatus
}

func (m *Manager) GetStatus() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total, successful, failed := m.GetMigrationStats()

	return map[string]interface{}{
		"podName":      m.podName,
		"podNamespace": m.podNamespace,
		"playerCount":  len(m.players),
		"isFrozen":     m.isFrozen,
		"gameServerPid": m.gameServerPid,
		"gamePorts":    m.gamePorts,
		"drainStatus":  m.drainStatus,
		"shutdownStatus": m.shutdownStatus,
		"migration": map[string]interface{}{
			"total":      total,
			"successful": successful,
			"failed":     failed,
			"history":    m.migrationHistory,
		},
	}
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 {
				lines = append(lines, line)
			}
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func splitFields(s string) []string {
	var fields []string
	start := -1
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' {
			if start >= 0 {
				fields = append(fields, s[start:i])
				start = -1
			}
		} else if start < 0 {
			start = i
		}
	}
	if start >= 0 {
		fields = append(fields, s[start:])
	}
	return fields
}

func splitString(s, sep string) []string {
	var parts []string
	start := 0
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			parts = append(parts, s[start:i])
			i += len(sep) - 1
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

type cpuStats struct {
	utime  uint64
	stime  uint64
	cutime uint64
	cstime uint64
}

func (m *Manager) GetResourceMetrics() (*ResourceMetrics, error) {
	m.mu.RLock()
	podName := m.podName
	playerCount := int32(len(m.players))
	m.mu.RUnlock()

	cpuPercent, err := m.getProcessCPUPercent()
	if err != nil {
		cpuPercent = 0
	}

	memoryRSS, memoryLimit, memoryPercent := m.getProcessMemory()

	return &ResourceMetrics{
		CPUPercent:    cpuPercent,
		MemoryPercent: memoryPercent,
		MemoryRSS:     memoryRSS,
		MemoryLimit:   memoryLimit,
		OnlinePlayers: playerCount,
		Timestamp:     time.Now(),
		PodName:       podName,
	}, nil
}

func (m *Manager) getProcessCPUPercent() (float64, error) {
	pid := m.gameServerPid
	if pid == 0 {
		pid = m.findGameServerPid()
	}
	if pid == 0 {
		return 0, nil
	}

	stats, err := m.readProcStat(pid)
	if err != nil {
		return 0, err
	}

	m.mu.RLock()
	lastStats := m.lastCPUStats
	m.mu.RUnlock()

	if lastStats == nil {
		m.mu.Lock()
		m.lastCPUStats = stats
		m.mu.Unlock()
		time.Sleep(100 * time.Millisecond)
		stats, err = m.readProcStat(pid)
		if err != nil {
			return 0, err
		}
	}

	cpuTotal := float64(stats.utime+stats.stime+stats.cutime+stats.cstime) -
		float64(lastStats.utime+lastStats.stime+lastStats.cutime+lastStats.cstime)

	numCPU := float64(runtime.NumCPU())
	cpuPercent := (cpuTotal / 100.0) * 100.0 / numCPU

	m.mu.Lock()
	m.lastCPUStats = stats
	m.mu.Unlock()

	if cpuPercent < 0 {
		cpuPercent = 0
	}
	if cpuPercent > 100 {
		cpuPercent = 100
	}

	return cpuPercent, nil
}

func (m *Manager) readProcStat(pid int) (*cpuStats, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return nil, err
	}

	content := string(data)
	fields := splitFields(content)

	utime, _ := strconv.ParseUint(fields[13], 10, 64)
	stime, _ := strconv.ParseUint(fields[14], 10, 64)
	cutime, _ := strconv.ParseUint(fields[15], 10, 64)
	cstime, _ := strconv.ParseUint(fields[16], 10, 64)

	return &cpuStats{
		utime:  utime,
		stime:  stime,
		cutime: cutime,
		cstime: cstime,
	}, nil
}

func (m *Manager) getProcessMemory() (int64, int64, float64) {
	pid := m.gameServerPid
	if pid == 0 {
		pid = m.findGameServerPid()
	}
	if pid == 0 {
		return 0, 0, 0
	}

	rss := int64(0)
	if data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid)); err == nil {
		for _, line := range splitLines(string(data)) {
			if hasPrefix(line, "VmRSS:") {
				fields := splitFields(line)
				if len(fields) >= 2 {
					val, err := strconv.ParseInt(fields[1], 10, 64)
					if err == nil {
						rss = val * 1024
					}
				}
				break
			}
		}
	}

	limit := int64(0)
	if data, err := os.ReadFile(fmt.Sprintf("/proc/%d/limits", pid)); err == nil {
		for _, line := range splitLines(string(data)) {
			if contains(line, "Max address space") {
				fields := splitFields(line)
				if len(fields) >= 4 {
					val, err := strconv.ParseInt(fields[3], 10, 64)
					if err == nil {
						limit = val
					}
				}
				break
			}
		}
	}

	memoryPercent := float64(0)
	if limit > 0 {
		memoryPercent = float64(rss) / float64(limit) * 100
	}

	return rss, limit, memoryPercent
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func contains(s, substr string) bool {
	if len(substr) == 0 {
		return true
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
