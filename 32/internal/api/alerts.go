package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"ssh-bastion-audit/internal/alerting"
	"ssh-bastion-audit/internal/database"
)

func (s *APIServer) ListAlerts(c *gin.Context) {
	var params PaginationParams
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	severity := c.Query("severity")

	if params.Limit > 100 {
		params.Limit = 100
	}

	alerts, total, err := s.alertRepo.List(c.Request.Context(), params.Limit, params.Offset, severity)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: total,
		Items: alerts,
	})
}

func (s *APIServer) GetAlert(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	alerts, err := s.alertRepo.GetBySessionID(c.Request.Context(), id)
	if err != nil || len(alerts) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
		return
	}

	c.JSON(http.StatusOK, alerts[0])
}

type ResolveAlertRequest struct {
	ResolvedBy string `json:"resolved_by" binding:"required"`
	Notes      string `json:"notes"`
}

func (s *APIServer) ResolveAlert(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	var req ResolveAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.alertRepo.Resolve(c.Request.Context(), id, req.ResolvedBy, req.Notes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}

func (s *APIServer) ListRules(c *gin.Context) {
	var params PaginationParams
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if params.Limit > 100 {
		params.Limit = 100
	}

	rules, total, err := s.ruleRepo.List(c.Request.Context(), params.Limit, params.Offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{
		Total: total,
		Items: rules,
	})
}

type CreateRuleRequest struct {
	Name        string `json:"name" binding:"required,max=128"`
	Pattern     string `json:"pattern" binding:"required,max=512"`
	Severity    string `json:"severity" binding:"required,oneof=low medium high critical"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description"`
}

func (s *APIServer) CreateRule(c *gin.Context) {
	var req CreateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule := &database.AlertRule{
		Name:        req.Name,
		Pattern:     req.Pattern,
		Severity:    req.Severity,
		Enabled:     req.Enabled,
		Description: req.Description,
	}

	if err := s.ruleRepo.Create(c.Request.Context(), rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if s.alerter != nil {
		s.alerter.RefreshRules()
	}

	c.JSON(http.StatusCreated, rule)
}

type UpdateRuleRequest struct {
	Name        string `json:"name" binding:"omitempty,max=128"`
	Pattern     string `json:"pattern" binding:"omitempty,max=512"`
	Severity    string `json:"severity" binding:"omitempty,oneof=low medium high critical"`
	Enabled     *bool  `json:"enabled"`
	Description string `json:"description"`
}

func (s *APIServer) UpdateRule(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	existingRules, _, err := s.ruleRepo.List(c.Request.Context(), 1, 0)
	if err != nil || len(existingRules) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	var req UpdateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule := existingRules[0]
	if req.Name != "" {
		rule.Name = req.Name
	}
	if req.Pattern != "" {
		rule.Pattern = req.Pattern
	}
	if req.Severity != "" {
		rule.Severity = req.Severity
	}
	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}
	if req.Description != "" {
		rule.Description = req.Description
	}

	if err := s.ruleRepo.Update(c.Request.Context(), rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if s.alerter != nil {
		s.alerter.RefreshRules()
	}

	c.JSON(http.StatusOK, rule)
}

func (s *APIServer) DeleteRule(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	if err := s.ruleRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if s.alerter != nil {
		s.alerter.RefreshRules()
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
