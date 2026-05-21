#!/bin/bash

echo "🚀 Smart Cafe Management System - Setup Script"
echo "=============================================="
echo ""

# Check Docker
echo "✓ Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "✗ Docker not found. Please install Docker Desktop."
    exit 1
fi

echo "✓ Docker is installed: $(docker --version)"
echo ""

# Check Docker Compose
echo "✓ Checking Docker Compose..."
if ! command -v docker compose &> /dev/null; then
    echo "✗ Docker Compose not found."
    exit 1
fi

echo "✓ Docker Compose is installed: $(docker compose version)"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "✗ .env file not found!"
    exit 1
fi

echo "✓ .env file found"
echo ""

# Build and start
echo "🔨 Building and starting containers..."
docker compose up --build

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Access your application at:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo "   Health:    http://localhost:8000/health"
