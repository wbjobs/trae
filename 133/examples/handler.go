package main

import (
	"encoding/json"
	"unsafe"

	"github.com/edge/wruntime/pkg/types"
)

//go:export alloc
func alloc(size uint32) *byte {
	buf := make([]byte, size)
	return &buf[0]
}

//go:export handler
func handler(inputPtr *byte, inputLen uint32) uint64 {
	input := make([]byte, inputLen)
	for i := uint32(0); i < inputLen; i++ {
		input[i] = *(*byte)(unsafe.Pointer(uintptr(unsafe.Pointer(inputPtr)) + uintptr(i)))
	}

	var req types.FunctionRequest
	json.Unmarshal(input, &req)

	responseBody := map[string]interface{}{
		"message":  "Hello from Wasm!",
		"received": string(req.Body),
		"method":   req.Method,
		"path":     req.Path,
		"headers":  req.Headers,
		"query":    req.Query,
	}

	response := types.FunctionResponse{
		StatusCode: 200,
		Body:       mustMarshal(responseBody),
		Headers: map[string]string{
			"Content-Type": "application/json",
			"X-Wasm":       "true",
		},
	}

	result := mustMarshal(response)

	resultPtr := alloc(uint32(len(result)))
	for i, b := range result {
		*(*byte)(unsafe.Pointer(uintptr(unsafe.Pointer(resultPtr)) + uintptr(i))) = b
	}

	return (uint64(uint32(uintptr(unsafe.Pointer(resultPtr)))) << 32) | uint64(len(result))
}

func mustMarshal(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func main() {}
