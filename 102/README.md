# gRPC Mock Server

A generic, configurable gRPC mock server in Go. Given any `.proto` file(s),
it dynamically registers the described services, serves them via gRPC (with
`grpc.reflection.v1` enabled), exposes an HTTP gateway at
`POST /mock/{service}/{method}`, and loads responses from a YAML template
file that can be hot-reloaded without restarting the process.

## Features

- **Proto-driven**: drop `.proto` files into a directory and the server
  registers every service + method automatically using
  `jhump/protoreflect` + `dynamicpb`.
- **YAML responses**: each method has a `response` string that is either a
  JSON literal or a Go `text/template` producing JSON; request fields are
  available via `{{ .Request.<field> }}`.
- **Hot reload**: `mock.yaml` is watched with `fsnotify`; edits take effect
  on the next request without restart.
- **gRPC reflection**: `grpc.reflection.v1` is registered so `grpcurl` and
  any generic client work out of the box.
- **HTTP gateway**: `POST /mock/{service}/{method}` accepts JSON and returns
  JSON through the same mock engine. `GET /mock/_list` lists services.
- **Behavior per method**: `delay_ms`, `error: {code, message}`, and
  `match: {field: value}` are all supported.
- **Record & Replay**: run with `--record --backend <host:port>` to proxy
  all gRPC calls to a real backend, capture request-response pairs, and
  write them as YAML templates for later mock replay.

## Layout

```
cmd/mock-server/main.go         entrypoint
internal/
  config/store.go               YAML parser + concurrency-safe access
  config/watch.go               fsnotify hot-reload
  engine/engine.go              gRPC ServiceDesc builder + invoke core
  engine/http.go                HTTP gateway handler
  proto/registry.go             *.proto parser → protoregistry.Files
  recorder/recorder.go          request-response capture + YAML output
  recorder/proxy.go             gRPC proxy (forward to real backend)
  reflection/register.go        grpc-reflect registration
proto/demo.proto                example proto
mock.yaml                       example mock responses
```

## Build & Run

```bash
go mod tidy
go build -o mock-server ./cmd/mock-server
# Mock mode (default):
./mock-server -proto ./proto -config ./mock.yaml -grpc-addr :50051 -http-addr :8080
```

## Record & Replay

Start the proxy in recording mode, pointing at a real gRPC backend:

```bash
./mock-server --record --backend real-host:50051 \
    -proto ./proto -config ./mock.yaml \
    --record-output ./captured.yaml
```

All gRPC calls received on `:50051` are forwarded to `real-host:50051`,
and the request-response pairs are captured.  Periodic flushes (every
5 seconds by default, configurable via `--flush-interval`) write the
data to YAML.

HTTP endpoints for recording control:

```
GET  /mock/_record/status   # show recording stats
POST /mock/_record/flush    # force flush to disk
```

After stopping the proxy, the captured YAML can be used directly in mock
mode:

```bash
./mock-server -proto ./proto -config ./captured.yaml
```

## YAML Schema

```yaml
services:
  "demo.Greeter":
    methods:
      SayHello:
        response: |
          {"message":"Hello, {{ .Request.name }}!","timestamp":{{ nowUnix }}}
        delay_ms: 10
        # error: { code: INVALID_ARGUMENT, message: "bad" }
        # match: { name: "only-this-name" }
```

Template funcs: `nowUnix`, `now`, `lower`, `upper`.
Template data: `.Service`, `.Method`, `.Request`.

## HTTP Gateway

```
POST /mock/{service}/{method}   # JSON in, JSON out
GET  /mock/_list                # list services + methods
```

`{service}` may be the simple name (`Greeter`) or the fully-qualified
name (`demo.Greeter`).

## gRPC

With server reflection enabled:

```bash
grpcurl -plaintext -d '{"name":"Alice"}' localhost:50051 demo.Greeter/SayHello
```
