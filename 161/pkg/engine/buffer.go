package engine

import (
	"sync"
)

type BufferPool struct {
	pool    *sync.Pool
	maxSize int
}

func NewBufferPool(initialSize, maxSize int) *BufferPool {
	return &BufferPool{
		pool: &sync.Pool{
			New: func() interface{} {
				buf := make([]byte, initialSize)
				return &buf
			},
		},
		maxSize: maxSize,
	}
}

func (p *BufferPool) Get(size int) *[]byte {
	buf := p.pool.Get().(*[]byte)
	if cap(*buf) < size {
		if size > p.maxSize {
			newBuf := make([]byte, p.maxSize)
			return &newBuf
		}
		newBuf := make([]byte, size)
		return &newBuf
	}
	*buf = (*buf)[:size]
	return buf
}

func (p *BufferPool) Put(buf *[]byte) {
	if buf == nil {
		return
	}
	if cap(*buf) <= p.maxSize {
		*buf = (*buf)[:0]
		p.pool.Put(buf)
	}
}

type ScratchBuffer struct {
	Data  *[]byte
	Len   int
	pool  *BufferPool
	inUse bool
}

func NewScratchBuffer(pool *BufferPool, size int) *ScratchBuffer {
	buf := pool.Get(size)
	return &ScratchBuffer{
		Data:  buf,
		Len:   0,
		pool:  pool,
		inUse: true,
	}
}

func (sb *ScratchBuffer) Release() {
	if !sb.inUse {
		return
	}
	sb.inUse = false
	sb.pool.Put(sb.Data)
}

func (sb *ScratchBuffer) Bytes() []byte {
	if sb.Data == nil {
		return nil
	}
	return (*sb.Data)[:sb.Len]
}
