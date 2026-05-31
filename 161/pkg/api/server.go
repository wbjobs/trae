package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/dapr-wasm/middleware/pkg/config"
	"github.com/dapr-wasm/middleware/pkg/engine"
	"github.com/dapr-wasm/middleware/pkg/reload"
	"github.com/gorilla/mux"
)

type Server struct {
	store    *config.Store
	engine   *engine.Engine
	reloader *reload.HotReloader
	router   *mux.Router
}

func NewServer(store *config.Store, eng *engine.Engine, reloader *reload.HotReloader) *Server {
	s := &Server{
		store:    store,
		engine:   eng,
		reloader: reloader,
		router:   mux.NewRouter(),
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.router.HandleFunc("/api/health", s.handleHealth).Methods("GET")
	s.router.HandleFunc("/api/filters", s.handleListFilters).Methods("GET")
	s.router.HandleFunc("/api/filters", s.handleAddFilter).Methods("POST")
	s.router.HandleFunc("/api/filters/{name}", s.handleGetFilter).Methods("GET")
	s.router.HandleFunc("/api/filters/{name}", s.handleUpdateFilter).Methods("PUT")
	s.router.HandleFunc("/api/filters/{name}", s.handleDeleteFilter).Methods("DELETE")
	s.router.HandleFunc("/api/filters/{name}/enable", s.handleEnableFilter).Methods("POST")
	s.router.HandleFunc("/api/filters/{name}/disable", s.handleDisableFilter).Methods("POST")
	s.router.HandleFunc("/api/chain", s.handleGetChain).Methods("GET")
	s.router.HandleFunc("/api/chain/reorder", s.handleReorderChain).Methods("POST")
	s.router.HandleFunc("/api/chain/reload/{name}", s.handleReloadFilter).Methods("POST")
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleListFilters(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.store.List())
}

func (s *Server) handleGetFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	meta, err := s.store.Get(name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleAddFilter(w http.ResponseWriter, r *http.Request) {
	var meta engine.FilterMeta
	if err := json.NewDecoder(r.Body).Decode(&meta); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.store.Add(meta); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}

	if err := s.engine.LoadFilter(meta); err != nil {
		log.Printf("failed to load filter %s: %v", meta.Name, err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if s.reloader != nil {
		s.reloader.Register(meta)
	}

	writeJSON(w, http.StatusCreated, meta)
}

func (s *Server) handleUpdateFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	var meta engine.FilterMeta
	if err := json.NewDecoder(r.Body).Decode(&meta); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	meta.Name = name

	if err := s.store.Update(meta); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.engine.ReloadFilter(meta); err != nil {
		log.Printf("failed to reload filter %s: %v", meta.Name, err)
	}

	if s.reloader != nil {
		s.reloader.Register(meta)
	}

	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleDeleteFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if err := s.engine.UnloadFilter(name); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.store.Delete(name); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if s.reloader != nil {
		s.reloader.Unregister(name)
	}

	writeJSON(w, http.StatusOK, map[string]string{"deleted": name})
}

func (s *Server) handleEnableFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	meta, err := s.store.Get(name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	meta.Enabled = true
	if err := s.store.Update(meta); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := s.engine.LoadFilter(meta); err != nil {
		s.engine.ReloadFilter(meta)
	}

	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleDisableFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	meta, err := s.store.Get(name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	meta.Enabled = false
	if err := s.store.Update(meta); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := s.engine.UnloadFilter(name); err != nil {
		log.Printf("disable: unload %s: %v", name, err)
	}

	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleGetChain(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.engine.GetChain())
}

func (s *Server) handleReorderChain(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Names []string `json:"names"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.store.Reorder(req.Names); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, name := range req.Names {
		meta, err := s.store.Get(name)
		if err != nil {
			continue
		}
		s.engine.ReloadFilter(meta)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"order": req.Names})
}

func (s *Server) handleReloadFilter(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	meta, err := s.store.Get(name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.engine.ReloadFilter(meta); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"reloaded": name})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
