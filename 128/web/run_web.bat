@echo off
echo ========================================
echo Fall Detection Web Dashboard
echo ========================================

cd /d "%~dp0"

echo Installing dependencies...
pip install -r ../requirements.txt

echo Starting web server...
python app.py

pause
