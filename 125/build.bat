@echo off
REM ============================================
REM  Terrain Destruction System - Build Script
REM ============================================

echo Building terrain destruction extension...
echo.

REM Detect platform
set PLATFORM=windows

REM Check for debug flag
set TARGET=release
if "%1"=="debug" set TARGET=debug
if "%1"=="--debug" set TARGET=debug

echo Platform: %PLATFORM%
echo Target: %TARGET%
echo.

REM Build with scons
scons platform=%PLATFORM% target=%TARGET%

if errorlevel 1 (
    echo.
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Build complete! Output in bin/ directory
pause
