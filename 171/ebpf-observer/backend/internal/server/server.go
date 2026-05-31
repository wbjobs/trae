package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"ebpf-observer/backend/internal/model"
	"ebpf-observer/backend/internal/store"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Server struct {
	store   *store.Store
	httpSrv *http.Server
}

func New(addr string, s *store.Store) *Server {
	srv := &Server{store: s}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/topology", srv.handleTopology)
	mux.HandleFunc("/ws", srv.handleWS)
	mux.HandleFunc("/services", srv.handleServices)
	mux.HandleFunc("/http/stats", srv.handleHttpStats)
	mux.HandleFunc("/http/recent", srv.handleHttpRecent)

	srv.httpSrv = &http.Server{
		Addr:         addr,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	return srv
}

func corsMiddleware(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	health := s.store.GetAllHealth()
	writeJSON(w, health)
}

func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	topo := s.store.GetTopology()
	writeJSON(w, topo)
}

func (s *Server) handleServices(w http.ResponseWriter, r *http.Request) {
	health := s.store.GetAllHealth()
	writeJSON(w, health)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}
	defer conn.Close()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		payload := map[string]interface{}{
			"health":     s.store.GetAllHealth(),
			"topology":   s.store.GetTopology(),
			"http_stats": s.store.GetHttpStats(),
			"http_recent": s.store.GetRecentHttp(),
		}
		data, err := json.Marshal(payload)
		if err != nil {
			log.Printf("marshal ws: %v", err)
			return
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("ws write: %v", err)
			return
		}
	}
}

func (s *Server) handleHttpStats(w http.ResponseWriter, r *http.Request) {
	stats := s.store.GetHttpStats()
	writeJSON(w, stats)
}

func (s *Server) handleHttpRecent(w http.ResponseWriter, r *http.Request) {
	recent := s.store.GetRecentHttp()
	writeJSON(w, recent)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (s *Server) Start() error {
	log.Printf("server listening on %s", s.httpSrv.Addr)
	return s.httpSrv.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpSrv.Shutdown(ctx)
}

func (s *Server) Store() *store.Store {
	return s.store
}

var _ = model.ServiceHealth{}
