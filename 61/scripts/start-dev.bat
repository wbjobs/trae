@echo off
echo ========================================
echo 工业物联网平台 - 开发环境启动脚本
echo ========================================

echo [1/5] 启动 MySQL 容器...
docker start iot-mysql 2>nul || docker run -d --name iot-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=123456 -e MYSQL_DATABASE=iot_platform mysql:8.0

echo [2/5] 启动 Redis 容器...
docker start iot-redis 2>nul || docker run -d --name iot-redis -p 6379:6379 redis:7-alpine

echo [3/5] 启动 InfluxDB 容器...
docker start iot-influxdb 2>nul || docker run -d --name iot-influxdb -p 8086:8086 -e DOCKER_INFLUXDB_INIT_MODE=setup -e DOCKER_INFLUXDB_INIT_USERNAME=admin -e DOCKER_INFLUXDB_INIT_PASSWORD=admin123 -e DOCKER_INFLUXDB_INIT_ORG=iot-org -e DOCKER_INFLUXDB_INIT_BUCKET=iot-data -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=iot-token influxdb:2.7-alpine

echo [4/5] 等待服务启动...
timeout /t 10 /nobreak >nul

echo [5/5] 启动后端和前端服务...
echo 请在新的终端窗口中分别执行以下命令：
echo.
echo 启动后端：
echo   cd backend && npm run dev
echo.
echo 启动主应用：
echo   cd frontend/main-app && npm run dev
echo.
echo 启动设备看板子应用：
echo   cd frontend/dashboard && npm run dev
echo.
echo 启动日志溯源子应用：
echo   cd frontend/logtrace && npm run dev
echo.
echo 启动权限分发给用：
echo   cd frontend/auth && npm run dev
echo.
echo ========================================
echo 服务启动完成后，请访问：
echo 主应用: http://localhost:8000
echo 后端API: http://localhost:3000/api/health
echo TCP服务: localhost:8888
echo WebSocket: ws://localhost:3001
echo ========================================
pause
