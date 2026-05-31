package main

//go:generate tinygo build -o logger.wasm -target wasm -no-debug logger.go

import (
	"encoding/json"
	"fmt"
	"time"
)

type RequestMeta struct {
	ID      string              `json:"id"`
	Method  string              `json:"method"`
	Path    string              `json:"path"`
	Headers map[string][]string `json:"headers"`
	BodyLen int                 `json:"bodyLen"`
	Config  map[string]string   `json:"config"`
}

type FilterResult struct {
	Action     int32               `json:"action"`
	StatusCode int32               `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
}

//export on_request
func on_request(metaPtr int32, metaLen int32, bodyPtr int32, bodyLen int32) int32 {
	meta := readString(uintptr(metaPtr), int(metaLen))

	var req RequestMeta
	json.Unmarshal([]byte(meta), &req)

	timestamp := time.Now().Format(time.RFC3339)

	logLevel := "INFO"
	if v, ok := req.Config["log_level"]; ok {
		logLevel = v
	}

	logBody := false
	if v, ok := req.Config["log_body"]; ok && v == "true" {
		logBody = true
	}

	headerCount := len(req.Headers)

	if logBody && bodyLen > 0 {
		fmt.Printf("[%s] [%s] %s %s body=%dB headers=%d\n",
			timestamp, logLevel, req.Method, req.Path, bodyLen, headerCount)
	} else {
		fmt.Printf("[%s] [%s] %s %s headers=%d\n",
			timestamp, logLevel, req.Method, req.Path, headerCount)
	}

	if v, ok := req.Config["add_header"]; ok {
		result := FilterResult{
			Action:  0,
			Headers: map[string][]string{"x-logged-at": {timestamp}},
		}
		if v == "true" {
			return writeResult(result)
		}
	}

	result := FilterResult{Action: 0}
	return writeResult(result)
}

var heap [65536]byte
var heapPtr uint32 = 4096

func allocate(size int32) uintptr {
	ptr := heapPtr
	heapPtr += uint32(size)
	if heapPtr > 60000 {
		heapPtr = 4096
	}
	return uintptr(ptr)
}

func readString(ptr uintptr, length int) string {
	if length <= 0 || ptr == 0 {
		return ""
	}
	return string(heap[ptr : ptr+uintptr(length)])
}

func writeResult(result FilterResult) int32 {
	data, _ := json.Marshal(result)
	ptr := allocate(int32(len(data)))
	writeBytes(uintptr(ptr), data)
	return int32(ptr)
}

func writeBytes(ptr uintptr, data []byte) {
	for i, b := range data {
		heap[ptr+uintptr(i)] = b
	}
}

func main() {}
