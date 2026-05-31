@echo off
echo ========================================
echo H.265 Video Filter Processor - Backend
echo ========================================
echo.

cd backend

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo Installing dependencies...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

echo.
echo Starting FastAPI server on http://localhost:8000
echo.
python main.py

pause
