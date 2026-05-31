@echo off
echo ========================================
echo  H3 Geospatial Clustering - Backend
echo ========================================
echo.

echo [1/3] Checking Python environment...
python --version
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.8+.
    pause
    exit /b 1
)

echo.
echo [2/3] Installing dependencies...
pip install -r requirements.txt

echo.
echo [3/3] Starting FastAPI server...
echo API will be available at: http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server.
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
