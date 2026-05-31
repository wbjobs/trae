FROM golang:1.21-alpine AS builder

RUN apk add --no-cache clang llvm linux-headers git make

WORKDIR /src
COPY backend/ .
RUN go mod download
RUN go generate ./internal/ebpf/...
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /ebpf-observer ./cmd/observer

FROM alpine:3.19

RUN apk add --no-cache ca-certificates libssl3 libcrypto3
COPY --from=builder /ebpf-observer /usr/local/bin/ebpf-observer

EXPOSE 8080

ENTRYPOINT ["ebpf-observer"]
CMD ["--simulate"]
