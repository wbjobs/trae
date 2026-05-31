package recorder

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Recorder struct {
	mu       sync.Mutex
	file     *os.File
	filePath string
	startTime time.Time
}

func New(recordDir string, serverName string) (*Recorder, error) {
	if recordDir == "" {
		recordDir = "./recordings"
	}

	if err := os.MkdirAll(recordDir, 0755); err != nil {
		return nil, fmt.Errorf("create record dir: %w", err)
	}

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("%s_%s.ttyrec", serverName, timestamp)
	fullPath := filepath.Join(recordDir, fileName)

	file, err := os.Create(fullPath)
	if err != nil {
		return nil, fmt.Errorf("create record file: %w", err)
	}

	return &Recorder{
		file:      file,
		filePath:  fullPath,
		startTime: time.Now(),
	}, nil
}

func (r *Recorder) Write(data []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.file == nil {
		return
	}

	now := time.Now()
	elapsed := now.Sub(r.startTime)
	sec := int32(elapsed.Seconds())
	usec := int32(elapsed.Microseconds() % 1_000_000)

	header := make([]byte, 12)
	binary.LittleEndian.PutUint32(header[0:4], uint32(sec))
	binary.LittleEndian.PutUint32(header[4:8], uint32(usec))
	binary.LittleEndian.PutUint32(header[8:12], uint32(len(data)))

	r.file.Write(header)
	r.file.Write(data)
}

func (r *Recorder) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.file != nil {
		r.file.Sync()
		r.file.Close()
		r.file = nil
	}
}

func (r *Recorder) FilePath() string {
	return r.filePath
}
