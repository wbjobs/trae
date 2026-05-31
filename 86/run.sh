#!/bin/bash
# 工业组态参数调校客户端 - Linux 启动脚本

echo "========================================"
echo "工业组态参数调校客户端 - Linux 启动脚本"
echo "========================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python3，请先安装 Python 3.8+"
    exit 1
fi

echo "[信息] 检查依赖..."
if ! python3 -c "import PySide6" &> /dev/null; then
    echo "[信息] 正在安装依赖..."
    python3 -m pip install -r requirements.txt
fi

echo "[信息] 启动应用程序..."
python3 main.py
