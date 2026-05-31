# Dapr Wasm Middleware

A Dapr pluggable middleware component powered by WasmEdge, supporting request/response filtering with hot-reloadable Wasm modules and a React management frontend.

## Architecture

```
Dapr Sidecar
    │ gRPC (pluggable middleware)
    ▼
dapr-wasm-middleware (Go)
    │
    ├── WasmEdge Engine     → JWT, Rewrite, Logger (TinyGo → .wasm)
    ├── Hot Reload          → fsnotify watcher, zero-downtime module swap
    ├── HTTP API (:8080)    → CRUD, chain reorder, manual reload
    └── React Frontend      → Drag-and-drop chain editor
```

## Key Features

- **Wasm Filter Chain**: Request flows through ordered Wasm modules for JWT validation, path rewriting, access logging, etc.
- **Hot Reload**: Drop a `.wasm` file and the module reloads without restarting the sidecar.
- **Body Strategy**: `Header-Only` (no body copy), `Full Body` (zero-copy direct to Wasm linear memory), `Streaming` (chunked for >1MB bodies).
- **Large Body Performance**: Body written directly to Wasm linear memory via `SetData` — single copy, no intermediate Go buffers. `NeedBodyNo` filters never trigger body allocation.
- **Management UI**: Drag-and-drop chain ordering, filter CRUD, live status.

## Project Structure

```
.
├── main.go
├── cmd/root.go                 # Cobra CLI entry point
├── pkg/
│   ├── engine/
│   │   ├── types.go            # Core data types (RequestContext, FilterResult)
│   │   ├── buffer.go           # ScratchBuffer pool (metadata only, not body)
│   │   └── engine.go           # WasmEdge engine, filter execution, chain runner
│   ├── reload/watcher.go       # fsnotify-based hot reload
│   ├── config/store.go         # JSON config persistence
│   ├── api/server.go           # HTTP management API
│   └── middleware/
│       ├── handler.go          # Request/response handler
│       └── grpc.go             # Dapr gRPC middleware server
├── wasm/filters/
│   ├── jwt/jwt.go              # JWT validator (Header-Only)
│   ├── rewrite/rewrite.go      # Path/host rewriting (Header-Only)
│   └── logger/logger.go        # Access logging (Header-Only)
├── web/                        # React management frontend
├── config.json                 # Filter chain configuration
└── Makefile
```

## Prerequisites

- Go 1.21+
- [WasmEdge](https://wasmedge.org/docs/start/install) (with Go SDK: `go get github.com/second-state/WasmEdge-go`)
- [TinyGo](https://tinygo.org/) (for compiling Wasm filters)
- Node.js 18+ (for React frontend)

## Quick Start

### 1. Build the middleware

```bash
make build
```

### 2. Build the Wasm filters

```bash
make build-wasm
```

### 3. Start the middleware

```bash
make run
```

Or with custom flags:

```bash
./dapr-wasm-middleware.exe -c config.json -w ./wasm -g 50051 -p 8080
```

### 4. Start the management UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Performance Optimization (Large Body Handling)

### Problem
Request bodies >1MB caused 500ms latency due to multiple memory copies:
1. Request body → Go shared buffer (copy 1)
2. Go shared buffer → Wasm linear memory (copy 2)
3. Per-filter body serialization in JSON (copy 3+)

### Solution

| Strategy | Description |
|----------|-------------|
| **Direct Write** | Body written directly from `req.Body` → Wasm linear memory via `SetData`. No intermediate Go buffer. |
| **Header-Only Fast Path** | `NeedBodyNo` filters (JWT, Logger, Rewrite) never trigger body copy. |
| **Streaming** | Bodies >1MB processed in 256KB chunks, each chunk written directly to Wasm memory. |
| **Body Offset Passing** | Body offset/length passed as integer params to Wasm, not serialized in JSON meta. |
| **ScratchBuffer Pool** | `sync.Pool`-backed buffers used only for small metadata, not body transport. |

### Memory Layout in Wasm Linear Memory

```
+0       : Meta JSON (headers, config, up to 64KB)
+64KB    : Body data (written directly, no Go-side copy)
```

## Writing Custom Wasm Filters

Filters are TinyGo programs exporting two functions:

```go
//export on_request
func on_request(metaPtr int32, metaLen int32, bodyPtr int32, bodyLen int32) int32

//export on_request_chunk
func on_request_chunk(metaPtr int32, metaLen int32, bodyPtr int32, bodyLen int32) int32
```

**Arguments:**
- `metaPtr`/`metaLen`: Request metadata (JSON)
- `bodyPtr`/`bodyLen`: Body data in Wasm linear memory

**Return:** Pointer to `FilterResult` JSON in Wasm linear memory, or 0 for pass-through.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/filters` | List all filters |
| POST | `/api/filters` | Add new filter |
| GET | `/api/filters/{name}` | Get filter by name |
| PUT | `/api/filters/{name}` | Update filter |
| DELETE | `/api/filters/{name}` | Delete filter |
| POST | `/api/filters/{name}/enable` | Enable filter |
| POST | `/api/filters/{name}/disable` | Disable filter |
| GET | `/api/chain` | Get active filter chain |
| POST | `/api/chain/reorder` | Reorder chain (body: `{"names": [...]}`) |
| POST | `/api/chain/reload/{name}` | Manually reload a Wasm module |

## Hot Reload

The file watcher monitors the `--wasm-dir` directory. When a `.wasm` file changes:

1. New WasmEdge VM is created and validated
2. Old VM is released after new one is ready
3. In-flight requests use old VM; new requests use new VM
4. Zero downtime, no sidecar restart needed

## License

MIT
