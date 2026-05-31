package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"http-mirror/internal/config"
	"http-mirror/internal/ebpf"
	"http-mirror/internal/filter"
	"http-mirror/internal/mirror"
	"http-mirror/internal/parser"
	"http-mirror/internal/replay"
	"http-mirror/internal/stats"

	"github.com/cilium/ebpf/perf"
	"github.com/spf13/cobra"
)

func main() {
	cfg := config.DefaultConfig()

	var rootCmd = &cobra.Command{
		Use:   "http-mirror",
		Short: "HTTP traffic mirroring tool using eBPF",
		Long:  "A CLI tool that intercepts local HTTP traffic and mirrors it to a specified server with optional replay validation",
		RunE: func(cmd *cobra.Command, args []string) error {
			return run(cfg)
		},
	}

	rootCmd.Flags().StringVarP(&cfg.Interface, "interface", "i", cfg.Interface, "Network interface to attach eBPF program")
	rootCmd.Flags().StringVarP(&cfg.MirrorServer, "server", "s", cfg.MirrorServer, "Mirror server URL")
	rootCmd.Flags().StringSliceVarP(&cfg.URLPrefixes, "prefix", "p", cfg.URLPrefixes, "URL prefixes to filter (comma-separated)")
	rootCmd.Flags().IntVar(&cfg.StatsPort, "stats-port", cfg.StatsPort, "Port for stats HTTP endpoint")
	rootCmd.Flags().IntSliceVar(&cfg.Ports, "ports", cfg.Ports, "Ports to intercept (comma-separated)")
	rootCmd.Flags().BoolVar(&cfg.Daemon, "daemon", cfg.Daemon, "Run in daemon mode")
	rootCmd.Flags().IntVar(&cfg.Workers, "workers", 10, "Number of mirror workers")
	rootCmd.Flags().BoolVar(&cfg.EnableReplay, "enable-replay", cfg.EnableReplay, "Enable traffic replay validation")
	rootCmd.Flags().IntVar(&cfg.ReplayPort, "replay-port", cfg.ReplayPort, "Port for replay callback server")
	rootCmd.Flags().DurationVar(&cfg.ReplayTTL, "replay-ttl", cfg.ReplayTTL, "TTL for replay requests")

	if err := rootCmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func run(cfg *config.Config) error {
	fmt.Printf("Starting HTTP Mirror on interface: %s\n", cfg.Interface)
	fmt.Printf("Mirror server: %s\n", cfg.MirrorServer)
	fmt.Printf("URL prefixes: %s\n", strings.Join(cfg.URLPrefixes, ", "))
	fmt.Printf("Ports: %v\n", cfg.Ports)
	fmt.Printf("Workers: %d\n", cfg.Workers)
	fmt.Printf("Replay enabled: %v\n", cfg.EnableReplay)
	if cfg.EnableReplay {
		fmt.Printf("Replay port: %d\n", cfg.ReplayPort)
	}

	eBPF, err := ebpf.New(cfg.Interface)
	if err != nil {
		return fmt.Errorf("initializing eBPF: %w", err)
	}
	defer eBPF.Close()

	if err := eBPF.Attach(); err != nil {
		return fmt.Errorf("attaching eBPF program: %w", err)
	}
	fmt.Println("eBPF program attached successfully")

	reader, err := eBPF.NewReader()
	if err != nil {
		return fmt.Errorf("creating perf reader: %w", err)
	}
	defer reader.Close()

	urlFilter := filter.New(cfg.URLPrefixes)
	stats := stats.New()

	var replayStore *replay.Store
	if cfg.EnableReplay {
		replayStore = replay.NewStore(cfg, stats)
		replayStore.StartCleanupLoop(cfg.ReplayTTL, cfg.ReplayTTL/2)
		go startReplayServer(replayStore, cfg.ReplayPort)
	}

	mirrorSender := mirror.New(cfg.MirrorServer, 30*time.Second, replayStore, stats, cfg.EnableReplay)

	go startStatsServer(stats, cfg.StatsPort)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	statsTicker := time.NewTicker(5 * time.Second)
	defer statsTicker.Stop()

	workerPool := make(chan struct{}, cfg.Workers)
	var wg sync.WaitGroup

	fmt.Println("\nHTTP Mirror is running. Press Ctrl+C to stop.")
	fmt.Printf("Stats available at http://localhost:%d/stats\n", cfg.StatsPort)
	if cfg.EnableReplay {
		fmt.Printf("Replay callback at http://localhost:%d/replay\n\n", cfg.ReplayPort)
	} else {
		fmt.Println()
	}

	for {
		select {
		case <-sigChan:
			fmt.Println("\nShutting down...")
			wg.Wait()
			stats.PrintStats()
			return nil

		case <-statsTicker.C:
			if !cfg.Daemon {
				stats.PrintStats()
			}

		default:
			rec, err := reader.Read()
			if err != nil {
				if err == perf.ErrClosed {
					wg.Wait()
					return nil
				}
				log.Printf("Error reading perf event: %v", err)
				time.Sleep(10 * time.Millisecond)
				continue
			}

			if rec.LostSamples > 0 {
				log.Printf("Lost %d samples", rec.LostSamples)
			}

			event, err := parseEvent(rec.RawSample)
			if err != nil {
				log.Printf("Error parsing event: %v", err)
				continue
			}

			stats.IncrRequest()

			payload := event.Payload[:event.PayloadLen]
			req, err := parser.ParseHTTPRequest(payload)
			if err != nil {
				continue
			}

			if !urlFilter.Match(req) {
				continue
			}

			stats.IncrFiltered()
			stats.IncrMirrored()

			workerPool <- struct{}{}
			wg.Add(1)
			go func(method, path string, headers http.Header, body []byte) {
				defer func() {
					<-workerPool
					wg.Done()
				}()

				result := mirrorSender.Mirror(method, path, headers, body)
				if result.Success {
					stats.IncrSuccess()
				} else {
					stats.IncrFail()
					if result.Err != nil {
						log.Printf("Mirror failed: %s %s - %v", method, path, result.Err)
					}
				}
			}(req.Method, req.URL, req.Headers, req.Raw)
		}
	}
}

func parseEvent(raw []byte) (*ebpf.Event, error) {
	if len(raw) < 16 {
		return nil, fmt.Errorf("event too short: %d bytes", len(raw))
	}

	event := &ebpf.Event{}

	copy(event.SrcIP[:], raw[0:4])
	copy(event.DstIP[:], raw[4:8])

	event.SrcPort = uint16(raw[8]) | uint16(raw[9])<<8
	event.DstPort = uint16(raw[10]) | uint16(raw[11])<<8

	event.PayloadLen = uint16(raw[12]) | uint16(raw[13])<<8

	payloadStart := 14
	payloadEnd := payloadStart + int(event.PayloadLen)
	if payloadEnd > len(raw) {
		payloadEnd = len(raw)
	}
	if int(event.PayloadLen) > len(event.Payload) {
		event.PayloadLen = uint16(len(event.Payload))
	}
	copy(event.Payload[:event.PayloadLen], raw[payloadStart:payloadEnd])

	return event, nil
}

func startStatsServer(stats *stats.Stats, port int) {
	mux := http.NewServeMux()
	mux.HandleFunc("/stats", stats.HTTPHandler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("Stats server listening on %s\n", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Printf("Stats server error: %v", err)
	}
}

func startReplayServer(store *replay.Store, port int) {
	mux := http.NewServeMux()
	
	mux.HandleFunc("/replay", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		var serverResp map[string]interface{}
		if err := json.Unmarshal(body, &serverResp); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		replayID, ok := serverResp["replay_id"].(string)
		if !ok || replayID == "" {
			http.Error(w, "Missing replay_id", http.StatusBadRequest)
			return
		}

		original, exists := store.GetOriginalRequest(replayID)
		if !exists {
			http.Error(w, "Replay ID not found", http.StatusNotFound)
			return
		}

		result := replay.Validate(original, serverResp)
		store.RecordResult(result)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("/replay/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/replay/")
		if id == "" {
			http.Error(w, "Missing replay ID", http.StatusBadRequest)
			return
		}

		result, exists := store.GetResult(id)
		if !exists {
			http.Error(w, "Replay result not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("Replay server listening on %s\n", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Printf("Replay server error: %v", err)
	}
}
