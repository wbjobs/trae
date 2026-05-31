package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"data-cleanse-service/internal/models"
)

type CallbackPayload struct {
	TaskID         string            `json:"task_id"`
	RequestID      string            `json:"request_id"`
	Status         models.TaskStatus `json:"status"`
	TotalRecords   int               `json:"total_records"`
	SuccessCount   int               `json:"success_count"`
	FailedCount    int               `json:"failed_count"`
	CompletedAt    time.Time         `json:"completed_at"`
	ErrorMsg       string            `json:"error_msg,omitempty"`
}

type CallbackService struct {
	client *http.Client
}

func NewCallbackService() *CallbackService {
	return &CallbackService{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *CallbackService) Notify(ctx context.Context, callbackURL string, payload *CallbackPayload) error {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal callback payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, callbackURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create callback request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("callback request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("callback returned non-success status: %d", resp.StatusCode)
	}

	return nil
}

func (s *CallbackService) NotifyWithRetry(ctx context.Context, callbackURL string, payload *CallbackPayload, maxRetries int) error {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		err := s.Notify(ctx, callbackURL, payload)
		if err == nil {
			return nil
		}
		lastErr = err
		if i < maxRetries-1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(1<<i) * time.Second):
			}
		}
	}
	return fmt.Errorf("callback failed after %d retries: %w", maxRetries, lastErr)
}
