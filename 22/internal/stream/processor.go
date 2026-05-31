package stream

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"rtsp-hls-server/internal/config"
	"strconv"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type SegmentEvent struct {
	FilePath    string
	Timestamp   time.Time
	SequenceNum int
}

type Processor struct {
	config          *config.Config
	events          chan SegmentEvent
	watcher         *fsnotify.Watcher
	ctx             context.Context
	cancel          context.CancelFunc
	mu              sync.Mutex
	isRunning       bool
	currentCmd      *exec.Cmd
	currentCmdCancel context.CancelFunc
	lastTimestamp   int64
	seqCounter      int
}

func NewProcessor(cfg *config.Config) (*Processor, error) {
	if err := os.MkdirAll(cfg.SegmentDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create segment dir: %w", err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	if err := watcher.Add(cfg.SegmentDir); err != nil {
		return nil, fmt.Errorf("failed to watch segment dir: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Processor{
		config:        cfg,
		events:        make(chan SegmentEvent, 1000),
		watcher:       watcher,
		ctx:           ctx,
		cancel:        cancel,
		isRunning:     false,
		lastTimestamp: 0,
		seqCounter:    0,
	}, nil
}

func (p *Processor) Events() <-chan SegmentEvent {
	return p.events
}

func (p *Processor) Start() error {
	p.mu.Lock()
	if p.isRunning {
		p.mu.Unlock()
		return nil
	}
	p.isRunning = true
	p.mu.Unlock()

	go p.watchSegments()
	go p.runFFmpegLoop()

	return nil
}

func (p *Processor) SetInitialSequence(seq int) {
	p.mu.Lock()
	p.seqCounter = seq
	p.mu.Unlock()
}

func (p *Processor) SetLastTimestamp(ts int64) {
	p.mu.Lock()
	p.lastTimestamp = ts
	p.mu.Unlock()
}

func (p *Processor) runFFmpegLoop() {
	backoff := 1 * time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		log.Printf("Starting FFmpeg process...")

		err := p.runFFmpegOnce()

		select {
		case <-p.ctx.Done():
			log.Println("Context cancelled, stopping FFmpeg loop")
			return
		default:
		}

		if err != nil {
			log.Printf("FFmpeg error: %v, retrying in %v...", err, backoff)
		} else {
			log.Printf("FFmpeg exited normally, restarting in %v...", backoff)
		}

		select {
		case <-p.ctx.Done():
			return
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (p *Processor) runFFmpegOnce() error {
	segmentPattern := filepath.Join(p.config.SegmentDir, "segment_"+strconv.FormatInt(time.Now().Unix(), 10)+"_%d.ts")

	args := []string{
		"-reconnect", "1",
		"-reconnect_streamed", "1",
		"-reconnect_delay_max", "30",
		"-i", p.config.RTSPURL,
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%.0f", p.config.SegmentDuration.Seconds()),
		"-hls_list_size", "0",
		"-hls_flags", "append_list",
		"-hls_segment_filename", segmentPattern,
		filepath.Join(p.config.SegmentDir, "stream.m3u8"),
	}

	cmdCtx, cmdCancel := context.WithCancel(p.ctx)

	p.mu.Lock()
	p.currentCmdCancel = cmdCancel
	p.currentCmd = exec.CommandContext(cmdCtx, p.config.FFmpegPath, args...)
	p.currentCmd.Stdout = os.Stdout
	p.currentCmd.Stderr = os.Stderr
	p.mu.Unlock()

	err := p.currentCmd.Run()

	cmdCancel()

	p.mu.Lock()
	p.currentCmd = nil
	p.currentCmdCancel = nil
	p.mu.Unlock()

	return err
}

func (p *Processor) watchSegments() {
	for {
		select {
		case <-p.ctx.Done():
			return
		case event, ok := <-p.watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Create == fsnotify.Create {
				if filepath.Ext(event.Name) == ".ts" {
					time.Sleep(500 * time.Millisecond)
					p.processNewSegment(event.Name)
				}
			}
		case err, ok := <-p.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Watcher error: %v", err)
		}
	}
}

func (p *Processor) processNewSegment(filePath string) {
	now := time.Now()
	currentTimestamp := now.UnixNano()

	p.mu.Lock()
	defer p.mu.Unlock()

	if currentTimestamp < p.lastTimestamp {
		log.Printf("Warning: timestamp going backwards, adjusting. Last: %d, Current: %d",
			p.lastTimestamp, currentTimestamp)
		currentTimestamp = p.lastTimestamp + int64(p.config.SegmentDuration)
		now = time.Unix(0, currentTimestamp)
	}

	p.lastTimestamp = currentTimestamp

	event := SegmentEvent{
		FilePath:    filePath,
		Timestamp:   now,
		SequenceNum: p.seqCounter,
	}

	select {
	case p.events <- event:
	default:
		log.Printf("Warning: events channel full, dropping segment event: %s", filePath)
	}

	p.seqCounter++
}

func (p *Processor) Stop() {
	p.mu.Lock()
	if !p.isRunning {
		p.mu.Unlock()
		return
	}
	p.isRunning = false

	if p.currentCmdCancel != nil {
		p.currentCmdCancel()
	}
	p.mu.Unlock()

	p.cancel()
	p.watcher.Close()
}
