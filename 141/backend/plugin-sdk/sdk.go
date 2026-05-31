package sdk

import (
	"fmt"
	"unsafe"
)

//go:wasm-module dapr_state
//export malloc
func malloc(size uint32) uint32

//go:wasm-module dapr_state
//export free
func free(ptr uint32)

type Request struct {
	Key   string
	Value []byte
}

type Response struct {
	Key   string
	Value []byte
	Error string
}

func ReadString(ptr uint32, len uint32) string {
	if ptr == 0 || len == 0 {
		return ""
	}
	data := make([]byte, len)
	for i := uint32(0); i < len; i++ {
		data[i] = *(*byte)(unsafe.Pointer(uintptr(ptr + i)))
	}
	return string(data)
}

func WriteString(s string) (uint32, uint32) {
	data := []byte(s)
	ptr := malloc(uint32(len(data)))
	for i, b := range data {
		*(*byte)(unsafe.Pointer(uintptr(ptr + uint32(i)))) = b
	}
	return ptr, uint32(len(data))
}

func ReadBytes(ptr uint32, len uint32) []byte {
	if ptr == 0 || len == 0 {
		return nil
	}
	data := make([]byte, len)
	for i := uint32(0); i < len; i++ {
		data[i] = *(*byte)(unsafe.Pointer(uintptr(ptr + i)))
	}
	return data
}

func WriteBytes(data []byte) (uint32, uint32) {
	if len(data) == 0 {
		return 0, 0
	}
	ptr := malloc(uint32(len(data)))
	for i, b := range data {
		*(*byte)(unsafe.Pointer(uintptr(ptr + uint32(i)))) = b
	}
	return ptr, uint32(len(data))
}

func ReturnString(s string) uint64 {
	ptr, len := WriteString(s)
	return (uint64(ptr) << 32) | uint64(len)
}

func ReturnBytes(data []byte) uint64 {
	ptr, len := WriteBytes(data)
	return (uint64(ptr) << 32) | uint64(len)
}

func ReturnKeyValue(key string, value []byte) (uint64, uint64) {
	keyPtr, keyLen := WriteString(key)
	valuePtr, valueLen := WriteBytes(value)
	return (uint64(keyPtr) << 32) | uint64(keyLen), (uint64(valuePtr) << 32) | uint64(valueLen)
}

func ReturnError(err error) uint64 {
	if err == nil {
		return 0
	}
	errStr := fmt.Sprintf("error: %s", err.Error())
	return ReturnString(errStr)
}

func EncodeStringArray(keys []string) []byte {
	if len(keys) == 0 {
		return []byte{0, 0, 0, 0}
	}

	var result []byte
	countBuf := make([]byte, 4)
	countBuf[0] = byte(len(keys) >> 24)
	countBuf[1] = byte(len(keys) >> 16)
	countBuf[2] = byte(len(keys) >> 8)
	countBuf[3] = byte(len(keys))
	result = append(result, countBuf...)

	for _, key := range keys {
		keyBytes := []byte(key)
		lenBuf := make([]byte, 4)
		lenBuf[0] = byte(len(keyBytes) >> 24)
		lenBuf[1] = byte(len(keyBytes) >> 16)
		lenBuf[2] = byte(len(keyBytes) >> 8)
		lenBuf[3] = byte(len(keyBytes))
		result = append(result, lenBuf...)
		result = append(result, keyBytes...)
	}

	return result
}

func DecodeStringArray(ptr uint32, len uint32) ([]string, error) {
	if len < 4 {
		return nil, fmt.Errorf("invalid data length")
	}

	data := make([]byte, len)
	for i := uint32(0); i < len; i++ {
		data[i] = *(*byte)(unsafe.Pointer(uintptr(ptr + i)))
	}

	count := int(uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3]))
	offset := 4

	keys := make([]string, 0, count)
	for i := 0; i < count; i++ {
		if offset+4 > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		keyLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+keyLen > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		keys = append(keys, string(data[offset:offset+keyLen]))
		offset += keyLen
	}

	return keys, nil
}

func ReturnStringArray(keys []string) uint64 {
	data := EncodeStringArray(keys)
	ptr, _ := WriteBytes(data)
	return (uint64(ptr) << 32) | uint64(len(data))
}

func EncodeKeyValueMap(items map[string][]byte) []byte {
	if len(items) == 0 {
		return []byte{0, 0, 0, 0}
	}

	var result []byte
	countBuf := make([]byte, 4)
	countBuf[0] = byte(len(items) >> 24)
	countBuf[1] = byte(len(items) >> 16)
	countBuf[2] = byte(len(items) >> 8)
	countBuf[3] = byte(len(items))
	result = append(result, countBuf...)

	for key, value := range items {
		keyBytes := []byte(key)
		lenBuf := make([]byte, 4)
		lenBuf[0] = byte(len(keyBytes) >> 24)
		lenBuf[1] = byte(len(keyBytes) >> 16)
		lenBuf[2] = byte(len(keyBytes) >> 8)
		lenBuf[3] = byte(len(keyBytes))
		result = append(result, lenBuf...)
		result = append(result, keyBytes...)

		valLenBuf := make([]byte, 4)
		valLenBuf[0] = byte(len(value) >> 24)
		valLenBuf[1] = byte(len(value) >> 16)
		valLenBuf[2] = byte(len(value) >> 8)
		valLenBuf[3] = byte(len(value))
		result = append(result, valLenBuf...)
		result = append(result, value...)
	}

	return result
}

func DecodeKeyValueMap(ptr uint32, len uint32) (map[string][]byte, error) {
	if len < 4 {
		return nil, fmt.Errorf("invalid data length")
	}

	data := make([]byte, len)
	for i := uint32(0); i < len; i++ {
		data[i] = *(*byte)(unsafe.Pointer(uintptr(ptr + i)))
	}

	count := int(uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3]))
	offset := 4

	items := make(map[string][]byte, count)
	for i := 0; i < count; i++ {
		if offset+4 > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		keyLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+keyLen > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		key := string(data[offset : offset+keyLen])
		offset += keyLen

		if offset+4 > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		valLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+valLen > len(data) {
			return nil, fmt.Errorf("invalid data format")
		}
		value := make([]byte, valLen)
		copy(value, data[offset:offset+valLen])
		offset += valLen

		items[key] = value
	}

	return items, nil
}

func ReturnKeyValueMap(items map[string][]byte) uint64 {
	data := EncodeKeyValueMap(items)
	ptr, _ := WriteBytes(data)
	return (uint64(ptr) << 32) | uint64(len(data))
}
