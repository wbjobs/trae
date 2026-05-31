#!/bin/bash
echo "============================================"
echo "  离线地图应用 - 构建脚本 (Linux/macOS)"
echo "============================================"
echo ""

echo "[1/2] 正在编译 Rust 原生库..."
cd native
cargo build --release
if [ $? -ne 0 ]; then
    echo "Rust 编译失败!"
    exit 1
fi
cd ..

echo ""
echo "[2/2] 复制动态链接库到项目根目录..."

if [ "$(uname)" == "Darwin" ]; then
    cp -f native/target/release/liboffline_map_engine.dylib ./
    echo "dylib 已复制"
else
    cp -f native/target/release/liboffline_map_engine.so ./
    echo "so 已复制"
fi

echo ""
echo "============================================"
echo "  构建完成!"
echo "============================================"
