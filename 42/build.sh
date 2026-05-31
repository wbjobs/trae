#!/bin/bash

echo "Building FileSync Go engine..."

cd "$(dirname "$0")/syncengine"

if [ ! -f "go.mod" ]; then
    echo "Error: go.mod not found in syncengine directory"
    exit 1
fi

echo "Downloading dependencies..."
go mod download

if [ $? -ne 0 ]; then
    echo "Error: Failed to download dependencies"
    exit 1
fi

echo "Building syncengine..."
GOOS=linux go build -o syncengine-linux .
GOOS=darwin go build -o syncengine-macos .
GOOS=windows go build -o syncengine.exe .

if [ $? -ne 0 ]; then
    echo "Error: Build failed"
    exit 1
fi

echo ""
echo "Build successful!"
echo "Output:"
echo "  - syncengine/syncengine-linux (Linux)"
echo "  - syncengine/syncengine-macos (macOS)"
echo "  - syncengine/syncengine.exe (Windows)"
echo ""
echo "Next steps:"
echo "1. Install Python dependencies: pip install -r pyconfig/requirements.txt"
echo "2. Configure your sync tasks in config/sync.yaml"
echo "3. Run: python pyconfig/synccli.py list"
