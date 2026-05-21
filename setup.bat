@echo off
echo 🚀 Smart Cafe Management System - Setup Script
echo ==============================================
echo.

REM Check Docker
echo Checking Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ✗ Docker not found. Please install Docker Desktop.
    pause
    exit /b 1
)
echo ✓ Docker is installed

REM Check Docker Compose
echo Checking Docker Compose...
docker compose version >nul 2>&1
if errorlevel 1 (
    echo ✗ Docker Compose not found.
    pause
    exit /b 1
)
echo ✓ Docker Compose is installed
echo.

REM Check if .env exists
if not exist ".env" (
    echo ✗ .env file not found!
    pause
    exit /b 1
)
echo ✓ .env file found
echo.

REM Build and start
echo Building and starting containers...
docker compose up --build

echo.
echo ✅ Setup complete!
echo.
echo 🌐 Access your application at:
echo    Frontend:  http://localhost:3000
echo    Backend:   http://localhost:8000
echo    API Docs:  http://localhost:8000/docs
echo    Health:    http://localhost:8000/health
pause
