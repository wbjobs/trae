package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"gameserver-agent/pkg/migration"

	"github.com/gorilla/mux"
)

type Server struct {
	httpServer       *http.Server
	migrationManager *migration.Manager
	port             string
}

type HealthResponse struct {
	Status    string `json:"status"`
	PlayerNum int32  `json:"playerNum"`
	Version   string `json:"version"`
	Frozen    bool   `json:"frozen"`
}

type PlayerListResponse struct {
	Players []migration.PlayerData `json:"players"`
	Total   int32                  `json:"total"`
}

type MigrationRequest struct {
	SourcePod string                 `json:"sourcePod"`
	TargetPod string                 `json:"targetPod"`
	Players   []migration.PlayerData `json:"players"`
	Timeout   int32                  `json:"timeout"`
}

type PlayerResult struct {
	PlayerID string `json:"playerId"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

type MigrationResponse struct {
	Success bool           `json:"success"`
	Results []PlayerResult `json:"results"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type DrainRequest struct {
	TimeoutSeconds int32 `json:"timeoutSeconds"`
}

type ShutdownRequest struct {
	Force          bool  `json:"force"`
	TimeoutSeconds int32 `json:"timeoutSeconds"`
}

type PortCheckResponse struct {
	Ports       []migration.PortInfo `json:"ports"`
	AllReleased bool                 `json:"allReleased"`
	CheckedAt   time.Time            `json:"checkedAt"`
}

func NewServer(port string, mm *migration.Manager) *Server {
	s := &Server{
		migrationManager: mm,
		port:             port,
	}

	router := mux.NewRouter()
	router.HandleFunc("/health", s.handleHealth).Methods("GET")
	router.HandleFunc("/players", s.handleGetPlayers).Methods("GET")
	router.HandleFunc("/players/{id}", s.handleGetPlayer).Methods("GET")
	router.HandleFunc("/players/{id}/export", s.handleExportPlayer).Methods("GET")
	router.HandleFunc("/players/import", s.handleImportPlayer).Methods("POST")
	router.HandleFunc("/players/{id}", s.handleDeletePlayer).Methods("DELETE")
	router.HandleFunc("/migrate", s.handleMigrate).Methods("POST")
	router.HandleFunc("/freeze", s.handleFreeze).Methods("POST")
	router.HandleFunc("/unfreeze", s.handleUnfreeze).Methods("POST")
	router.HandleFunc("/drain", s.handleDrain).Methods("POST")
	router.HandleFunc("/drain/status", s.handleDrainStatus).Methods("GET")
	router.HandleFunc("/shutdown", s.handleShutdown).Methods("POST")
	router.HandleFunc("/shutdown/signal", s.handleShutdownSignal).Methods("POST")
	router.HandleFunc("/shutdown/force", s.handleForceKill).Methods("POST")
	router.HandleFunc("/shutdown/status", s.handleShutdownStatus).Methods("GET")
	router.HandleFunc("/ports/check", s.handleCheckPorts).Methods("GET")
	router.HandleFunc("/ports/config", s.handleConfigPorts).Methods("PUT")
	router.HandleFunc("/metrics/resource", s.handleResourceMetrics).Methods("GET")
	router.HandleFunc("/status", s.handleStatus).Methods("GET")

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	return s
}

func (s *Server) Start() error {
	log.Printf("Starting HTTP server on port %s", s.port)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:    "healthy",
		PlayerNum: s.migrationManager.GetPlayerCount(),
		Version:   "1.0.0",
		Frozen:    s.migrationManager.IsFrozen(),
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetPlayers(w http.ResponseWriter, r *http.Request) {
	players := s.migrationManager.GetAllPlayers()
	resp := PlayerListResponse{
		Players: players,
		Total:   int32(len(players)),
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetPlayer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerID := vars["id"]

	player, exists := s.migrationManager.GetPlayer(playerID)
	if !exists {
		writeError(w, http.StatusNotFound, "Player not found")
		return
	}

	writeJSON(w, http.StatusOK, player)
}

func (s *Server) handleExportPlayer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerID := vars["id"]

	data, err := s.migrationManager.ExportPlayerData(playerID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (s *Server) handleImportPlayer(w http.ResponseWriter, r *http.Request) {
	var player migration.PlayerData
	if err := json.NewDecoder(r.Body).Decode(&player); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if s.migrationManager.IsFrozen() {
		writeError(w, http.StatusForbidden, "Players are frozen, cannot import")
		return
	}

	s.migrationManager.AddPlayer(&player)

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, http.StatusCreated, map[string]string{
		"message": "Player imported successfully",
		"playerId": player.PlayerID,
	})
}

func (s *Server) handleDeletePlayer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerID := vars["id"]

	s.migrationManager.RemovePlayer(playerID)

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Player deleted successfully",
	})
}

func (s *Server) handleMigrate(w http.ResponseWriter, r *http.Request) {
	var req MigrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	results := make([]PlayerResult, 0, len(req.Players))
	successCount := 0

	for _, player := range req.Players {
		result := PlayerResult{
			PlayerID: player.PlayerID,
			Success:  false,
		}

		if err := s.migrationManager.ImportPlayerData(mustMarshal(player)); err != nil {
			result.Error = err.Error()
			s.migrationManager.RecordMigration(player.PlayerID, player.PlayerName, player.Level, player.DataSize, "failed", req.TargetPod)
		} else {
			result.Success = true
			successCount++
			s.migrationManager.RecordMigration(player.PlayerID, player.PlayerName, player.Level, player.DataSize, "success", req.TargetPod)
		}

		results = append(results, result)
	}

	resp := MigrationResponse{
		Success: successCount == len(req.Players),
		Results: results,
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleFreeze(w http.ResponseWriter, r *http.Request) {
	s.migrationManager.FreezePlayers()

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Players frozen successfully",
	})
}

func (s *Server) handleUnfreeze(w http.ResponseWriter, r *http.Request) {
	s.migrationManager.UnfreezePlayers()

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Players unfrozen successfully",
	})
}

func (s *Server) handleDrain(w http.ResponseWriter, r *http.Request) {
	var req DrainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req = DrainRequest{TimeoutSeconds: 60}
	}

	drainStatus := s.migrationManager.StartDrain()
	drainStatus.Phase = "draining"
	drainStatus.NewConnections = false

	log.Printf("Drain started, active sessions: %d", drainStatus.ActiveSessions)

	writeJSON(w, http.StatusOK, drainStatus)
}

func (s *Server) handleDrainStatus(w http.ResponseWriter, r *http.Request) {
	status := s.migrationManager.GetDrainStatus()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleShutdown(w http.ResponseWriter, r *http.Request) {
	var req ShutdownRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req = ShutdownRequest{Force: false, TimeoutSeconds: 30}
	}

	shutdownStatus := s.migrationManager.StartShutdown()
	log.Printf("Shutdown started, force=%v", req.Force)

	if req.Force {
		if err := s.migrationManager.SendForceKillSignal(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if err := s.migrationManager.SendShutdownSignal(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, shutdownStatus)
}

func (s *Server) handleShutdownSignal(w http.ResponseWriter, r *http.Request) {
	if err := s.migrationManager.SendShutdownSignal(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "SIGTERM sent to game server process",
	})
}

func (s *Server) handleForceKill(w http.ResponseWriter, r *http.Request) {
	if err := s.migrationManager.SendForceKillSignal(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "SIGKILL sent to game server process",
	})
}

func (s *Server) handleShutdownStatus(w http.ResponseWriter, r *http.Request) {
	status := s.migrationManager.GetShutdownStatus()

	exited := s.migrationManager.CheckProcessExited()
	if exited {
		status.ProcessExited = true
	}

	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleCheckPorts(w http.ResponseWriter, r *http.Request) {
	ports, err := s.migrationManager.CheckPortsReleased()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	allReleased := true
	for _, p := range ports {
		if p.InUse {
			allReleased = false
			break
		}
	}

	resp := PortCheckResponse{
		Ports:       ports,
		AllReleased: allReleased,
		CheckedAt:   time.Now(),
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleConfigPorts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Ports []int `json:"ports"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	s.migrationManager.SetGamePorts(req.Ports)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Game ports configured",
		"ports":   req.Ports,
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := s.migrationManager.GetStatus()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleResourceMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := s.migrationManager.GetResourceMetrics()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, metrics)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	resp := ErrorResponse{
		Error:   http.StatusText(status),
		Message: message,
	}
	writeJSON(w, status, resp)
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
