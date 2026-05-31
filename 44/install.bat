@echo off
echo ========================================
echo 分子结构可视化工具 - 安装脚本
echo ========================================
echo.

echo [1/2] 正在安装后端依赖...
cd backend
pip install -r requirements.txt
if errorlevel 1 (
    echo 后端依赖安装失败，请检查 Python 环境
    pause
    exit /b 1
)
echo 后端依赖安装完成
echo.

echo [2/2] 正在安装前端依赖...
cd ..\frontend
npm install
if errorlevel 1 (
    echo 前端依赖安装失败，请检查 Node.js 环境
    pause
    exit /b 1
)
echo 前端依赖安装完成
echo.

echo ========================================
echo 安装完成！
echo ========================================
echo.
echo 使用方法：
echo   1. 启动后端：运行 start-backend.bat
echo   2. 启动前端：运行 start-frontend.bat
echo   3. 打开浏览器访问 http://localhost:5173
echo.
pause
