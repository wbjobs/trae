@echo off
echo ========================================
echo Celery Worker - 启动脚本
echo ========================================
echo.

echo 检查Redis服务...
redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo 警告: 未检测到Redis服务运行
    echo 请确保Redis已启动并监听端口 6379
    echo.
)

echo 确保USE_CELERY=true 在.env文件中
echo.

echo [1/2] 启动Celery Worker...
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

celery -A celery_app worker --loglevel=info --pool=solo
