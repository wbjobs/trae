package index

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	SegmentStatusNormal  int32 = 0
	SegmentStatusCorrupt int32 = 1
)

type IndexEntry struct {
	Timestamp   int64
	SequenceNum int32
	Status      int32
	FilePathLen int32
	FilePath    string
}

type BinaryIndex struct {
	dirPath string
	mu      sync.RWMutex
}

func NewBinaryIndex(dirPath string) *BinaryIndex {
	return &BinaryIndex{dirPath: dirPath}
}

func (b *BinaryIndex) getFilePath() string {
	return filepath.Join(b.dirPath, "stream.idx")
}

func (b *BinaryIndex) Append(entry IndexEntry) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	file, err := os.OpenFile(b.getFilePath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open index file: %w", err)
	}
	defer file.Close()

	if err := binary.Write(file, binary.LittleEndian, entry.Timestamp); err != nil {
		return fmt.Errorf("failed to write timestamp: %w", err)
	}
	if err := binary.Write(file, binary.LittleEndian, entry.SequenceNum); err != nil {
		return fmt.Errorf("failed to write sequence num: %w", err)
	}
	if err := binary.Write(file, binary.LittleEndian, entry.Status); err != nil {
		return fmt.Errorf("failed to write status: %w", err)
	}
	if err := binary.Write(file, binary.LittleEndian, entry.FilePathLen); err != nil {
		return fmt.Errorf("failed to write file path length: %w", err)
	}
	if _, err := file.WriteString(entry.FilePath); err != nil {
		return fmt.Errorf("failed to write file path: %w", err)
	}

	return nil
}

func (b *BinaryIndex) ReadAll() ([]IndexEntry, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	return b.readAllUnlocked()
}

func (b *BinaryIndex) readAllUnlocked() ([]IndexEntry, error) {
	file, err := os.Open(b.getFilePath())
	if os.IsNotExist(err) {
		return []IndexEntry{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to open index file: %w", err)
	}
	defer file.Close()

	var entries []IndexEntry
	for {
		var entry IndexEntry

		if err := binary.Read(file, binary.LittleEndian, &entry.Timestamp); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("failed to read timestamp: %w", err)
		}
		if err := binary.Read(file, binary.LittleEndian, &entry.SequenceNum); err != nil {
			return nil, fmt.Errorf("failed to read sequence num: %w", err)
		}
		if err := binary.Read(file, binary.LittleEndian, &entry.Status); err != nil {
			return nil, fmt.Errorf("failed to read status: %w", err)
		}
		if err := binary.Read(file, binary.LittleEndian, &entry.FilePathLen); err != nil {
			return nil, fmt.Errorf("failed to read file path length: %w", err)
		}

		filePath := make([]byte, entry.FilePathLen)
		if _, err := file.Read(filePath); err != nil {
			return nil, fmt.Errorf("failed to read file path: %w", err)
		}
		entry.FilePath = string(filePath)

		entries = append(entries, entry)
	}

	return entries, nil
}

func (b *BinaryIndex) FindByTimestamp(targetTime time.Time) (*IndexEntry, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	entries, err := b.readAllUnlocked()
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, nil
	}

	targetUnix := targetTime.UnixNano()

	left, right := 0, len(entries)
	for left < right {
		mid := (left + right) / 2
		if entries[mid].Timestamp <= targetUnix {
			left = mid + 1
		} else {
			right = mid
		}
	}

	if left > 0 {
		result := entries[left-1]
		return &result, nil
	}

	return nil, nil
}

func (b *BinaryIndex) GetLatestTimestamp() (int64, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	entries, err := b.readAllUnlocked()
	if err != nil {
		return 0, err
	}
	if len(entries) == 0 {
		return 0, nil
	}

	return entries[len(entries)-1].Timestamp, nil
}

func (b *BinaryIndex) GetLatestSequenceNum() (int32, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	entries, err := b.readAllUnlocked()
	if err != nil {
		return 0, err
	}
	if len(entries) == 0 {
		return 0, nil
	}

	return entries[len(entries)-1].SequenceNum, nil
}

func (b *BinaryIndex) GetCorruptSegments(since time.Time) ([]IndexEntry, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	entries, err := b.readAllUnlocked()
	if err != nil {
		return nil, err
	}

	var corrupt []IndexEntry
	cutoff := since.UnixNano()

	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].Timestamp < cutoff {
			break
		}
		if entries[i].Status == SegmentStatusCorrupt {
			corrupt = append(corrupt, entries[i])
		}
	}

	return corrupt, nil
}

func NewIndexEntry(timestamp time.Time, sequenceNum int, status int32, filePath string) IndexEntry {
	return IndexEntry{
		Timestamp:   timestamp.UnixNano(),
		SequenceNum: int32(sequenceNum),
		Status:      status,
		FilePathLen: int32(len(filePath)),
		FilePath:    filePath,
	}
}

func NewCorruptIndexEntry(timestamp time.Time, sequenceNum int, filePath string) IndexEntry {
	return NewIndexEntry(timestamp, sequenceNum, SegmentStatusCorrupt, filePath)
}
