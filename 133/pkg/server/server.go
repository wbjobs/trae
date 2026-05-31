package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/edge/wruntime/pkg/config"
	"github.com/edge/wruntime/pkg/orchestrator"
	natsclient "github.com/edge/wruntime/pkg/natsclient"
	"github.com/edge/wruntime/pkg/storage"
	"github.com/edge/wruntime/pkg/types"
	"github.com/edge/wruntime/pkg/wasm"
)

type Server struct {
	cfg          *config.Config
	storage      *storage.Storage
	nats         *natsclient.Client
	wasm         *wasm.Runtime
	orchestrator *orchestrator.Orchestrator
	http         *http.Server
}

func New(cfg *config.Config) (*Server, error) {
	store, err := storage.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create storage: %w", err)
	}

	nc, err := natsclient.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create nats client: %w", err)
	}

	wr, err := wasm.NewRuntime(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create wasm runtime: %w", err)
	}

	orch := orchestrator.New(store, wr)

	return &Server{
		cfg:          cfg,
		storage:      store,
		nats:         nc,
		wasm:         wr,
		orchestrator: orch,
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/invoke/", s.handleInvoke)
	mux.HandleFunc("/deploy", s.handleDeploy)
	mux.HandleFunc("/functions/", s.handleFunctions)
	mux.HandleFunc("/health", s.handleHealth)

	mux.HandleFunc("/chain", s.handleChain)
	mux.HandleFunc("/pipeline", s.handlePipeline)
	mux.HandleFunc("/pipeline/", s.handlePipelineByName)

	s.http = &http.Server{
		Addr:         ":" + s.cfg.HTTPPort,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	_, err := s.nats.SubscribeInvoke(s.invokeFunctionHandler)
	if err != nil {
		return fmt.Errorf("failed to subscribe to NATS: %w", err)
	}

	fmt.Printf("Server starting on port %s\n", s.cfg.HTTPPort)
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.http != nil {
		s.http.Shutdown(ctx)
	}
	s.nats.Close()
	return s.wasm.Close(ctx)
}

func (s *Server) handleInvoke(w http.ResponseWriter, r *http.Request) {
	functionName := r.URL.Path[len("/invoke/"):]
	if functionName == "" {
		http.Error(w, "function name is required", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	headers := make(map[string]string)
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	query := make(map[string]string)
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			query[k] = v[0]
		}
	}

	version := r.URL.Query().Get("version")

	req := &types.FunctionRequest{
		FunctionName: functionName,
		Version:      version,
		Body:         body,
		Headers:      headers,
		Method:       r.Method,
		Path:         r.URL.Path,
		Query:        query,
	}

	resp, err := s.invokeFunctionHandler(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for k, v := range resp.Headers {
		w.Header().Set(k, v)
	}
	w.Header().Set("X-Function-Duration", fmt.Sprintf("%dms", resp.DurationMs))
	w.WriteHeader(resp.StatusCode)
	w.Write(resp.Body)
}

func (s *Server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req types.DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resp, err := s.storage.DeployFunction(r.Context(), &req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleFunctions(w http.ResponseWriter, r *http.Request) {
	functionName := r.URL.Path[len("/functions/"):]
	if functionName == "" {
		http.Error(w, "function name is required", http.StatusBadRequest)
		return
	}

	versions, err := s.storage.ListVersions(r.Context(), functionName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(versions)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (s *Server) handleChain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req types.ChainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if len(req.Functions) == 0 {
		http.Error(w, "functions list is required", http.StatusBadRequest)
		return
	}

	resp, err := s.orchestrator.ExecuteChain(r.Context(), &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handlePipeline(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.handlePipelineCreateOrExecute(w, r)
	case http.MethodGet:
		s.handlePipelineList(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handlePipelineCreateOrExecute(w http.ResponseWriter, r *http.Request) {
	var req types.PipelineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if req.Pipeline != nil && req.Pipeline.Name != "" {
		s.orchestrator.RegisterPipeline(req.Pipeline)
	}

	resp, err := s.orchestrator.ExecutePipeline(r.Context(), &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handlePipelineList(w http.ResponseWriter, r *http.Request) {
	pipelines := s.orchestrator.ListPipelines()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(pipelines)
}

func (s *Server) handlePipelineByName(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Path[len("/pipeline/"):]
	if name == "" {
		http.Error(w, "pipeline name is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		pipeline, ok := s.orchestrator.GetPipeline(name)
		if !ok {
			http.Error(w, "pipeline not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(pipeline)

	case http.MethodDelete:
		if !s.orchestrator.DeletePipeline(name) {
			http.Error(w, "pipeline not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	case http.MethodPost:
		var req types.PipelineRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
			return
		}
		req.PipelineName = name

		resp, err := s.orchestrator.ExecutePipeline(r.Context(), &req)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(resp)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) invokeFunctionHandler(ctx context.Context, req *types.FunctionRequest) (*types.FunctionResponse, error) {
	wasmBytes, _, err := s.storage.GetFunction(ctx, req.FunctionName, req.Version)
	if err != nil {
		return nil, fmt.Errorf("failed to get function: %w", err)
	}

	resp, err := s.wasm.Invoke(ctx, wasmBytes, req)
	if err != nil {
		return nil, err
	}

	return resp, nil
}
