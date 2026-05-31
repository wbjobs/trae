@echo off
echo ========================================
echo   股票异常检测系统 - 一键启动
echo ========================================
echo.

echo [1/3] 检查Redis连接...
redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo [警告] 未检测到Redis服务，请确保Redis已启动!
    echo       Windows可下载: https://github.com/microsoftarchive/redis/releases
    echo       或使用WSL: sudo service redis-server start
    echo.
) else (
    echo [OK] Redis运行中
    echo.
)

echo [2/3] 启动主服务 + Worker...
python launch.py

pause
