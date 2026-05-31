package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"google.golang.org/grpc"

	"grpcmock/internal/config"
	"grpcmock/internal/engine"
	"grpcmock/internal/proto"
	"grpcmock/internal/recorder"
	reflect "grpcmock/internal/reflection"
)

func main() {
	var (
		protoDir    = flag.String("proto", "./proto", "directory containing .proto files (recursed)")
		mockYAML    = flag.String("config", "./mock.yaml", "YAML file with mock response templates")
		grpcAddr    = flag.String("grpc-addr", ":50051", "gRPC listen address")
		httpAddr    = flag.String("http-addr", ":8080", "HTTP gateway listen address")
		noReflect   = flag.Bool("no-reflect", false, "disable gRPC server reflection")
		record      = flag.Bool("record", false, "enable recording mode (proxy to real backend)")
		backend     = flag.String("backend", "", "real backend gRPC address (required when --record)")
		recordOut   = flag.String("record-output", "", "output YAML path for recorded data (default: same as -config)")
		flushEvery  = flag.Duration("flush-interval", 5*time.Second, "flush interval for recorded data")
	)
	flag.Parse()

	if *record && strings.TrimSpace(*backend) == "" {
		log.Fatal("--record requires --backend <host:port>")
	}

	if err := run(*protoDir, *mockYAML, *grpcAddr, *httpAddr, !*noReflect,
		*record, *backend, *recordOut, *flushEvery); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run(protoDir, mockYAML, grpcAddr, httpAddr string, withReflect, doRecord bool,
	backendAddr, recordOut string, flushInterval time.Duration) error {

	reg, err := proto.NewRegistry(protoDir)
	if err != nil {
		return err
	}
	log.Printf("[mock] loaded %d services from %s", len(reg.Services()), protoDir)
	for _, s := range reg.Services() {
		log.Printf("[mock]   - %s", s)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// --- mock engine + config (always needed for HTTP gateway) ---
	store, err := config.NewStore(mockYAML)
	if err != nil {
		return err
	}
	log.Printf("[mock] loaded config from %s", mockYAML)

	go func() {
		if err := config.Watch(ctx, store); err != nil {
			log.Printf("[mock] watch stopped: %v", err)
		}
	}()

	mock := engine.New(reg, store)

	// --- recorder (optional) ---
	var rec *recorder.Recorder
	var proxy *recorder.Proxy
	var outPath string

	if doRecord {
		outPath = recordOut
		if strings.TrimSpace(outPath) == "" {
			outPath = mockYAML
		}
		rec, err = recorder.New(outPath)
		if err != nil {
			return fmt.Errorf("init recorder: %w", err)
		}
		log.Printf("[mock] recording mode: proxying to %s, output -> %s", backendAddr, outPath)

		proxy, err = recorder.NewProxy(reg, rec, backendAddr)
		if err != nil {
			return fmt.Errorf("init proxy: %w", err)
		}

		// Periodic flush of recorded data.
		go func() {
			t := time.NewTicker(flushInterval)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					if err := rec.Flush(); err != nil {
						log.Printf("[mock] record flush error: %v", err)
					}
				}
			}
		}()
	}

	// --- gRPC server ---
	grpcLis, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		return fmt.Errorf("listen grpc %s: %w", grpcAddr, err)
	}
	gs := grpc.NewServer()

	if doRecord {
		proxy.Register(gs)
	} else {
		mock.Register(gs)
	}

	if withReflect {
		if err := reflect.RegisterReflection(gs, reg); err != nil {
			return fmt.Errorf("register reflection: %w", err)
		}
	}
	go func() {
		mode := "mock"
		if doRecord {
			mode = "record"
		}
		log.Printf("[mock] gRPC listening on %s (mode=%s, reflect=%v)", grpcAddr, mode, withReflect)
		if err := gs.Serve(grpcLis); err != nil {
			log.Printf("[mock] gRPC serve: %v", err)
		}
	}()

	// --- HTTP gateway ---
	httpLis, err := net.Listen("tcp", httpAddr)
	if err != nil {
		return fmt.Errorf("listen http %s: %w", httpAddr, err)
	}
	mux := http.NewServeMux()
	mux.Handle("/mock/", mock.HTTPMux())

	// Recording control endpoints (only available in record mode).
	if doRecord && rec != nil {
		mux.HandleFunc("/mock/_record/flush", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "use POST", http.StatusMethodNotAllowed)
				return
			}
			if err := rec.Flush(); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			svc, m := rec.Stats()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":       true,
				"services": svc,
				"methods":  m,
				"output":   outPath,
			})
		})
		mux.HandleFunc("/mock/_record/status", func(w http.ResponseWriter, r *http.Request) {
			svc, m := rec.Stats()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"mode":     "record",
				"backend":  backendAddr,
				"output":   outPath,
				"services": svc,
				"methods":  m,
			})
		})
	}

	hs := &http.Server{Handler: mux}
	go func() {
		log.Printf("[mock] HTTP gateway listening on %s", httpAddr)
		if err := hs.Serve(httpLis); err != nil && err != http.ErrServerClosed {
			log.Printf("[mock] http serve: %v", err)
		}
	}()

	// --- graceful shutdown ---
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Printf("[mock] shutting down")
	cancel()

	if rec != nil {
		if err := rec.Flush(); err != nil {
			log.Printf("[mock] final record flush error: %v", err)
		} else {
			log.Printf("[mock] %s", rec.String())
		}
	}
	if proxy != nil {
		_ = proxy.Close()
	}

	gs.GracefulStop()
	_ = hs.Close()
	return nil
}
