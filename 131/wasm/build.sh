#!/bin/bash
set -e

echo "Building Gray Routing Wasm plugin..."

cd "$(dirname "$0")"

if ! command -v cargo &> /dev/null; then
    echo "Error: cargo is not installed"
    exit 1
fi

if ! rustup target list | grep -q "wasm32-unknown-unknown"; then
    echo "Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

cargo build --release --target wasm32-unknown-unknown

TARGET_DIR="../apisix/wasm"
mkdir -p "$TARGET_DIR"

cp target/wasm32-unknown-unknown/release/gray_routing_wasm.wasm "$TARGET_DIR/"

echo "Build complete! Output: $TARGET_DIR/gray_routing_wasm.wasm"
ls -lh "$TARGET_DIR/gray_routing_wasm.wasm"
