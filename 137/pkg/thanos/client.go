package thanos

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/prometheus/common/model"
)

type Client struct {
	endpoints   []string
	httpClient   *http.Client
	maxRetries   int
	queryTimeout time.Duration
}

type QueryResult struct {
	Status string `json:"status"`
	Data   Data   `json:"data"`
	Error  string `json:"error,omitempty"`
}

type Data struct {
	ResultType string       `json:"resultType"`
	Result     []model.SampleStream `json:"result"`
}

func NewClient(endpoints []string, queryTimeout time.Duration, maxRetries int) *Client {
	return &Client{
		endpoints:   endpoints,
		httpClient: &http.Client{
			Timeout: queryTimeout,
		},
		maxRetries:   maxRetries,
		queryTimeout: queryTimeout,
	}
}

func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]model.SampleStream, error) {
	var allResults := make([][]model.SampleStream, len(c.endpoints))

	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(len(c.endpoints))

	for i, endpoint := range c.endpoints {
		i, endpoint := i, endpoint
		g.Go(func() error {
			result, err := c.queryRangeSingle(ctx, endpoint, query, start, end, step)
			if err != nil {
				return fmt.Errorf("endpoint %s failed: %w", endpoint, err)
			}
			allResults[i] = result
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	merged := c.mergeResults(allResults)
	return merged, nil
}

func (c *Client) queryRangeSingle(ctx context.Context, endpoint, query string, start, end time.Time, step time.Duration) ([]model.SampleStream, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", fmt.Sprintf("%d", start.Unix()))
	params.Set("end", fmt.Sprintf("%d", end.Unix()))
	params.Set("step", fmt.Sprintf("%d", int(step.Seconds()))

	reqURL := fmt.Sprintf("%s/api/v1/query_range?%s", strings.TrimSuffix(endpoint, "/"), params.Encode())

	var result QueryResult
	var err error

	for attempt := 0; attempt < c.maxRetries; attempt++ {
		result, err = c.doRequest(ctx, reqURL)
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt+1) * time.Second
	}

	if err != nil {
		return nil, fmt.Errorf("failed after %d retries: %w", c.maxRetries, err)
	}

	if result.Status != "success" {
		return nil, fmt.Errorf("query failed: %s", result.Error)
	}

	return result.Data.Result, nil
}

func (c *Client) doRequest(ctx context.Context, reqURL string) (QueryResult, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return QueryResult{}, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return QueryResult{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return QueryResult{}, err
	}

	if resp.StatusCode != http.StatusOK {
		return QueryResult{}, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	var result QueryResult
	if err := json.Unmarshal(body, &result); err != nil {
		return QueryResult{}, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

func (c *Client) mergeResults(allResults [][]model.SampleStream) []model.SampleStream {
	type streamKey struct {
		metric string
		labels string
	}
	mergedMap := make(map[streamKey]*model.SampleStream)

	for _, results := range allResults {
		for _, stream := range results {
			key := streamKey{
				metric: string(stream.Metric[model.MetricNameLabel]),
				labels: stream.Metric.String(),
			}

			if existing, ok := mergedMap[key]; ok {
				existing.Values = mergeSamplePairs(existing.Values, stream.Values)
			} else {
				copied := stream
				mergedMap[key] = &copied
			}
		}
	}

	merged := make([]model.SampleStream, 0, len(mergedMap))
	for _, stream := range mergedMap {
		merged = append(merged, *stream)
	}

	return merged
}

func mergeSamplePairs(a, b []model.SamplePair) []model.SamplePair {
	if len(a) == 0 {
		return b
	}
	if len(b) == 0 {
		return a
	}

	merged := make([]model.SamplePair, 0, len(a)+len(b))
	i, j := 0, 0

	for i < len(a) && j < len(b) {
		if a[i].Timestamp < b[j].Timestamp {
			merged = append(merged, a[i])
			i++
		} else if a[i].Timestamp > b[j].Timestamp {
			merged = append(merged, b[j])
			j++
		} else {
			merged = append(merged, a[i])
			i++
			j++
		}
	}

	merged = append(merged, a[i:]...)
	merged = append(merged, b[j:]...)

	return merged
}

func (c *Client) Query(ctx context.Context, query string, ts time.Time) ([]model.SampleStream, error) {
	var allResults [][]model.SampleStream
	var mu sync.Mutex

	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(len(c.endpoints))

	for _, endpoint := range c.endpoints {
		endpoint := endpoint
		g.Go(func() error {
			result, err := c.querySingle(ctx, endpoint, query, ts)
			if err != nil {
				return fmt.Errorf("endpoint %s failed: %w", endpoint, err)
			}
			mu.Lock()
			allResults = append(allResults, result)
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	merged := c.mergeResults(allResults)
	return merged, nil
}

func (c *Client) querySingle(ctx context.Context, endpoint, query string, ts time.Time) ([]model.SampleStream, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("time", fmt.Sprintf("%d", ts.Unix()))

	reqURL := fmt.Sprintf("%s/api/v1/query?%s", strings.TrimSuffix(endpoint, "/"), params.Encode())

	var result QueryResult
	var err error

	for attempt := 0; attempt < c.maxRetries; attempt++ {
		result, err = c.doRequest(ctx, reqURL)
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt+1) * time.Second
	}

	if err != nil {
		return nil, fmt.Errorf("failed after %d retries: %w", c.maxRetries, err)
	}

	if result.Status != "success" {
		return nil, fmt.Errorf("query failed: %s", result.Error)
	}

	return result.Data.Result, nil
}

func (c *Client) LabelNames(ctx context.Context, start, end time.Time) ([]string, error) {
	params := url.Values{}
	params.Set("start", fmt.Sprintf("%d", start.Unix()))
	params.Set("end", fmt.Sprintf("%d", end.Unix()))

	var allLabels [][]string
	var mu sync.Mutex

	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(len(c.endpoints))

	for _, endpoint := range c.endpoints {
		endpoint := endpoint
		g.Go(func() error {
			reqURL := fmt.Sprintf("%s/api/v1/labels?%s", strings.TrimSuffix(endpoint, "/"), params.Encode())
			var result struct {
				Status string   `json:"status"`
				Data   []string `json:"data"`
				Error  string   `json:"error,omitempty"`
			}

			body, err := c.doRequestRaw(ctx, reqURL)
			if err != nil {
				return err
			}

			if err := json.Unmarshal(body, &result); err != nil {
				return err
			}

			if result.Status != "success" {
				return fmt.Errorf("query failed: %s", result.Error)
			}

			mu.Lock()
			allLabels = append(allLabels, result.Data)
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	labelSet := make(map[string]bool)
	for _, labels := range allLabels {
		for _, label := range labels {
			labelSet[label] = true
		}
	}

	labelNames := make([]string, 0, len(labelSet))
	for label := range labelSet {
		labelNames = append(labelNames, label)
	}

	return labelNames, nil
}

func (c *Client) LabelValues(ctx context.Context, labelName string, start, end time.Time) ([]string, error) {
	params := url.Values{}
	params.Set("start", fmt.Sprintf("%d", start.Unix()))
	params.Set("end", fmt.Sprintf("%d", end.Unix()))

	var allValues [][]string
	var mu sync.Mutex

	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(len(c.endpoints))

	for _, endpoint := range c.endpoints {
		endpoint := endpoint
		g.Go(func() error {
			reqURL := fmt.Sprintf("%s/api/v1/label/%s/values?%s", strings.TrimSuffix(endpoint, "/"), labelName, params.Encode())
			var result struct {
				Status string   `json:"status"`
				Data   []string `json:"data"`
				Error  string   `json:"error,omitempty"`
			}

			body, err := c.doRequestRaw(ctx, reqURL)
			if err != nil {
				return err
			}

			if err := json.Unmarshal(body, &result); err != nil {
				return err
			}

			if result.Status != "success" {
				return fmt.Errorf("query failed: %s", result.Error)
			}

			mu.Lock()
			allValues = append(allValues, result.Data)
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	valueSet := make(map[string]bool)
	for _, values := range allValues {
		for _, value := range values {
			valueSet[value] = true
		}
	}

	labelValues := make([]string, 0, len(valueSet))
	for value := range valueSet {
		labelValues = append(labelValues, value)
	}

	return labelValues, nil
}

func (c *Client) doRequestRaw(ctx context.Context, reqURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
