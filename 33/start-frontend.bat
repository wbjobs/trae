@echo off
echo ========================================
echo H.265 Video Filter Processor - Frontend
echo ========================================
echo.

cd frontend

echo Starting HTTP server on http://localhost:8080
echo.
echo Open your browser and navigate to: http://localhost:8080
echo.

python -m http.server 8080

pause
