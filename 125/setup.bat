@echo off
REM ============================================
REM  Terrain Destruction System - Setup Script
REM ============================================

echo ============================================
echo  Terrain Destruction System Setup
echo ============================================
echo.

REM Check if godot-cpp exists
if exist "godot-cpp\" (
    echo [OK] godot-cpp directory found
) else (
    echo [INFO] Cloning godot-cpp repository...
    git clone -b 4.2 https://github.com/godotengine/godot-cpp.git godot-cpp
    if errorlevel 1 (
        echo [ERROR] Failed to clone godot-cpp
        echo Please ensure git is installed and try again.
        pause
        exit /b 1
    )
)

REM Build godot-cpp
echo.
echo [INFO] Building godot-cpp bindings...
cd godot-cpp
scons platform=windows target=release
if errorlevel 1 (
    echo [ERROR] Failed to build godot-cpp
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [INFO] Building terrain destruction extension...
scons platform=windows target=release
if errorlevel 1 (
    echo [ERROR] Failed to build extension
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo  You can now open the project in Godot 4.2+
echo.
pause
