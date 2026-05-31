@echo off
echo ========================================
echo 多模态文档解析工具 - 前端启动脚本
echo ========================================

cd /d "%~dp0"

echo [1/2] 检查并安装依赖...
if not exist "node_modules" (
    echo 依赖不存在，正在安装...
    npm install
)

echo [2/2] 启动开发服务器...
echo 前端地址: http://localhost:5173
echo.
npm run dev

pause
