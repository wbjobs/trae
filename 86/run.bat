@echo off
chcp 65001 >nul
echo ========================================
echo 工业组态参数调校客户端 - Windows 启动脚本
echo ========================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo [信息] 检查依赖...
python -m pip show PySide6 >nul 2>nul
if %errorlevel% neq 0 (
    echo [信息] 正在安装依赖...
    python -m pip install -r requirements.txt
)

echo [信息] 启动应用程序...
python main.py

if %errorlevel% neq 0 (
    echo.
    echo [错误] 程序异常退出
    pause
)
