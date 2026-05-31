package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	wasmedge "github.com/second-state/WasmEdge-go/wasmedge"
)

const (
	MetaMaxSize    = 64 * 1024
	BodyOffsetBase = 64 * 1024
)

type WasmFilter struct {
	meta   FilterMeta
	vm     *wasmedge.VM
	module *wasmedge.Module
	store  *wasmedge.Store
	memory *wasmedge.Memory
	mu     sync.RWMutex
	loaded bool
}

type Engine struct {
	filters   map[string]*WasmFilter
	chain     []*WasmFilter
	pool      *BufferPool
	mu        sync.RWMutex
	hotReload chan struct{}
}

func NewEngine() *Engine {
	return &Engine{
		filters:   make(map[string]*WasmFilter),
		chain:     make([]*WasmFilter, 0),
		pool:      NewBufferPool(DefaultBufferSize, MaxBufferSize),
		hotReload: make(chan struct{}, 1),
	}
}

func (e *Engine) LoadFilter(meta FilterMeta) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, exists := e.filters[meta.Name]; exists {
		return fmt.Errorf("filter %s already loaded, use ReloadFilter", meta.Name)
	}

	vm, module, store, mem, err := createVM(meta)
	if err != nil {
		return fmt.Errorf("create vm for %s: %w", meta.Name, err)
	}

	f := &WasmFilter{
		meta:   meta,
		vm:     vm,
		module: module,
		store:  store,
		memory: mem,
		loaded: true,
	}

	e.filters[meta.Name] = f
	e.rebuildChain()
	return nil
}

func (e *Engine) ReloadFilter(meta FilterMeta) error {
	e.mu.Lock()
	old, exists := e.filters[meta.Name]
	if !exists {
		e.mu.Unlock()
		return e.LoadFilter(meta)
	}

	vm, module, store, mem, err := createVM(meta)
	if err != nil {
		e.mu.Unlock()
		return fmt.Errorf("reload vm for %s: %w", meta.Name, err)
	}

	old.mu.Lock()
	oldVm := old.vm
	oldModule := old.module
	old.vm = vm
	old.module = module
	old.store = store
	old.memory = mem
	old.meta = meta
	old.loaded = true
	old.mu.Unlock()

	oldVm.Release()
	oldModule.Release()

	e.rebuildChain()
	e.mu.Unlock()
	return nil
}

func (e *Engine) UnloadFilter(name string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	f, ok := e.filters[name]
	if !ok {
		return fmt.Errorf("filter %s not loaded", name)
	}

	f.mu.Lock()
	if f.vm != nil {
		f.vm.Release()
	}
	if f.module != nil {
		f.module.Release()
	}
	f.mu.Unlock()

	delete(e.filters, name)
	e.rebuildChain()
	return nil
}

func (e *Engine) rebuildChain() {
	chain := make([]*WasmFilter, 0, len(e.filters))
	for _, f := range e.filters {
		if f.meta.Enabled {
			chain = append(chain, f)
		}
	}
	for i := 0; i < len(chain)-1; i++ {
		for j := i + 1; j < len(chain); j++ {
			if chain[i].meta.Order > chain[j].meta.Order {
				chain[i], chain[j] = chain[j], chain[i]
			}
		}
	}
	e.chain = chain
}

func (e *Engine) GetChain() []FilterMeta {
	e.mu.RLock()
	defer e.mu.RUnlock()
	metas := make([]FilterMeta, len(e.chain))
	for i, f := range e.chain {
		f.mu.RLock()
		metas[i] = f.meta
		f.mu.RUnlock()
	}
	return metas
}

func createVM(meta FilterMeta) (*wasmedge.VM, *wasmedge.Module, *wasmedge.Store, *wasmedge.Memory, error) {
	conf := wasmedge.NewConfigure(wasmedge.WASI)
	vm := wasmedge.NewVMWithConfig(conf)

	wasi := vm.GetImportModule(wasmedge.WASI)
	wasi.InitWasi(nil, nil, nil)

	mod := wasmedge.NewModule("env")

	memType := wasmedge.NewMemoryType(256, 1024, wasmedge.Revision_1)
	mem := wasmedge.NewMemory(memType, nil, 0)
	mod.AddMemory("memory", mem)

	funcType := wasmedge.NewFunctionType(
		[]wasmedge.ValType{wasmedge.ValType_I32, wasmedge.ValType_I32},
		[]wasmedge.ValType{wasmedge.ValType_I32},
	)
	hostFunc := wasmedge.NewFunction(funcType,
		func(data interface{}, callframe *wasmedge.CallingFrame, params []interface{}) ([]interface{}, wasmedge.Result) {
			return nil, wasmedge.Result_Success
		}, nil, 0)
	mod.AddFunction("init", hostFunc)

	vm.RegisterModule(mod)

	err := vm.LoadWasmFile(meta.Path)
	if err != nil {
		vm.Release()
		mod.Release()
		conf.Release()
		return nil, nil, nil, nil, fmt.Errorf("load wasm file %s: %w", meta.Path, err)
	}

	err = vm.Validate()
	if err != nil {
		vm.Release()
		mod.Release()
		conf.Release()
		return nil, nil, nil, nil, fmt.Errorf("validate wasm %s: %w", meta.Path, err)
	}

	err = vm.Instantiate()
	if err != nil {
		vm.Release()
		mod.Release()
		conf.Release()
		return nil, nil, nil, nil, fmt.Errorf("instantiate wasm %s: %w", meta.Path, err)
	}

	store := vm.GetStore()
	vmMem, err := store.FindMemory("memory")
	if err != nil {
		vmMem = store.FindMemoryByIndex(0)
	}

	conf.Release()
	return vm, mod, store, vmMem, nil
}

func (f *WasmFilter) Execute(ctx context.Context, req *RequestContext) *FilterResult {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if !f.loaded {
		return &FilterResult{Action: ActionContinue}
	}

	if f.meta.NeedBody == NeedBodyNo {
		return f.executeHeaderOnly(ctx, req)
	}

	if req.BodyStream && req.BodyLen > BodyThreshold {
		return f.executeStreaming(ctx, req)
	}

	return f.executeFull(ctx, req)
}

func (f *WasmFilter) executeHeaderOnly(ctx context.Context, req *RequestContext) *FilterResult {
	headerJSON, _ := json.Marshal(req.Headers)

	meta := struct {
		ID      string              `json:"id"`
		Method  string              `json:"method"`
		Path    string              `json:"path"`
		Headers json.RawMessage     `json:"headers"`
		BodyLen int                 `json:"bodyLen"`
		Config  map[string]string   `json:"config"`
	}{
		ID:      req.ID,
		Method:  req.Method,
		Path:    req.Path,
		Headers: headerJSON,
		BodyLen: req.BodyLen,
		Config:  f.meta.Config,
	}
	metaJSON, _ := json.Marshal(meta)

	if len(metaJSON) > MetaMaxSize {
		return &FilterResult{Action: ActionContinue, Err: fmt.Errorf("meta too large: %d", len(metaJSON))}
	}

	f.memory.SetData(metaJSON, 0, uint(len(metaJSON)))

	ret, err := f.vm.Execute("on_request", int32(0), int32(len(metaJSON)), int32(0))
	if err != nil {
		return &FilterResult{Action: ActionContinue, Err: fmt.Errorf("execute %s: %w", f.meta.Name, err)}
	}

	return f.readResult(ret)
}

func (f *WasmFilter) executeFull(ctx context.Context, req *RequestContext) *FilterResult {
	bodyLen := req.BodyLen
	if bodyLen > 0 {
		if bodyLen > MaxBufferSize {
			bodyLen = MaxBufferSize
		}
		f.memory.SetData(req.Body[:bodyLen], uint(BodyOffsetBase), uint(bodyLen))
	}

	headerJSON, _ := json.Marshal(req.Headers)

	meta := struct {
		ID      string            `json:"id"`
		Method  string            `json:"method"`
		Path    string            `json:"path"`
		Headers json.RawMessage   `json:"headers"`
		BodyLen int               `json:"bodyLen"`
		Config  map[string]string `json:"config"`
	}{
		ID:      req.ID,
		Method:  req.Method,
		Path:    req.Path,
		Headers: headerJSON,
		BodyLen: bodyLen,
		Config:  f.meta.Config,
	}
	metaJSON, _ := json.Marshal(meta)

	if len(metaJSON) > BodyOffsetBase {
		return &FilterResult{Action: ActionContinue, Err: fmt.Errorf("meta too large: %d", len(metaJSON))}
	}

	f.memory.SetData(metaJSON, 0, uint(len(metaJSON)))

	ret, err := f.vm.Execute("on_request",
		int32(0), int32(len(metaJSON)),
		int32(BodyOffsetBase), int32(bodyLen),
	)
	if err != nil {
		return &FilterResult{Action: ActionContinue, Err: fmt.Errorf("execute %s: %w", f.meta.Name, err)}
	}

	return f.readResult(ret)
}

func (f *WasmFilter) executeStreaming(ctx context.Context, req *RequestContext) *FilterResult {
	totalLen := req.BodyLen
	chunkSize := StreamChunkSize

	for offset := 0; offset < totalLen; offset += chunkSize {
		end := offset + chunkSize
		if end > totalLen {
			end = totalLen
		}
		chunk := req.Body[offset:end]
		chunkLen := len(chunk)

		f.memory.SetData(chunk, uint(BodyOffsetBase), uint(chunkLen))

		chunkMeta := struct {
			ChunkOffset int  `json:"chunkOffset"`
			ChunkSize   int  `json:"chunkSize"`
			TotalLen    int  `json:"totalLen"`
			IsLast      bool `json:"isLast"`
		}{
			ChunkOffset: offset,
			ChunkSize:   chunkLen,
			TotalLen:    totalLen,
			IsLast:      end >= totalLen,
		}
		chunkMetaJSON, _ := json.Marshal(chunkMeta)
		chunkMetaLen := len(chunkMetaJSON)

		if chunkMetaLen >= BodyOffsetBase {
			continue
		}

		f.memory.SetData(chunkMetaJSON, 0, uint(chunkMetaLen))

		_, err := f.vm.Execute("on_request_chunk",
			int32(0), int32(chunkMetaLen),
			int32(BodyOffsetBase), int32(chunkLen),
		)
		if err != nil {
			log.Printf("Wasm filter %s chunk error: %v", f.meta.Name, err)
			break
		}
	}

	return &FilterResult{Action: ActionContinue}
}

func (f *WasmFilter) readResult(ret []interface{}) *FilterResult {
	if len(ret) == 0 {
		return &FilterResult{Action: ActionContinue}
	}

	ptr := ret[0].(int32)
	if ptr <= 0 {
		return &FilterResult{Action: ActionContinue}
	}

	memData, dataLen, err := f.memory.GetData(uint(ptr), uint(4096))
	if err != nil {
		return &FilterResult{Action: ActionContinue}
	}
	if dataLen == 0 {
		return &FilterResult{Action: ActionContinue}
	}

	var res struct {
		Action     int32               `json:"action"`
		StatusCode int32               `json:"statusCode"`
		Headers    map[string][]string `json:"headers"`
	}
	if err := json.Unmarshal(memData[:dataLen], &res); err != nil {
		return &FilterResult{Action: ActionContinue}
	}

	return &FilterResult{
		Action:     FilterAction(res.Action),
		StatusCode: res.StatusCode,
		Headers:    res.Headers,
		Modified:   res.Action == ActionShortCircuit,
	}
}

func (e *Engine) ExecuteChain(ctx context.Context, req *RequestContext) (*ResponseContext, error) {
	e.mu.RLock()
	chain := e.chain
	e.mu.RUnlock()

	resp := &ResponseContext{
		StatusCode: 200,
		Headers:    make(map[string][]string),
	}

	for _, f := range chain {
		select {
		case <-ctx.Done():
			return resp, ctx.Err()
		default:
		}

		start := time.Now()
		result := f.Execute(ctx, req)
		log.Printf("filter %s took %v", f.meta.Name, time.Since(start))

		if result.Err != nil {
			log.Printf("filter %s error: %v", f.meta.Name, result.Err)
		}

		if result.Action == ActionShortCircuit {
			resp.StatusCode = result.StatusCode
			if result.Headers != nil {
				resp.Headers = result.Headers
			}
			break
		}

		if result.Modified {
			if result.Headers != nil {
				for k, v := range result.Headers {
					resp.Headers[k] = v
				}
			}
			if result.Body != nil {
				resp.Body = result.Body
				resp.BodyLen = len(result.Body)
			}
		}
	}

	return resp, nil
}

func (e *Engine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()

	for name, f := range e.filters {
		f.mu.Lock()
		if f.vm != nil {
			f.vm.Release()
		}
		if f.module != nil {
			f.module.Release()
		}
		f.mu.Unlock()
		delete(e.filters, name)
	}
}
