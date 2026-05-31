@echo off
echo ========================================
echo 多模态搜索系统 - 启动脚本
echo ========================================
echo.

echo [1/3] 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo.
echo [2/3] 安装依赖...
pip install -r requirements.txt
if errorlevel 1 (
    echo 警告: 依赖安装可能未完全成功，请手动检查
)

echo.
echo [3/3] 启动服务...
echo.
echo 服务启动后，请在浏览器访问: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

python -m backend.app.main
