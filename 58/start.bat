@echo off
chcp 65001 >nul
echo ============================================================
echo 多模态情感交互系统 - 情感记忆版
echo ============================================================
echo 功能特性:
echo   - MediaPipe 实时面部表情捕捉 (7种表情)
echo   - 流式分片录音 (每5秒自动分片上传)
echo   - Whisper 实时语音转写 (支持长语音)
echo   - 多模态情感融合 (面部+语音)
echo   - 情感记忆模块 (最近10次交互历史)
echo   - 安慰模式 (连续3次消极自动激活)
echo   - 智能对话回复 + TTS语音播报
echo ============================================================
echo.

echo [1/3] 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo.
echo [2/3] 安装依赖包...
pip install -r requirements.txt
if errorlevel 1 (
    echo 警告: 依赖安装可能存在问题，请手动检查
)

echo.
echo [3/3] 启动服务器...
echo.
echo 服务器启动后，请在浏览器中访问: http://localhost:5000
echo 首次启动会自动下载AI模型，请耐心等待...
echo 按 Ctrl+C 停止服务器
echo.
python app.py

pause
