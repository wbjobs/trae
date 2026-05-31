package mirror

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"time"

	"http-mirror/internal/replay"
	"http-mirror/internal/stats"
)

type Sender struct {
	serverURL   string
	client      *http.Client
	replayStore *replay.Store
	stats       *stats.Stats
	enableReplay bool
}

func New(serverURL string, timeout time.Duration, store *replay.Store, s *stats.Stats, enableReplay bool) *Sender {
	return &Sender{
		serverURL:    serverURL,
		replayStore:  store,
		stats:        s,
		enableReplay: enableReplay,
		client: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
	}
}

type Result struct {
	Success   bool
	Duration  time.Duration
	Err       error
	Status    int
	ReplayID  string
}

func (s *Sender) Mirror(method, path string, headers http.Header, body []byte) *Result {
	start := time.Now()

	mirrorURL := fmt.Sprintf("%s%s", s.serverURL, path)

	var req *http.Request
	var err error

	if len(body) > 0 {
		req, err = http.NewRequest(method, mirrorURL, bytes.NewReader(body))
	} else {
		req, err = http.NewRequest(method, mirrorURL, nil)
	}

	if err != nil {
		return &Result{
			Success:  false,
			Duration: time.Since(start),
			Err:      fmt.Errorf("creating request: %w", err),
		}
	}

	for key, values := range headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	req.Header.Set("X-Mirrored-From", "http-mirror")

	var replayID string
	if s.enableReplay && s.replayStore != nil {
		bodyHash := ""
		if len(body) > 0 {
			hash := sha256.Sum256(body)
			bodyHash = hex.EncodeToString(hash[:])
		}

		headersMap := make(map[string]string)
		for key, values := range headers {
			if len(values) > 0 {
				headersMap[key] = values[0]
			}
		}

		replayID, err = s.replayStore.StoreRequest(method, path, headersMap, bodyHash)
		if err == nil {
			req.Header.Set("X-Replay-Id", replayID)
			s.stats.IncrReplaySent()
		}
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return &Result{
			Success:  false,
			Duration: time.Since(start),
			Err:      fmt.Errorf("sending request: %w", err),
			ReplayID: replayID,
		}
	}
	defer resp.Body.Close()

	io.Copy(io.Discard, resp.Body)

	success := resp.StatusCode >= 200 && resp.StatusCode < 500

	return &Result{
		Success:  success,
		Duration: time.Since(start),
		Status:   resp.StatusCode,
		ReplayID: replayID,
	}
}

func (s *Sender) ServerURL() string {
	return s.serverURL
}

func (s *Sender) EnableReplay() bool {
	return s.enableReplay
}
