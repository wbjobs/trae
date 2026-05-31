package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type LinkerdScraper struct {
	prometheusURL string
	kubeconfig    string
	client        *http.Client
	ipToSvc       map[string]string
}

func New(prometheusURL string) *LinkerdScraper {
	return &LinkerdScraper{
		prometheusURL: prometheusURL,
		client:        &http.Client{Timeout: 10 * time.Second},
		ipToSvc:       make(map[string]string),
	}
}

func (l *LinkerdScraper) GetServiceName(ip string) string {
	return l.ipToSvc[ip]
}

func (l *LinkerdScraper) SetMapping(ip, svc string) {
	l.ipToSvc[ip] = svc
}

func (l *LinkerdScraper) ScrapeLinkerdMetrics(ctx context.Context) error {
	if l.prometheusURL == "" {
		return nil
	}

	url := fmt.Sprintf("%s/api/v1/query?query=linkerd_tcp_open_total", l.prometheusURL)
	resp, err := l.client.Get(url)
	if err != nil {
		return fmt.Errorf("query linkerd metrics: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	var result struct {
		Data struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Values [][]interface{}   `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("parse prometheus: %w", err)
	}

	for _, r := range result.Data.Result {
		if ip, ok := r.Metric["instance"]; ok {
			if svc, ok := r.Metric["exported_service"]; ok {
				l.ipToSvc[ip] = svc
			}
		}
	}

	return nil
}

func (l *LinkerdScraper) Run(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	l.ScrapeLinkerdMetrics(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			l.ScrapeLinkerdMetrics(ctx)
		}
	}
}
