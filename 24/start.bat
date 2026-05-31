@echo off
echo ========================================
echo  Cypher to PostgreSQL Translator
echo ========================================
echo.
echo [1/2] Starting backend server on port 8000...
start "Backend" cmd /k "cd backend && pip install -r requirements.txt && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul
echo.
echo [2/2] Starting frontend server on port 3000...
start "Frontend" cmd /k "cd frontend && npm install && npm run dev"
echo.
echo ========================================
echo  Services starting...
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:3000
echo  API Docs: http://localhost:8000/docs
echo ========================================
pause
