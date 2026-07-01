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

REM Track whether we need to rebuild after a fresh install
set NEEDS_BUILD=0

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
    REM Fresh install means any existing build artifacts are stale — force rebuild
    set NEEDS_BUILD=1
)

REM Build if no production build exists, or if we just reinstalled dependencies.
REM .next\BUILD_ID is only created by "npm run build" (not npm run dev),
REM so this correctly detects a missing or stale production build.
if not exist ".next\BUILD_ID" set NEEDS_BUILD=1

if "%NEEDS_BUILD%"=="1" (
    echo  Building dashboard ^(this takes ~1 minute, first time only^)...
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

REM Open browser after 8-second delay (gives Next.js time to fully start)
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

REM Start the production server (keeps window open)
npm start

echo.
echo  Dashboard stopped.
pause
