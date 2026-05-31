# Edge Function Runtime (wruntime)

A lightweight edge function runtime built with Go, NATS, WebAssembly, and MinIO.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CLI Client  │────▶│ HTTP Server  │────▶│  NATS Queue  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   MinIO     │     │ Wasm Runtime│
                    │  (Storage)  │     │  (wazero)   │
                    └─────────────┘     └─────────────┘
```

## Components

- **HTTP Server**: Accepts function invocations and deployment requests
- **NATS**: Message broker for function invocation
- **MinIO**: Object storage for Wasm function binaries and version management
- **Wasm Runtime**: Uses wazero to execute WebAssembly functions
- **CLI**: Command-line tool for deploying and managing functions

## Prerequisites

- Go 1.21+
- Docker and Docker Compose
- tinygo (for compiling Go to Wasm, optional)

## Quick Start

### 1. Start Infrastructure

```bash
docker-compose up -d
```

This starts NATS and MinIO services.

### 2. Build

```bash
make build
```

### 3. Start the Runtime Server

```bash
./bin/wruntime-server
```

### 4. Build and Deploy an Example Function

```bash
# Build example Wasm function
GOOS=wasip1 GOARCH=wasm go build -o examples/handler.wasm ./examples/handler.go

# Deploy using CLI
./bin/wruntime deploy \
    --name hello \
    --version 1.0.0 \
    --description "Hello World function" \
    --file examples/handler.wasm
```

### 5. Invoke the Function

```bash
# HTTP invocation
curl -X POST http://localhost:8080/invoke/hello \
    -H "Content-Type: application/json" \
    -d '{"name":"test"}'

# CLI invocation
echo '{"name":"test"}' | ./bin/wruntime invoke hello
```

## Usage

### Deploy a Function

```bash
wruntime deploy --name <function-name> --version <version> --file <wasm-file> [--description <desc>]
```

### List Function Versions

```bash
wruntime list <function-name>
```

### Invoke a Function

```bash
echo '<input-data>' | wruntime invoke <function-name> [--version <version>]
```

## HTTP API

### Deploy Function
```
POST /deploy
Content-Type: application/json

{
    "name": "my-function",
    "version": "1.0.0",
    "description": "My function",
    "wasm_file": "<base64-encoded-wasm>",
    "memory_limit": 67108864,
    "timeout_ms": 30000
}
```

### Invoke Function
```
POST /invoke/{function-name}[?version={version}]
Content-Type: application/octet-stream

<request-body>
```

### List Versions
```
GET /functions/{function-name}
```

### Health Check
```
GET /health
```

## Wasm Function Interface

Wasm functions must export the following functions:

- `alloc(size uint32) *byte`: Allocate memory for input/output
- `handler(inputPtr *byte, inputLen uint32) uint64`: Handle the request

The handler function receives a JSON-serialized `FunctionRequest` and should return a JSON-serialized `FunctionResponse`.

### Request Format (JSON)

```json
{
    "function_name": "hello",
    "version": "1.0.0",
    "body": "<base64-encoded-request-body>",
    "headers": {"Content-Type": "application/json"},
    "method": "POST",
    "path": "/invoke/hello",
    "query": {"key": "value"}
}
```

### Response Format (JSON)

```json
{
    "status_code": 200,
    "body": "<response-body>",
    "headers": {"Content-Type": "application/json"},
    "error": ""
}
```

## Configuration

Configuration is loaded from environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `NATS_SUBJECT` | `function.invoke` | NATS subject for invocations |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO server endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `functions` | MinIO bucket name |
| `MINIO_SSL` | `false` | Enable SSL for MinIO |
| `HTTP_PORT` | `8080` | HTTP server port |
| `WASM_CACHE_DIR` | `./.cache/wasm` | Wasm cache directory |

## Development

```bash
# Start dependencies
make docker-up

# Build
make build

# Run server
./bin/wruntime-server

# Build example
make example

# Deploy example
make deploy-example

# Test invocation
make test-invoke
```

## License

MIT
