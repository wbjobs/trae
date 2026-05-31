@echo off
echo ========================================
echo   实时股票异常监控系统 - 高性能预测版
echo   支持 5000 ticks/秒 + LSTM 预测
echo ========================================
echo.

echo [0/6] 检查 Python 依赖...
pip install -r requirements.txt
if errorlevel 1 (
    echo 依赖安装失败，请检查 pip 配置
    pause
    exit /b 1
)
echo 依赖检查完成
echo.

echo [1/6] 创建 Kafka 主题 (8 分区)...
python create_topics.py
if errorlevel 1 (
    echo 主题创建失败，请确保 Kafka 已启动
    pause
    exit /b 1
)
echo.

echo [2/6] 启动 Kafka 数据生产者 (5000/s)...
start "Kafka Producer" cmd /k python producer.py
timeout /t 3 /nobreak >nul

echo [3/6] 启动异常检测引擎 (4 工作线程)...
start "Anomaly Detector" cmd /k python detector.py
timeout /t 3 /nobreak >nul

echo [4/6] 启动 LSTM 预测服务...
start "Prediction Service" cmd /k python prediction_service.py
timeout /t 3 /nobreak >nul

echo [5/6] 启动 WebSocket 服务器...
start "WebSocket Server" cmd /k python websocket_server.py

echo.
echo ========================================
echo   所有服务已启动！
echo ========================================
echo.
echo 请在浏览器中打开: index.html
echo.
echo 服务端口:
echo   - 异常 WebSocket: ws://localhost:8765
echo   - 预测 WebSocket: ws://localhost:8766
echo.
echo 功能说明:
echo   - 实时检测: 闪崩、频繁撤单、大单砸盘
echo   - LSTM 预测: 基于过去 1 分钟预测未来 10 秒闪崩概率
echo   - 前端展示: 概率曲线 + 风险雷达 + 高风险预警
echo.
echo 提示: 请确保 Kafka 服务器已在 localhost:9092 运行
echo       如需停止，请关闭各个命令行窗口
echo.
pause
