@echo off
chcp 65001 >nul
echo ============================================
echo   离线地图应用 - 构建脚本 (Windows)
echo ============================================
echo.

echo [1/2] 正在编译 Rust 原生库...
cd native
cargo build --release
if %errorlevel% neq 0 (
    echo Rust 编译失败!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] 复制动态链接库到项目根目录...
copy /Y native\target\release\offline_map_engine.dll .\ >nul
if %errorlevel% neq 0 (
    echo 复制 DLL 失败!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   构建完成!
echo   DLL 位置: offline_map_engine.dll
echo ============================================
echo.
pause
