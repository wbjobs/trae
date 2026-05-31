@echo off
REM Build script for FileSync on Windows

echo Building FileSync Go engine...

cd /d "%~dp0syncengine"

if not exist "go.mod" (
    echo Error: go.mod not found in syncengine directory
    exit /b 1
)

echo Downloading dependencies...
go mod download

if %ERRORLEVEL% neq 0 (
    echo Error: Failed to download dependencies
    exit /b 1
)

echo Building syncengine...
go build -o syncengine.exe .

if %ERRORLEVEL% neq 0 (
    echo Error: Build failed
    exit /b 1
)

echo.
echo Build successful!
echo Output: syncengine\syncengine.exe
echo.
echo Next steps:
echo 1. Install Python dependencies: pip install -r pyconfig\requirements.txt
echo 2. Configure your sync tasks in config\sync.yaml
echo 3. Run: python pyconfig\synccli.py list
