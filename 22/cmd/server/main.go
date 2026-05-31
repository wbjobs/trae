package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"rtsp-hls-server/internal/api"
	"rtsp-hls-server/internal/cache"
	"rtsp-hls-server/internal/config"
	"rtsp-hls-server/internal/index"
	"rtsp-hls-server/internal/monitor"
	"rtsp-hls-server/internal/stream"

	"github.com/gorilla/mux"
)

func main() {
	cfg := config.Default()

	if rtspURL := os.Getenv("RTSP_URL"); rtspURL != "" {
		cfg.RTSPURL = rtspURL
	}
	if segmentDir := os.Getenv("SEGMENT_DIR"); segmentDir != "" {
		cfg.SegmentDir = segmentDir
	}
	if httpPort := os.Getenv("HTTP_PORT"); httpPort != "" {
		cfg.HTTPPort = httpPort
	}
	if ffmpegPath := os.Getenv("FFMPEG_PATH"); ffmpegPath != "" {
		cfg.FFmpegPath = ffmpegPath
	}

	log.Printf("Starting RTSP HLS server with config:")
	log.Printf("  RTSP URL: %s", cfg.RTSPURL)
	log.Printf("  Segment Dir: %s", cfg.SegmentDir)
	log.Printf("  HTTP Port: %s", cfg.HTTPPort)

	memCache := cache.NewMemoryCache(cfg.CacheDuration)
	binIndex := index.NewBinaryIndex(cfg.SegmentDir)

	var entries []index.IndexEntry
	var err error
	if entries, err = binIndex.ReadAll(); err != nil {
		log.Printf("Warning: failed to load existing index: %v", err)
	} else {
		memCache.Warmup(entries)
		log.Printf("Loaded %d existing index entries into cache", len(entries))
	}

	processor, err := stream.NewProcessor(cfg)
	if err != nil {
		log.Fatalf("Failed to create stream processor: %v", err)
	}

	alertMgr := monitor.NewAlertManager(cfg)

	var nextSeq int
	var lastTs int64

	if len(entries) > 0 {
		lastEntry := entries[len(entries)-1]
		nextSeq = int(lastEntry.SequenceNum) + 1
		lastTs = lastEntry.Timestamp
		processor.SetInitialSequence(nextSeq)
		processor.SetLastTimestamp(lastTs)
		alertMgr.SetInitialSequence(nextSeq)
		log.Printf("Restored sequence from index: seq=%d, last_ts=%d", nextSeq, lastTs)
	}

	var seqMu sync.Mutex

	alertMgr.SetSegmentCallback(func(timestamp time.Time, seq int, path string, isCorrupt bool) {
		seqMu.Lock()
		if seq >= nextSeq {
			nextSeq = seq + 1
		}
		seqMu.Unlock()

		var entry index.IndexEntry
		if isCorrupt {
			entry = index.NewCorruptIndexEntry(timestamp, seq, path)
		} else {
			entry = index.NewIndexEntry(timestamp, seq, index.SegmentStatusNormal, path)
		}

		if err := binIndex.Append(entry); err != nil {
			log.Printf("Failed to append index: %v", err)
		}

		memCache.Add(entry)

		status := "normal"
		if isCorrupt {
			status = "corrupt"
		}
		log.Printf("Indexed [%s] segment %d: %s", status, seq, path)
	})

	go func() {
		for event := range processor.Events() {
			seqMu.Lock()
			if event.SequenceNum >= nextSeq {
				nextSeq = event.SequenceNum + 1
			}
			seqMu.Unlock()

			entry := index.NewIndexEntry(event.Timestamp, event.SequenceNum, index.SegmentStatusNormal, event.FilePath)

			if err := binIndex.Append(entry); err != nil {
				log.Printf("Failed to append to index: %v", err)
			}

			memCache.Add(entry)
			alertMgr.NotifySegmentReceived(event.Timestamp)

			log.Printf("Indexed [normal] segment %d: %s", event.SequenceNum, event.FilePath)
		}
	}()

	if len(entries) > 0 {
		alertMgr.NotifySegmentReceived(time.Unix(0, lastTs))
	} else {
		alertMgr.NotifySegmentReceived(time.Now())
	}

	if err := processor.Start(); err != nil {
		log.Fatalf("Failed to start stream processor: %v", err)
	}
	log.Println("Stream processor started")

	alertMgr.Start()
	log.Println("Alert monitor started")

	handlers := api.NewHandlers(memCache, binIndex, alertMgr)

	router := mux.NewRouter()
	router.HandleFunc("/segment", handlers.GetSegment).Methods("GET")
	router.HandleFunc("/health", handlers.HealthCheck).Methods("GET")
	router.HandleFunc("/alerts", handlers.GetAlerts).Methods("GET")
	router.HandleFunc("/corrupt", handlers.GetCorruptSegments).Methods("GET")

	server := &http.Server{
		Addr:    cfg.HTTPPort,
		Handler: router,
	}

	go func() {
		log.Printf("HTTP server listening on %s", cfg.HTTPPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	<-stop
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	alertMgr.Stop()
	processor.Stop()

	log.Println("Server stopped gracefully")
	fmt.Println()
}
