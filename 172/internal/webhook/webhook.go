package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"config-sync/internal/store"
)

type WebhookPayload struct {
	Event     string           `json:"event"`
	Key       string           `json:"key"`
	Entry     *store.ConfigEntry `json:"entry,omitempty"`
	Timestamp time.Time        `json:"timestamp"`
	Service   string           `json:"service"`
}

type WebhookNotifier struct {
	url           string
	timeout       time.Duration
	retryCount    int
	retryInterval time.Duration
	serviceName   string
	client        *http.Client
}

func NewWebhookNotifier(url string, timeout time.Duration, retryCount int, retryInterval time.Duration, serviceName string) *WebhookNotifier {
	return &WebhookNotifier{
		url:           url,
		timeout:       timeout,
		retryCount:    retryCount,
		retryInterval: retryInterval,
		serviceName:   serviceName,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (w *WebhookNotifier) Notify(ctx context.Context, event string, key string, entry *store.ConfigEntry) error {
	if w.url == "" {
		return nil
	}

	payload := WebhookPayload{
		Event:     event,
		Key:       key,
		Entry:     entry,
		Timestamp: time.Now().UTC(),
		Service:   w.serviceName,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal webhook payload: %w", err)
	}

	var lastErr error
	for i := 0; i <= w.retryCount; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(w.retryInterval):
			}
		}

		err := w.send(ctx, body)
		if err == nil {
			return nil
		}
		lastErr = err
	}

	return fmt.Errorf("webhook notify failed after %d retries: %w", w.retryCount, lastErr)
}

func (w *WebhookNotifier) send(ctx context.Context, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Config-Sync-Event", "config-change")

	resp, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}
