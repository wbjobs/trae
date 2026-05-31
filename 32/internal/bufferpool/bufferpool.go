package bufferpool

import (
	"sync"
)

const (
	smallBufferSize  = 1024
	mediumBufferSize = 32 * 1024
	largeBufferSize  = 64 * 1024
)

var (
	smallPool = sync.Pool{
		New: func() interface{} {
			b := make([]byte, smallBufferSize)
			return &b
		},
	}

	mediumPool = sync.Pool{
		New: func() interface{} {
			b := make([]byte, mediumBufferSize)
			return &b
		},
	}

	largePool = sync.Pool{
		New: func() interface{} {
			b := make([]byte, largeBufferSize)
			return &b
		},
	}

	frameDataPool = sync.Pool{
		New: func() interface{} {
			b := make([]byte, 0, 4096)
			return &b
		},
	}
)

func GetSmall() *[]byte {
	return smallPool.Get().(*[]byte)
}

func PutSmall(b *[]byte) {
	if b == nil {
		return
	}
	smallPool.Put(b)
}

func GetMedium() *[]byte {
	return mediumPool.Get().(*[]byte)
}

func PutMedium(b *[]byte) {
	if b == nil {
		return
	}
	mediumPool.Put(b)
}

func GetLarge() *[]byte {
	return largePool.Get().(*[]byte)
}

func PutLarge(b *[]byte) {
	if b == nil {
		return
	}
	largePool.Put(b)
}

func Get(size int) *[]byte {
	switch {
	case size <= smallBufferSize:
		b := GetSmall()
		*b = (*b)[:size]
		return b
	case size <= mediumBufferSize:
		b := GetMedium()
		*b = (*b)[:size]
		return b
	default:
		b := make([]byte, size)
		return &b
	}
}

func Put(b *[]byte) {
	if b == nil {
		return
	}
	c := cap(*b)
	switch {
	case c == smallBufferSize:
		PutSmall(b)
	case c == mediumBufferSize:
		PutMedium(b)
	case c == largeBufferSize:
		PutLarge(b)
	}
}

func GetFrameData() *[]byte {
	b := frameDataPool.Get().(*[]byte)
	*b = (*b)[:0]
	return b
}

func PutFrameData(b *[]byte) {
	if b == nil {
		return
	}
	if cap(*b) <= 65536 {
		frameDataPool.Put(b)
	}
}

type ByteBuffer struct {
	buf *[]byte
}

func NewByteBuffer(size int) *ByteBuffer {
	return &ByteBuffer{buf: Get(size)}
}

func (b *ByteBuffer) Bytes() []byte {
	return *b.buf
}

func (b *ByteBuffer) Len() int {
	return len(*b.buf)
}

func (b *ByteBuffer) Release() {
	Put(b.buf)
	b.buf = nil
}
