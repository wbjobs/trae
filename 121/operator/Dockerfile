FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git mysql-client

WORKDIR /workspace
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /manager ./cmd/main.go

FROM alpine:3.19

RUN apk add --no-cache mysql-client ca-certificates

WORKDIR /
COPY --from=builder /manager .

RUN mkdir -p /tmp/backups

USER 65532:65532

ENTRYPOINT ["/manager"]
