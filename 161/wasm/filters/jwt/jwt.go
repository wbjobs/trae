package main

//go:generate tinygo build -o jwt.wasm -target wasm -no-debug jwt.go

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

	token := extractToken(req.Headers)
	if token == "" {
		result := FilterResult{
			Action:     1,
			StatusCode: 401,
			Headers:    map[string][]string{"x-jwt-error": {"missing token"}},
		}
		return writeResult(result)
	}

	if !validateJWT(token, req.Config) {
		result := FilterResult{
			Action:     1,
			StatusCode: 401,
			Headers:    map[string][]string{"x-jwt-error": {"invalid token"}},
		}
		return writeResult(result)
	}

	result := FilterResult{
		Action: 0,
	}
	return writeResult(result)
}

func extractToken(headers map[string][]string) string {
	for k, v := range headers {
		if strings.ToLower(k) == "authorization" {
			for _, val := range v {
				if strings.HasPrefix(val, "Bearer ") {
					return strings.TrimPrefix(val, "Bearer ")
				}
				return val
			}
		}
	}
	if tokens, ok := headers["x-jwt-token"]; ok && len(tokens) > 0 {
		return tokens[0]
	}
	return ""
}

func validateJWT(token string, config map[string]string) bool {
	if token == "" {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	if expected, ok := config["expected_issuer"]; ok {
		_ = expected
	}
	return true
}

func writeResult(result FilterResult) int32 {
	data, _ := json.Marshal(result)
	ptr := allocate(int32(len(data)))
	writeBytes(uintptr(ptr), data)
	return int32(ptr)
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

func writeBytes(ptr uintptr, data []byte) {
	for i, b := range data {
		heap[ptr+uintptr(i)] = b
	}
}

func main() {}
