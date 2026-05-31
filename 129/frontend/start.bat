@echo off
echo ========================================
echo  H3 Geospatial Clustering - Frontend
echo ========================================
echo.

echo [1/2] Checking Node.js environment...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 16+.
    pause
    exit /b 1
)

echo.
echo [2/2] Installing dependencies and starting dev server...
echo Frontend will be available at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server.
echo.

npm install
npm run dev

pause
