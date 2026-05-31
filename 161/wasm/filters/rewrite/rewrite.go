package main

//go:generate tinygo build -o rewrite.wasm -target wasm -no-debug rewrite.go

import (
	"encoding/json"
	"strings"
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

	result := FilterResult{
		Action:  0,
		Headers: make(map[string][]string),
	}

	if prefix, ok := req.Config["strip_prefix"]; ok {
		if strings.HasPrefix(req.Path, prefix) {
			newPath := strings.TrimPrefix(req.Path, prefix)
			if newPath == "" {
				newPath = "/"
			}
			result.Headers["x-rewritten-path"] = []string{newPath}
		}
	}

	if prefix, ok := req.Config["add_prefix"]; ok {
		if !strings.HasPrefix(req.Path, prefix) {
			result.Headers["x-rewritten-path"] = []string{prefix + req.Path}
		}
	}

	if oldHost, ok := req.Config["replace_host"]; ok {
		if newHost, ok := req.Config["with_host"]; ok {
			for k, v := range req.Headers {
				if strings.ToLower(k) == "host" {
					for _, host := range v {
						if host == oldHost {
							result.Headers["x-rewritten-host"] = []string{newHost}
						}
					}
				}
			}
		}
	}

	if len(result.Headers) > 0 {
		result.Action = 0
	}

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
