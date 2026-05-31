FROM golang:1.21-alpine AS builder

WORKDIR /workspace
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -o agent cmd/main.go

FROM alpine:3.19
WORKDIR /
COPY --from=builder /workspace/agent .
RUN adduser -D -u 1001 nonroot
USER nonroot

EXPOSE 8080

ENTRYPOINT ["/agent"]
