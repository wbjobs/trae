package main

import (
	"fmt"
	"time"

	sdk "github.com/dapr-wasm-state/plugin-sdk"
)

//go:export before_set
func before_set(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	value := sdk.ReadBytes(valuePtr, valueLen)

	logf("SET key=%s size=%d", key, len(value))

	return sdk.ReturnKeyValue(key, value)
}

//go:export after_get
func after_get(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	value := sdk.ReadBytes(valuePtr, valueLen)

	logf("GET key=%s size=%d", key, len(value))

	return sdk.ReturnBytes(value)
}

//go:export before_get
func before_get(keyPtr, keyLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	logf("BEFORE_GET key=%s", key)
	return sdk.ReturnString(key)
}

//go:export before_delete
func before_delete(keyPtr, keyLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	logf("DELETE key=%s", key)
	return sdk.ReturnString(key)
}

//go:export after_set
func after_set(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	value := sdk.ReadBytes(valuePtr, valueLen)
	logf("AFTER_SET key=%s size=%d", key, len(value))
	return 0
}

func logf(format string, args ...interface{}) {
	timestamp := time.Now().Format(time.RFC3339)
	msg := fmt.Sprintf("[%s] %s", timestamp, fmt.Sprintf(format, args...))
	fmt.Println(msg)
}

func main() {}
