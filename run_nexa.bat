@echo off
echo ============================================================
echo   NEXA Smart Exam Monitoring System — Startup Script
echo ============================================================
echo.
echo [1/2] Checking dependencies...
if not exist "backend\node_modules" (
    echo [!] Backend dependencies missing. Installing...
    cd backend && npm install && cd ..
)

echo [2/2] Starting NEXA Server on http://localhost:8080/
echo.
echo IMPORTANT: Keep this window open while using NEXA.
echo If you close this window, the localhost connection will stop.
echo.
cd backend
npm start
pause
