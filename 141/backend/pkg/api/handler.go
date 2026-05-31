package api

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/dapr-wasm-state/pkg/service"
	"github.com/dapr-wasm-state/pkg/wasm"
)

type Handler struct {
	stateService *service.StateService
	pluginManager *wasm.PluginManager
}

func NewHandler(stateService *service.StateService, pluginManager *wasm.PluginManager) *Handler {
	return &Handler{
		stateService:  stateService,
		pluginManager: pluginManager,
	}
}

type GetRequest struct {
	Key string `json:"key"`
}

type GetResponse struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Found bool   `json:"found"`
}

type SetRequest struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type SetResponse struct {
	Success bool `json:"success"`
}

type DeleteRequest struct {
	Key string `json:"key"`
}

type DeleteResponse struct {
	Success bool `json:"success"`
}

type BulkGetRequest struct {
	Keys []string `json:"keys"`
}

type BulkGetResponse struct {
	Items map[string]string `json:"items"`
}

type BulkSetRequest struct {
	Items map[string]string `json:"items"`
}

type BulkSetResponse struct {
	Success bool `json:"success"`
}

type BulkDeleteRequest struct {
	Keys []string `json:"keys"`
}

type BulkDeleteResponse struct {
	Success bool `json:"success"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	var req GetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	value, err := h.stateService.Get(r.Context(), req.Key)
	if err != nil {
		if err.Error() == "key not found" {
			writeJSON(w, http.StatusOK, APIResponse{
				Success: true,
				Data: GetResponse{
					Key:   req.Key,
					Found: false,
				},
			})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: GetResponse{
			Key:   req.Key,
			Value: string(value),
			Found: true,
		},
	})
}

func (h *Handler) HandleSet(w http.ResponseWriter, r *http.Request) {
	var req SetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	err := h.stateService.Set(r.Context(), req.Key, []byte(req.Value))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    SetResponse{Success: true},
	})
}

func (h *Handler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	var req DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	err := h.stateService.Delete(r.Context(), req.Key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    DeleteResponse{Success: true},
	})
}

func (h *Handler) HandleBulkGet(w http.ResponseWriter, r *http.Request) {
	var req BulkGetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Keys) == 0 {
		writeError(w, http.StatusBadRequest, "keys are required")
		return
	}

	items, err := h.stateService.BulkGet(r.Context(), req.Keys)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	result := make(map[string]string)
	for k, v := range items {
		result[k] = string(v)
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    BulkGetResponse{Items: result},
	})
}

func (h *Handler) HandleBulkSet(w http.ResponseWriter, r *http.Request) {
	var req BulkSetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "items are required")
		return
	}

	items := make(map[string][]byte)
	for k, v := range req.Items {
		items[k] = []byte(v)
	}

	err := h.stateService.BulkSet(r.Context(), items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    BulkSetResponse{Success: true},
	})
}

func (h *Handler) HandleBulkDelete(w http.ResponseWriter, r *http.Request) {
	var req BulkDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Keys) == 0 {
		writeError(w, http.StatusBadRequest, "keys are required")
		return
	}

	err := h.stateService.BulkDelete(r.Context(), req.Keys)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    BulkDeleteResponse{Success: true},
	})
}

func (h *Handler) HandleMetrics(w http.ResponseWriter, r *http.Request) {
	snapshot := h.stateService.GetMetrics()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    snapshot,
	})
}

func (h *Handler) HandleMetricsReset(w http.ResponseWriter, r *http.Request) {
	h.stateService.ResetMetrics()
	writeJSON(w, http.StatusOK, APIResponse{Success: true})
}

func (h *Handler) HandlePluginsList(w http.ResponseWriter, r *http.Request) {
	plugins := h.stateService.ListPlugins()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    plugins,
	})
}

func (h *Handler) HandlePluginActivate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PluginID string `json:"plugin_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.stateService.ActivatePlugin(req.PluginID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Success: true})
}

func (h *Handler) HandlePluginDeactivate(w http.ResponseWriter, r *http.Request) {
	h.stateService.DeactivatePlugin()
	writeJSON(w, http.StatusOK, APIResponse{Success: true})
}

func (h *Handler) HandlePluginUpload(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(32 << 20)

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	wasmData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	config := wasm.PluginConfig{
		Name:        r.FormValue("name"),
		Description: r.FormValue("description"),
		Version:     r.FormValue("version"),
		Enabled:     true,
	}

	plugin, err := h.pluginManager.LoadPlugin(r.Context(), wasmData, config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    plugin.Config,
	})
}

func (h *Handler) HandlePluginDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PluginID string `json:"plugin_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.pluginManager.UnloadPlugin(r.Context(), req.PluginID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Success: true})
}

func (h *Handler) HandleActivePlugin(w http.ResponseWriter, r *http.Request) {
	pluginID := h.stateService.GetActivePlugin()
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    map[string]string{"plugin_id": pluginID},
	})
}

func (h *Handler) HandleGetVersion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key     string `json:"key"`
		Version int64  `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	sv, err := h.stateService.GetVersion(r.Context(), req.Key, req.Version)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    sv,
	})
}

func (h *Handler) HandleGetVersionHistory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	history, err := h.stateService.GetVersionHistory(r.Context(), req.Key)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    history,
	})
}

func (h *Handler) HandleGetAtTime(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key       string `json:"key"`
		Timestamp string `json:"timestamp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
	}

	if req.Timestamp == "" {
		writeError(w, http.StatusBadRequest, "timestamp is required")
		return
	}

	timestamp, err := time.Parse(time.RFC3339, req.Timestamp)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid timestamp format, use RFC3339")
		return
	}

	value, err := h.stateService.GetAtTime(r.Context(), req.Key, timestamp)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"key":       req.Key,
			"value":     string(value),
			"timestamp": req.Timestamp,
		},
	})
}

func (h *Handler) HandleDeleteOldVersions(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	if err := h.stateService.DeleteOldVersions(r.Context(), req.Key); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Success: true})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, errMsg string) {
	writeJSON(w, status, APIResponse{
		Success: false,
		Error:   errMsg,
	})
}
