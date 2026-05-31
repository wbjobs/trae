package wasm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/tetratelabs/wazero"
	wazeroapi "github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

type PluginManager struct {
	mu      sync.RWMutex
	runtime wazero.Runtime
	plugins map[string]*WasmPlugin
	pluginDir string
}

type WasmPlugin struct {
	ID       string
	Name     string
	Path     string
	Module   wazeroapi.Module
	Runtime  wazero.Runtime
	Config   PluginConfig
}

type PluginConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	Enabled     bool   `json:"enabled"`
}

type PluginHooks struct {
	BeforeGet    func(key string) (string, error)
	AfterGet     func(key string, value []byte) ([]byte, error)
	BeforeSet    func(key string, value []byte) (string, []byte, error)
	AfterSet     func(key string, value []byte) error
	BeforeDelete func(key string) (string, error)
	AfterDelete  func(key string) error

	BulkBeforeGet    func(keys []string) ([]string, error)
	BulkAfterGet     func(keys []string, values map[string][]byte) (map[string][]byte, error)
	BulkBeforeSet    func(items map[string][]byte) (map[string][]byte, error)
	BulkAfterSet     func(items map[string][]byte) error
	BulkBeforeDelete func(keys []string) ([]string, error)
	BulkAfterDelete  func(keys []string) error
}

var managerInstance *PluginManager
var managerOnce sync.Once

func GetPluginManager(pluginDir string) (*PluginManager, error) {
	var initErr error
	managerOnce.Do(func() {
		ctx := context.Background()
		runtime := wazero.NewRuntime(ctx)

		if _, err := wasi_snapshot_preview1.Instantiate(ctx, runtime); err != nil {
			initErr = fmt.Errorf("failed to instantiate WASI: %w", err)
			return
		}

		if err := os.MkdirAll(pluginDir, 0755); err != nil {
			initErr = fmt.Errorf("failed to create plugin directory: %w", err)
			return
		}

		managerInstance = &PluginManager{
			runtime:   runtime,
			plugins:   make(map[string]*WasmPlugin),
			pluginDir: pluginDir,
		}
	})
	if initErr != nil {
		return nil, initErr
	}
	return managerInstance, nil
}

func (pm *PluginManager) LoadPlugin(ctx context.Context, wasmData []byte, config PluginConfig) (*WasmPlugin, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if config.ID == "" {
		hash := sha256.Sum256(wasmData)
		config.ID = hex.EncodeToString(hash[:8])
	}

	pluginPath := filepath.Join(pm.pluginDir, config.ID+".wasm")
	if err := os.WriteFile(pluginPath, wasmData, 0644); err != nil {
		return nil, fmt.Errorf("failed to write plugin file: %w", err)
	}

	module, err := pm.runtime.InstantiateWithConfig(ctx, wasmData, wazero.NewModuleConfig())
	if err != nil {
		return nil, fmt.Errorf("failed to instantiate wasm module: %w", err)
	}

	plugin := &WasmPlugin{
		ID:      config.ID,
		Name:    config.Name,
		Path:    pluginPath,
		Module:  module,
		Runtime: pm.runtime,
		Config:  config,
	}

	pm.plugins[config.ID] = plugin
	return plugin, nil
}

func (pm *PluginManager) LoadPluginFromFile(ctx context.Context, path string, config PluginConfig) (*WasmPlugin, error) {
	wasmData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read wasm file: %w", err)
	}
	return pm.LoadPlugin(ctx, wasmData, config)
}

func (pm *PluginManager) UnloadPlugin(ctx context.Context, pluginID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	plugin, ok := pm.plugins[pluginID]
	if !ok {
		return errors.New("plugin not found")
	}

	if err := plugin.Module.Close(ctx); err != nil {
		return fmt.Errorf("failed to close module: %w", err)
	}

	if err := os.Remove(plugin.Path); err != nil {
		return fmt.Errorf("failed to remove plugin file: %w", err)
	}

	delete(pm.plugins, pluginID)
	return nil
}

func (pm *PluginManager) GetPlugin(pluginID string) (*WasmPlugin, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	plugin, ok := pm.plugins[pluginID]
	if !ok {
		return nil, errors.New("plugin not found")
	}
	return plugin, nil
}

func (pm *PluginManager) ListPlugins() []PluginConfig {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	configs := make([]PluginConfig, 0, len(pm.plugins))
	for _, plugin := range pm.plugins {
		configs = append(configs, plugin.Config)
	}
	return configs
}

func (pm *PluginManager) GetPluginHooks(pluginID string) (*PluginHooks, error) {
	plugin, err := pm.GetPlugin(pluginID)
	if err != nil {
		return nil, err
	}

	module := plugin.Module

	hooks := &PluginHooks{}

	if fn := module.ExportedFunction("before_get"); fn != nil {
		hooks.BeforeGet = func(key string) (string, error) {
			return callWasmStringFn(module, fn, key)
		}
	}

	if fn := module.ExportedFunction("after_get"); fn != nil {
		hooks.AfterGet = func(key string, value []byte) ([]byte, error) {
			return callWasmBytesFn(module, fn, key, value)
		}
	}

	if fn := module.ExportedFunction("before_set"); fn != nil {
		hooks.BeforeSet = func(key string, value []byte) (string, []byte, error) {
			return callWasmKeyValueFn(module, fn, key, value)
		}
	}

	if fn := module.ExportedFunction("after_set"); fn != nil {
		hooks.AfterSet = func(key string, value []byte) error {
			return callWasmVoidFn(module, fn, key, value)
		}
	}

	if fn := module.ExportedFunction("before_delete"); fn != nil {
		hooks.BeforeDelete = func(key string) (string, error) {
			return callWasmStringFn(module, fn, key)
		}
	}

	if fn := module.ExportedFunction("after_delete"); fn != nil {
		hooks.AfterDelete = func(key string) error {
			return callWasmVoidFnKey(module, fn, key)
		}
	}

	if fn := module.ExportedFunction("bulk_before_get"); fn != nil {
		hooks.BulkBeforeGet = func(keys []string) ([]string, error) {
			return callWasmBulkStringFn(module, fn, keys)
		}
	}

	if fn := module.ExportedFunction("bulk_after_get"); fn != nil {
		hooks.BulkAfterGet = func(keys []string, values map[string][]byte) (map[string][]byte, error) {
			data := encodeKeyValueMap(values)
			ctx := context.Background()
			keysData := encodeStringArray(keys)
			keysPtr, _ := module.Memory().Write(keysData)
			dataPtr, _ := module.Memory().Write(data)
			result, err := fn.Call(ctx, uint64(keysPtr), uint64(len(keysData)), uint64(dataPtr), uint64(len(data)))
			if err != nil {
				return nil, err
			}
			resultPtr := uint32(result[0] >> 32)
			resultLen := uint32(result[0])
			output, ok := module.Memory().Read(resultPtr, resultLen)
			if !ok {
				return nil, errors.New("failed to read result from wasm memory")
			}
			return decodeKeyValueMap(output)
		}
	}

	if fn := module.ExportedFunction("bulk_before_set"); fn != nil {
		hooks.BulkBeforeSet = func(items map[string][]byte) (map[string][]byte, error) {
			return callWasmBulkKeyValueFn(module, fn, items)
		}
	}

	if fn := module.ExportedFunction("bulk_after_set"); fn != nil {
		hooks.BulkAfterSet = func(items map[string][]byte) error {
			data := encodeKeyValueMap(items)
			return callWasmBulkVoidFn(module, fn, data)
		}
	}

	if fn := module.ExportedFunction("bulk_before_delete"); fn != nil {
		hooks.BulkBeforeDelete = func(keys []string) ([]string, error) {
			return callWasmBulkStringFn(module, fn, keys)
		}
	}

	if fn := module.ExportedFunction("bulk_after_delete"); fn != nil {
		hooks.BulkAfterDelete = func(keys []string) error {
			data := encodeStringArray(keys)
			return callWasmBulkVoidFn(module, fn, data)
		}
	}

	return hooks, nil
}

func callWasmStringFn(module wazeroapi.Module, fn wazeroapi.Function, input string) (string, error) {
	ctx := context.Background()
	inputBytes := []byte(input)

	ptr, err := module.Memory().Write(inputBytes)
	if err != nil {
		return "", err
	}

	result, err := fn.Call(ctx, uint64(ptr), uint64(len(inputBytes)))
	if err != nil {
		return "", err
	}

	resultPtr := uint32(result[0] >> 32)
	resultLen := uint32(result[0])

	output, ok := module.Memory().Read(resultPtr, resultLen)
	if !ok {
		return "", errors.New("failed to read result from wasm memory")
	}

	return string(output), nil
}

func callWasmBytesFn(module wazeroapi.Module, fn wazeroapi.Function, key string, value []byte) ([]byte, error) {
	ctx := context.Background()
	keyBytes := []byte(key)

	keyPtr, err := module.Memory().Write(keyBytes)
	if err != nil {
		return nil, err
	}

	valuePtr, err := module.Memory().Write(value)
	if err != nil {
		return nil, err
	}

	result, err := fn.Call(ctx, uint64(keyPtr), uint64(len(keyBytes)), uint64(valuePtr), uint64(len(value)))
	if err != nil {
		return nil, err
	}

	resultPtr := uint32(result[0] >> 32)
	resultLen := uint32(result[0])

	output, ok := module.Memory().Read(resultPtr, resultLen)
	if !ok {
		return nil, errors.New("failed to read result from wasm memory")
	}

	resultCopy := make([]byte, len(output))
	copy(resultCopy, output)
	return resultCopy, nil
}

func callWasmKeyValueFn(module wazeroapi.Module, fn wazeroapi.Function, key string, value []byte) (string, []byte, error) {
	ctx := context.Background()
	keyBytes := []byte(key)

	keyPtr, err := module.Memory().Write(keyBytes)
	if err != nil {
		return "", nil, err
	}

	valuePtr, err := module.Memory().Write(value)
	if err != nil {
		return "", nil, err
	}

	result, err := fn.Call(ctx, uint64(keyPtr), uint64(len(keyBytes)), uint64(valuePtr), uint64(len(value)))
	if err != nil {
		return "", nil, err
	}

	keyResultPtr := uint32(result[1] >> 32)
	keyResultLen := uint32(result[1])
	valueResultPtr := uint32(result[0] >> 32)
	valueResultLen := uint32(result[0])

	outputKey, ok := module.Memory().Read(keyResultPtr, keyResultLen)
	if !ok {
		return "", nil, errors.New("failed to read key from wasm memory")
	}

	outputValue, ok := module.Memory().Read(valueResultPtr, valueResultLen)
	if !ok {
		return "", nil, errors.New("failed to read value from wasm memory")
	}

	resultValue := make([]byte, len(outputValue))
	copy(resultValue, outputValue)

	return string(outputKey), resultValue, nil
}

func callWasmVoidFn(module wazeroapi.Module, fn wazeroapi.Function, key string, value []byte) error {
	ctx := context.Background()
	keyBytes := []byte(key)

	keyPtr, err := module.Memory().Write(keyBytes)
	if err != nil {
		return err
	}

	valuePtr, err := module.Memory().Write(value)
	if err != nil {
		return err
	}

	_, err = fn.Call(ctx, uint64(keyPtr), uint64(len(keyBytes)), uint64(valuePtr), uint64(len(value)))
	return err
}

func callWasmVoidFnKey(module wazeroapi.Module, fn wazeroapi.Function, key string) error {
	ctx := context.Background()
	keyBytes := []byte(key)

	ptr, err := module.Memory().Write(keyBytes)
	if err != nil {
		return err
	}

	_, err = fn.Call(ctx, uint64(ptr), uint64(len(keyBytes)))
	return err
}

func encodeStringArray(keys []string) []byte {
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

func decodeStringArray(data []byte) ([]string, error) {
	if len(data) < 4 {
		return nil, errors.New("invalid data format")
	}

	count := int(uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3]))
	offset := 4

	keys := make([]string, 0, count)
	for i := 0; i < count; i++ {
		if offset+4 > len(data) {
			return nil, errors.New("invalid data format")
		}
		keyLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+keyLen > len(data) {
			return nil, errors.New("invalid data format")
		}
		keys = append(keys, string(data[offset:offset+keyLen]))
		offset += keyLen
	}

	return keys, nil
}

func encodeKeyValueMap(items map[string][]byte) []byte {
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

func decodeKeyValueMap(data []byte) (map[string][]byte, error) {
	if len(data) < 4 {
		return nil, errors.New("invalid data format")
	}

	count := int(uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3]))
	offset := 4

	items := make(map[string][]byte, count)
	for i := 0; i < count; i++ {
		if offset+4 > len(data) {
			return nil, errors.New("invalid data format")
		}
		keyLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+keyLen > len(data) {
			return nil, errors.New("invalid data format")
		}
		key := string(data[offset : offset+keyLen])
		offset += keyLen

		if offset+4 > len(data) {
			return nil, errors.New("invalid data format")
		}
		valLen := int(uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3]))
		offset += 4

		if offset+valLen > len(data) {
			return nil, errors.New("invalid data format")
		}
		value := make([]byte, valLen)
		copy(value, data[offset:offset+valLen])
		offset += valLen

		items[key] = value
	}

	return items, nil
}

func callWasmBulkStringFn(module wazeroapi.Module, fn wazeroapi.Function, keys []string) ([]string, error) {
	ctx := context.Background()
	data := encodeStringArray(keys)

	ptr, err := module.Memory().Write(data)
	if err != nil {
		return nil, err
	}

	result, err := fn.Call(ctx, uint64(ptr), uint64(len(data)))
	if err != nil {
		return nil, err
	}

	resultPtr := uint32(result[0] >> 32)
	resultLen := uint32(result[0])

	output, ok := module.Memory().Read(resultPtr, resultLen)
	if !ok {
		return nil, errors.New("failed to read result from wasm memory")
	}

	return decodeStringArray(output)
}

func callWasmBulkKeyValueFn(module wazeroapi.Module, fn wazeroapi.Function, items map[string][]byte) (map[string][]byte, error) {
	ctx := context.Background()
	data := encodeKeyValueMap(items)

	ptr, err := module.Memory().Write(data)
	if err != nil {
		return nil, err
	}

	result, err := fn.Call(ctx, uint64(ptr), uint64(len(data)))
	if err != nil {
		return nil, err
	}

	resultPtr := uint32(result[0] >> 32)
	resultLen := uint32(result[0])

	output, ok := module.Memory().Read(resultPtr, resultLen)
	if !ok {
		return nil, errors.New("failed to read result from wasm memory")
	}

	return decodeKeyValueMap(output)
}

func callWasmBulkVoidFn(module wazeroapi.Module, fn wazeroapi.Function, data []byte) error {
	ctx := context.Background()

	ptr, err := module.Memory().Write(data)
	if err != nil {
		return err
	}

	_, err = fn.Call(ctx, uint64(ptr), uint64(len(data)))
	return err
}

func (pm *PluginManager) Close(ctx context.Context) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, plugin := range pm.plugins {
		plugin.Module.Close(ctx)
	}
	pm.plugins = make(map[string]*WasmPlugin)

	return pm.runtime.Close(ctx)
}
