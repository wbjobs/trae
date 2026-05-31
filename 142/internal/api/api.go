package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/mqtt-shared-sub/lb/internal/balancer"
	"github.com/mqtt-shared-sub/lb/internal/model"
)

type API struct {
	lb      *balancer.LoadBalancer
	server  *http.Server
	addr    string
}

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type ChangeStrategyRequest struct {
	Strategy model.DistributionStrategy `json:"strategy"`
}

type CreateGroupRequest struct {
	Name     string                     `json:"name"`
	Topic    string                     `json:"topic"`
	Strategy model.DistributionStrategy `json:"strategy"`
}

type PublishRequest struct {
	Topic   string `json:"topic"`
	Payload string `json:"payload"`
	QoS     byte   `json:"qos"`
	Retain  bool   `json:"retain"`
}

type ResendDeadLetterRequest struct {
	MessageID string `json:"message_id"`
}

func NewAPI(lb *balancer.LoadBalancer, addr string) *API {
	return &API{
		lb:   lb,
		addr: addr,
	}
}

func (a *API) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/health", a.handleHealth)
	mux.HandleFunc("/api/v1/groups", a.handleGroups)
	mux.HandleFunc("/api/v1/groups/", a.handleGroupByID)
	mux.HandleFunc("/api/v1/metrics", a.handleMetrics)
	mux.HandleFunc("/api/v1/strategy/", a.handleStrategyChange)
	mux.HandleFunc("/api/v1/publish", a.handlePublish)
	mux.HandleFunc("/api/v1/subscribers", a.handleSubscribers)
	mux.HandleFunc("/api/v1/dead-letter/", a.handleDeadLetter)
	mux.HandleFunc("/api/v1/dead-letter/resend", a.handleDeadLetterResend)
	mux.HandleFunc("/api/v1/dedup/stats", a.handleDedupStats)
	mux.HandleFunc("/api/v1/dedup/clear", a.handleDedupClear)

	a.server = &http.Server{
		Addr:         a.addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("[API] Management API listening on %s", a.addr)
	return a.server.ListenAndServe()
}

func (a *API) Shutdown() error {
	if a.server != nil {
		return a.server.Close()
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    map[string]string{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339)},
	})
}

func (a *API) handleGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		groups := a.lb.GetAllGroups()
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    groups,
		})
	case http.MethodPost:
		var req CreateGroupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   "invalid request body",
			})
			return
		}
		if req.Name == "" || req.Topic == "" {
			writeJSON(w, http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   "name and topic are required",
			})
			return
		}
		strat := req.Strategy
		if strat == "" {
			strat = model.StrategyRoundRobin
		}
		if err := a.lb.RegisterGroup(req.Name, req.Topic, strat); err != nil {
			writeJSON(w, http.StatusInternalServerError, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{
			Success: true,
			Message: "group created",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed",
		})
	}
}

func (a *API) handleGroupByID(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Path[len("/api/v1/groups/"):]
	if name == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "group name is required",
		})
		return
	}

	switch r.Method {
	case http.MethodGet:
		group, err := a.lb.GetGroup(name)
		if err != nil {
			writeJSON(w, http.StatusNotFound, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    group,
		})
	case http.MethodDelete:
		if err := a.lb.UnregisterGroup(name); err != nil {
			writeJSON(w, http.StatusNotFound, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Message: "group deleted",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed",
		})
	}
}

func (a *API) handleMetrics(w http.ResponseWriter, r *http.Request) {
	m := a.lb.GetMetrics()
	m.MutexRLock()

	_, dedupHits, dedupMisses, dedupSize := a.lb.GetDedupStats()

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"total_messages":    m.TotalMessages,
			"dispatched":        m.Dispatched,
			"failed":            m.Failed,
			"retried":           m.Retried,
			"dead_letter_count": m.DeadLetterCount,
			"dedup_hits":        dedupHits,
			"dedup_misses":      dedupMisses,
			"dedup_cache_size":  dedupSize,
			"avg_dispatch_ms":   m.AvgDispatchTime.Milliseconds(),
		},
	})

	m.MutexRUnlock()
}

func (a *API) handleStrategyChange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed, use PUT",
		})
		return
	}

	name := r.URL.Path[len("/api/v1/strategy/"):]
	if name == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "group name is required",
		})
		return
	}

	var req ChangeStrategyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "invalid request body",
		})
		return
	}

	if req.Strategy != model.StrategyRoundRobin &&
		req.Strategy != model.StrategyRandom &&
		req.Strategy != model.StrategyLRU {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "invalid strategy, must be round_robin, random, or lru",
		})
		return
	}

	if err := a.lb.ChangeStrategy(name, req.Strategy); err != nil {
		writeJSON(w, http.StatusNotFound, APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "strategy changed",
	})
}

func (a *API) handlePublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	var req PublishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "invalid request body",
		})
		return
	}

	if req.Topic == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "topic is required",
		})
		return
	}

	if err := a.lb.Publish(req.Topic, []byte(req.Payload), req.QoS, req.Retain); err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "message published",
	})
}

func (a *API) handleSubscribers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	groupName := r.URL.Query().Get("group")
	if groupName != "" {
		group, err := a.lb.GetGroup(groupName)
		if err != nil {
			writeJSON(w, http.StatusNotFound, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    group.GetSubscribers(),
		})
		return
	}

	allSubs := make([]*model.Subscriber, 0)
	for _, g := range a.lb.GetAllGroups() {
		allSubs = append(allSubs, g.GetSubscribers()...)
	}
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    allSubs,
	})
}

func (a *API) handleDeadLetter(w http.ResponseWriter, r *http.Request) {
	groupName := strings.TrimPrefix(r.URL.Path, "/api/v1/dead-letter/")
	if groupName == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "group name is required",
		})
		return
	}

	switch r.Method {
	case http.MethodGet:
		msgs, err := a.lb.GetDeadLetterMessages(groupName)
		if err != nil {
			writeJSON(w, http.StatusNotFound, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    msgs,
		})
	case http.MethodDelete:
		if err := a.lb.ClearDeadLetter(groupName); err != nil {
			writeJSON(w, http.StatusNotFound, APIResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Message: "dead letter queue cleared",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed, use GET or DELETE",
		})
	}
}

func (a *API) handleDeadLetterResend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed, use POST",
		})
		return
	}

	groupName := r.URL.Query().Get("group")
	if groupName == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "group query parameter is required",
		})
		return
	}

	var req ResendDeadLetterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "invalid request body",
		})
		return
	}

	if err := a.lb.ResendDeadLetter(groupName, req.MessageID); err != nil {
		writeJSON(w, http.StatusNotFound, APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "message queued for resend",
	})
}

func (a *API) handleDedupStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed, use GET",
		})
		return
	}

	enabled, hits, misses, size := a.lb.GetDedupStats()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"enabled":    enabled,
			"hits":       hits,
			"misses":     misses,
			"cache_size": size,
		},
	})
}

func (a *API) handleDedupClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "method not allowed, use DELETE",
		})
		return
	}

	a.lb.ClearDedupCache()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "dedup cache cleared",
	})
}
