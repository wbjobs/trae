@echo off
echo ========================================
echo Fall Detection Edge Service - Build Script
echo ========================================

set MEDIAPIPE_DIR=C:\path\to\mediapipe
set TENSORFLOW_DIR=C:\path\to\tensorflow
set PAHO_MQTT_DIR=C:\path\to\paho-mqtt
set NLOHMANN_JSON_DIR=C:\path\to\nlohmann-json

echo Creating build directory...
if not exist build mkdir build
cd build

echo Running CMake...
cmake -G "Visual Studio 17 2022" -A x64 ^
    -DMEDIAPIPE_DIR=%MEDIAPIPE_DIR% ^
    -DTENSORFLOW_DIR=%TENSORFLOW_DIR% ^
    -DPAHO_MQTT_DIR=%PAHO_MQTT_DIR% ^
    -DNLOHMANN_JSON_DIR=%NLOHMANN_JSON_DIR% ^
    ..

if %ERRORLEVEL% NEQ 0 (
    echo CMake configuration failed!
    exit /b 1
)

echo Building project...
cmake --build . --config Release

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

echo Build completed successfully!
echo Binary located at: build\Release\fall_detection_edge.exe
cd ..
