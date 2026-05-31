#!/bin/bash

echo "Starting Dapr Wasm State Manager..."

cd "$(dirname "$0")/backend"

echo "Installing Go dependencies..."
go mod tidy

echo "Starting backend server..."
exec go run cmd/server/main.go
