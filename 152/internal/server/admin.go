package server

import (
	"encoding/json"
	"net/http"
	"time"

	"ztunnel/internal/totp"
)

type AdminServer struct {
	registry  *ServiceRegistry
	sessions  *SessionManager
	audit     *AuditLogger
	tokens    *TokenManager
	adminToken string
}

func NewAdminServer(
	registry *ServiceRegistry,
	sessions *SessionManager,
	audit *AuditLogger,
	tokens *TokenManager,
	adminToken string,
) *AdminServer {
	return &AdminServer{
		registry:   registry,
		sessions:   sessions,
		audit:      audit,
		tokens:     tokens,
		adminToken: adminToken,
	}
}

func (as *AdminServer) Start(addr string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/auth", as.handleAuth)
	mux.HandleFunc("/api/services", as.handleServices)
	mux.HandleFunc("/api/services/", as.handleServiceByID)
	mux.HandleFunc("/api/authorize", as.handleAuthorize)
	mux.HandleFunc("/api/revoke", as.handleRevoke)
	mux.HandleFunc("/api/sessions", as.handleSessions)
	mux.HandleFunc("/api/audit", as.handleAudit)
	mux.HandleFunc("/api/totp/generate", as.handleTOTPGenerate)
	mux.HandleFunc("/api/locks", as.handleLocks)
	mux.HandleFunc("/api/locks/", as.handleLockByCN)
	mux.HandleFunc("/api/unlock", as.handleUnlock)
	mux.HandleFunc("/api/geo/history", as.handleGeoHistory)
	mux.HandleFunc("/api/geo/history/", as.handleGeoHistoryByCN)
	mux.HandleFunc("/api/geo/clear", as.handleGeoClear)

	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	return server.ListenAndServe()
}

func (as *AdminServer) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Admin-Token")
		if token != as.adminToken {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (as *AdminServer) handleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	sourceIP := r.RemoteAddr

	clientCN := "unknown"
	if cn, err := as.tokens.ClientCNFromCert(req.ClientCertPEM); err == nil {
		clientCN = cn
	}

	resp, err := as.tokens.Authenticate(req, sourceIP)
	if err != nil {
		status := "failed"
		if err == ErrAccountLocked {
			status = "locked"
		}
		as.audit.LogAuthAttempt(clientCN, sourceIP, req.ServiceID, status)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(resp)
		return
	}

	as.audit.LogAuthAttempt(clientCN, sourceIP, req.ServiceID, "success")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (as *AdminServer) handleServices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		services := as.registry.GetAll()
		json.NewEncoder(w).Encode(services)

	case http.MethodPost:
		as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			var svc ServiceAccess
			if err := json.NewDecoder(r.Body).Decode(&svc); err != nil {
				http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
				return
			}
			svc.CreatedAt = time.Now()
			as.registry.Register(&svc)
			as.audit.LogAccessChange("admin", svc.ID, svc.Name, "register_service")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(svc)
		})(w, r)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (as *AdminServer) handleServiceByID(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/services/"):]
	if id == "" {
		http.Error(w, `{"error":"service id required"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		svc, ok := as.registry.Get(id)
		if !ok {
			http.Error(w, `{"error":"service not found"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(svc)

	case http.MethodDelete:
		as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			as.registry.Unregister(id)
			as.audit.LogAccessChange("admin", id, "", "unregister_service")
			w.WriteHeader(http.StatusNoContent)
		})(w, r)

	case http.MethodPut:
		as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			var update struct {
				Enabled *bool `json:"enabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
				http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
				return
			}
			if update.Enabled != nil {
				if err := as.registry.SetEnabled(id, *update.Enabled); err != nil {
					http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
					return
				}
				action := "disable_service"
				if *update.Enabled {
					action = "enable_service"
				}
				as.audit.LogAccessChange("admin", id, "", action)
			}
			svc, _ := as.registry.Get(id)
			json.NewEncoder(w).Encode(svc)
		})(w, r)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (as *AdminServer) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ServiceID string `json:"service_id"`
			ClientCN  string `json:"client_cn"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		if err := as.registry.GrantAccess(req.ServiceID, req.ClientCN); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
			return
		}

		as.audit.LogAccessChange("admin", req.ServiceID, req.ClientCN, "grant_access")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "authorized"})
	})(w, r)
}

func (as *AdminServer) handleRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ServiceID string `json:"service_id"`
			ClientCN  string `json:"client_cn"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		if err := as.registry.RevokeAccess(req.ServiceID, req.ClientCN); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
			return
		}

		as.audit.LogAccessChange("admin", req.ServiceID, req.ClientCN, "revoke_access")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "revoked"})
	})(w, r)
}

func (as *AdminServer) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	sessions := as.sessions.GetAll()
	json.NewEncoder(w).Encode(sessions)
}

func (as *AdminServer) handleAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	logs := as.audit.GetLogs(1000)
	json.NewEncoder(w).Encode(logs)
}

func (as *AdminServer) handleTOTPGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			AccountName string `json:"account_name"`
			Issuer      string `json:"issuer"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		if req.Issuer == "" {
			req.Issuer = "ZTunnel"
		}

		secret := totp.GenerateSecret()
		uri := totp.ProvisioningURI(req.AccountName, req.Issuer, secret)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"secret": secret,
			"uri":    uri,
		})
	})(w, r)
}

func (as *AdminServer) handleLocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		locks := as.tokens.GetLocks()
		json.NewEncoder(w).Encode(locks)
	})(w, r)
}

func (as *AdminServer) handleLockByCN(w http.ResponseWriter, r *http.Request) {
	cn := r.URL.Path[len("/api/locks/"):]
	if cn == "" {
		http.Error(w, `{"error":"client CN required"}`, http.StatusBadRequest)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		lock, ok := as.tokens.GetLock(cn)
		if !ok {
			http.Error(w, `{"error":"no lock record found"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(lock)
	})(w, r)
}

func (as *AdminServer) handleUnlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClientCN string `json:"client_cn"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		as.tokens.Unlock(req.ClientCN)
		as.audit.LogAccessChange("admin", "", req.ClientCN, "unlock_account")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":    "unlocked",
			"client_cn": req.ClientCN,
		})
	})(w, r)
}

func (as *AdminServer) handleGeoHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		history := as.tokens.GetAllRiskHistory()
		json.NewEncoder(w).Encode(history)
	})(w, r)
}

func (as *AdminServer) handleGeoHistoryByCN(w http.ResponseWriter, r *http.Request) {
	cn := r.URL.Path[len("/api/geo/history/"):]
	if cn == "" {
		http.Error(w, `{"error":"client CN required"}`, http.StatusBadRequest)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		assessment, history, ok := as.tokens.GetRiskHistory(cn)
		if !ok {
			http.Error(w, `{"error":"no geo history for this client"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"assessment": assessment,
			"history":    history,
		})
	})(w, r)
}

func (as *AdminServer) handleGeoClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	as.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClientCN string `json:"client_cn"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		as.tokens.ClearGeoHistory(req.ClientCN)
		as.audit.LogAccessChange("admin", "", req.ClientCN, "clear_geo_history")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":    "cleared",
			"client_cn": req.ClientCN,
		})
	})(w, r)
}
