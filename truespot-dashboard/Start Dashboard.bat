@echo off
title TrueSpot Dashboard
color 0A

cd /d "%~dp0"

echo.
echo  ============================================
echo   TrueSpot Dashboard
echo  ============================================
echo.

REM Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo  Installing dependencies ^(first time only^)...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
    echo.
)

REM Build the app if .next folder is missing
if not exist ".next\" (
    echo  Building dashboard ^(first time only, this takes ~1 minute^)...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo  ERROR: Build failed. Check the output above for details.
        pause
        exit /b 1
    )
    echo.
)

echo  Starting TrueSpot Dashboard...
echo.
echo  The dashboard will open in your browser in a few seconds.
echo  Keep this window open while using the dashboard.
echo  To stop the dashboard, close this window.
echo.
echo  URL: http://localhost:3000
echo.

REM Open browser after 4-second delay (gives server time to start)
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

REM Start the server (this keeps the window open)
npm start

echo.
echo  Dashboard stopped.
pause
