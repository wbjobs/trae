package player

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"time"
)

type Frame struct {
	Delay time.Duration
	Data  []byte
}

type Player struct {
	file       *os.File
	filePath   string
	frames     []Frame
	currentIdx int
	startTime  time.Time
	paused     bool
	speed      float64
}

func New(filePath string) (*Player, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open recording: %w", err)
	}

	frames, err := parseFrames(file)
	if err != nil {
		file.Close()
		return nil, err
	}

	return &Player{
		file:     file,
		filePath: filePath,
		frames:   frames,
		speed:    1.0,
	}, nil
}

func parseFrames(r io.Reader) ([]Frame, error) {
	var frames []Frame

	header := make([]byte, 12)
	for {
		_, err := io.ReadFull(r, header)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read header: %w", err)
		}

		sec := binary.LittleEndian.Uint32(header[0:4])
		usec := binary.LittleEndian.Uint32(header[4:8])
		length := binary.LittleEndian.Uint32(header[8:12])

		data := make([]byte, length)
		if length > 0 {
			_, err = io.ReadFull(r, data)
			if err != nil {
				return nil, fmt.Errorf("read frame data: %w", err)
			}
		}

		frames = append(frames, Frame{
			Delay: time.Duration(sec)*time.Second + time.Duration(usec)*time.Microsecond,
			Data:  data,
		})
	}

	return frames, nil
}

func (p *Player) TotalFrames() int {
	return len(p.frames)
}

func (p *Player) FrameAt(idx int) (*Frame, error) {
	if idx < 0 || idx >= len(p.frames) {
		return nil, fmt.Errorf("frame index out of range: %d", idx)
	}
	return &p.frames[idx], nil
}

func (p *Player) NextFrame() (*Frame, bool) {
	if p.currentIdx >= len(p.frames) {
		return nil, false
	}
	frame := &p.frames[p.currentIdx]
	p.currentIdx++
	return frame, true
}

func (p *Player) Seek(idx int) {
	if idx < 0 {
		idx = 0
	}
	if idx > len(p.frames) {
		idx = len(p.frames)
	}
	p.currentIdx = idx
}

func (p *Player) CurrentIdx() int {
	return p.currentIdx
}

func (p *Player) SetSpeed(speed float64) {
	if speed <= 0 {
		speed = 1.0
	}
	p.speed = speed
}

func (p *Player) Speed() float64 {
	return p.speed
}

func (p *Player) SetPaused(paused bool) {
	p.paused = paused
}

func (p *Player) Paused() bool {
	return p.paused
}

func (p *Player) Close() {
	if p.file != nil {
		p.file.Close()
		p.file = nil
	}
}

func (p *Player) FilePath() string {
	return p.filePath
}

func (p *Player) TotalDuration() time.Duration {
	if len(p.frames) == 0 {
		return 0
	}
	return p.frames[len(p.frames)-1].Delay
}
