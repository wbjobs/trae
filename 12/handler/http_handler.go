package handler

import (
	"encoding/json"
	"eventstore/model"
	"eventstore/service"
	"net/http"
	"strings"
)

type HTTPHandler struct {
	eventService *service.EventService
}

func NewHTTPHandler(eventService *service.EventService) *HTTPHandler {
	return &HTTPHandler{eventService: eventService}
}

func (h *HTTPHandler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *HTTPHandler) writeError(w http.ResponseWriter, status int, message string) {
	h.writeJSON(w, status, map[string]string{"error": message})
}

func (h *HTTPHandler) PostEvents(w http.ResponseWriter, r *http.Request) {
	var event model.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	version, err := h.eventService.AppendEvent(event)
	if err != nil {
		if _, ok := err.(*model.VersionConflictError); ok {
			h.writeError(w, http.StatusConflict, err.Error())
			return
		}
		if strings.Contains(err.Error(), "maximum version limit") {
			h.writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, map[string]interface{}{
		"entityId": event.EntityID,
		"version":  version,
		"message":  "event appended successfully",
	})
}

func (h *HTTPHandler) GetTimeline(w http.ResponseWriter, r *http.Request) {
	entityID := r.URL.Query().Get("entityId")
	if entityID == "" {
		h.writeError(w, http.StatusBadRequest, "entityId query parameter is required")
		return
	}

	events, err := h.eventService.GetTimeline(entityID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"entityId": entityID,
		"count":    len(events),
		"events":   events,
	})
}

func (h *HTTPHandler) PostCounterfactual(w http.ResponseWriter, r *http.Request) {
	var req model.CounterfactualRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	result, err := h.eventService.CounterfactualSimulation(req)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

func (h *HTTPHandler) PostGC(w http.ResponseWriter, r *http.Request) {
	var req model.GCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	result, err := h.eventService.GarbageCollect(req.Days)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

func (h *HTTPHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "eventstore",
	})
}

func (h *HTTPHandler) GetCausalCluster(w http.ResponseWriter, r *http.Request) {
	result, err := h.eventService.AnalyzeCausalClusters()
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, result)
}
