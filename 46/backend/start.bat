@echo off
echo ========================================
echo 多模态文档解析工具 - 后端启动脚本
echo ========================================

cd /d "%~dp0"

echo [1/3] 检查虚拟环境...
if not exist "venv" (
    echo 虚拟环境不存在，正在创建...
    python -m venv venv
)

echo [2/3] 激活虚拟环境并安装依赖...
call venv\Scripts\activate
pip install -r requirements.txt

echo [3/3] 启动 FastAPI 服务...
echo 服务地址: http://localhost:8000
echo API 文档: http://localhost:8000/docs
echo.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
