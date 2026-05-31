package wasm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/edge/wruntime/pkg/config"
	"github.com/edge/wruntime/pkg/types"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

type Runtime struct {
	cache      wazero.CompilationCache
	moduleCache map[string]*cachedModule
	mu          sync.RWMutex
	timeout     time.Duration
}

type cachedModule struct {
	compiled wazero.CompiledModule
	lastUsed time.Time
}

func NewRuntime(ctx context.Context, cfg *config.Config) (*Runtime, error) {
	cache := wazero.NewCompilationCache()

	timeout := cfg.FunctionTimeout
	if timeout <= 0 {
		timeout = 3 * time.Second
	}

	return &Runtime{
		cache:       cache,
		moduleCache: make(map[string]*cachedModule),
		timeout:     timeout,
	}, nil
}

func (r *Runtime) Close(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, cm := range r.moduleCache {
		cm.compiled.Close(ctx)
	}
	r.moduleCache = nil
	r.cache.Close(ctx)
	return nil
}

func (r *Runtime) getModuleHash(wasmBytes []byte) string {
	h := sha256.Sum256(wasmBytes)
	return hex.EncodeToString(h[:])
}

func (r *Runtime) getOrCompileModule(ctx context.Context, wasmBytes []byte, hash string) (wazero.CompiledModule, error) {
	r.mu.RLock()
	if cm, ok := r.moduleCache[hash]; ok {
		r.mu.RUnlock()
		cm.lastUsed = time.Now()
		return cm.compiled, nil
	}
	r.mu.RUnlock()

	runtime := wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfig().WithCompilationCache(r.cache))
	defer runtime.Close(ctx)

	_, err := wasi_snapshot_preview1.Instantiate(ctx, runtime)
	if err != nil {
		return nil, fmt.Errorf("failed to instantiate WASI: %w", err)
	}

	compiled, err := runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to compile module: %w", err)
	}

	r.mu.Lock()
	r.moduleCache[hash] = &cachedModule{
		compiled: compiled,
		lastUsed: time.Now(),
	}
	r.mu.Unlock()

	return compiled, nil
}

func (r *Runtime) Invoke(ctx context.Context, wasmBytes []byte, req *types.FunctionRequest) (*types.FunctionResponse, error) {
	start := time.Now()

	hash := r.getModuleHash(wasmBytes)

	execCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	resultChan := make(chan *types.FunctionResponse, 1)
	errChan := make(chan error, 1)

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				errChan <- fmt.Errorf("wasm execution panic: %v", rec)
			}
		}()

		resp, err := r.invokeWithCompiledModule(execCtx, wasmBytes, hash, req)
		if err != nil {
			errChan <- err
			return
		}
		resultChan <- resp
	}()

	select {
	case <-execCtx.Done():
		return &types.FunctionResponse{
			StatusCode: 504,
			Body:       []byte("function execution timeout"),
			Error:      fmt.Sprintf("timeout: function execution exceeded %v limit", r.timeout),
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	case err := <-errChan:
		return &types.FunctionResponse{
			StatusCode: 500,
			Body:       []byte(fmt.Sprintf("function error: %v", err)),
			Error:      err.Error(),
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	case resp := <-resultChan:
		resp.DurationMs = time.Since(start).Milliseconds()
		return resp, nil
	}
}

func (r *Runtime) invokeWithCompiledModule(ctx context.Context, wasmBytes []byte, hash string, req *types.FunctionRequest) (*types.FunctionResponse, error) {
	runtime := wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfig().WithCompilationCache(r.cache))
	defer runtime.Close(ctx)

	_, err := wasi_snapshot_preview1.Instantiate(ctx, runtime)
	if err != nil {
		return nil, fmt.Errorf("failed to instantiate WASI: %w", err)
	}

	compiled, err := r.getOrCompileModule(ctx, wasmBytes, hash)
	if err != nil {
		return nil, err
	}

	moduleConfig := wazero.NewModuleConfig().
		WithStdout(nil).
		WithStderr(nil).
		WithStartFunctions("_initialize")

	module, err := runtime.InstantiateModule(ctx, compiled, moduleConfig)
	if err != nil {
		module, err = runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig())
		if err != nil {
			return nil, fmt.Errorf("failed to instantiate module: %w", err)
		}
	}
	defer module.Close(ctx)

	inputData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	result, err := r.callFunction(ctx, module, inputData)
	if err != nil {
		return nil, err
	}

	var resp types.FunctionResponse
	if err := json.Unmarshal(result, &resp); err != nil {
		return &types.FunctionResponse{
			StatusCode: 200,
			Body:       result,
			Headers:    make(map[string]string),
		}, nil
	}

	return &resp, nil
}

func (r *Runtime) callFunction(ctx context.Context, module api.Module, input []byte) ([]byte, error) {
	alloc := module.ExportedFunction("alloc")
	if alloc == nil {
		return nil, fmt.Errorf("alloc function not found")
	}

	allocResult, err := alloc.Call(ctx, uint64(len(input)))
	if err != nil {
		return nil, fmt.Errorf("alloc failed: %w", err)
	}
	ptr := uint32(allocResult[0])

	if !module.Memory().Write(ptr, input) {
		return nil, fmt.Errorf("failed to write input to memory")
	}

	handler := module.ExportedFunction("handler")
	if handler == nil {
		handler = module.ExportedFunction("process")
		if handler == nil {
			handler = module.ExportedFunction("handle_request")
			if handler == nil {
				return nil, fmt.Errorf("no handler function found (expected: handler, process, or handle_request)")
			}
		}
	}

	handlerResult, err := handler.Call(ctx, uint64(ptr), uint64(len(input)))
	if err != nil {
		return nil, fmt.Errorf("handler failed: %w", err)
	}

	resultPtr := uint32(handlerResult[0] >> 32)
	resultLen := uint32(handlerResult[0])

	if resultLen == 0 {
		resultPtr = uint32(handlerResult[0])
		if len(handlerResult) > 1 {
			resultLen = uint32(handlerResult[1])
		}
	}

	if resultLen == 0 {
		return []byte{}, nil
	}

	result, ok := module.Memory().Read(resultPtr, resultLen)
	if !ok {
		return nil, fmt.Errorf("failed to read result from memory")
	}

	return result, nil
}
