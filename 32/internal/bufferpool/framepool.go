package bufferpool

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type PooledTTYFrame struct {
	Time      time.Time
	SessionID uuid.UUID
	OffsetMs  int64
	FrameType string
	Data      []byte
	DataBuf   *[]byte
	pooled    bool
}

var framePool = sync.Pool{
	New: func() interface{} {
		return &PooledTTYFrame{
			pooled: true,
		}
	},
}

func GetFrame() *PooledTTYFrame {
	f := framePool.Get().(*PooledTTYFrame)
	f.pooled = false
	return f
}

func PutFrame(f *PooledTTYFrame) {
	if f == nil || f.pooled {
		return
	}
	if f.DataBuf != nil {
		PutFrameData(f.DataBuf)
		f.DataBuf = nil
	}
	f.Time = time.Time{}
	f.SessionID = uuid.Nil
	f.OffsetMs = 0
	f.FrameType = ""
	f.Data = nil
	f.pooled = true
	framePool.Put(f)
}

type PooledRecordingFrame struct {
	Time     time.Time
	OffsetMs int64
	Type     string
	Data     string
	pooled   bool
}

var recordingFramePool = sync.Pool{
	New: func() interface{} {
		return &PooledRecordingFrame{
			pooled: true,
		}
	},
}

func GetRecordingFrame() *PooledRecordingFrame {
	f := recordingFramePool.Get().(*PooledRecordingFrame)
	f.pooled = false
	return f
}

func PutRecordingFrame(f *PooledRecordingFrame) {
	if f == nil || f.pooled {
		return
	}
	f.Time = time.Time{}
	f.OffsetMs = 0
	f.Type = ""
	f.Data = ""
	f.pooled = true
	recordingFramePool.Put(f)
}
