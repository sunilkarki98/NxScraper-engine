#!/bin/bash
set -e

# NxScraper Engine - Deployment Script for GCP/Linux
# Usage: ./deploy.sh [build]

BUILD_FLAG=""
if [ "$1" == "build" ]; then
    BUILD_FLAG="--build"
fi

echo "🚀 Starting NxScraper Deployment..."

# 1. Check Pre-requisites
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# 2. Setup Environment
if [ ! -f .env ]; then
    echo "⚠️ .env file missing! Copying .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env with your real configuration and re-run."
    exit 1
fi

# 3. Create Network (if manual, but docker-compose handles it)
# We used explicit name 'nxscraper_net' in docker-compose.yml

# 4. Deploy Main Services (API, Worker, DBs)
echo "🏗️  Deploying Main Services..."
docker compose up -d $BUILD_FLAG

# 5. Deploy Monitoring Stack (Prometheus, Grafana)
echo "📊 Deploying Monitoring Stack..."
cd monitoring
docker compose up -d
cd ..

# 6. Post-Deployment Checks
echo "✅ Deployment sequence complete."
echo "-----------------------------------"
echo "🌐 API Gateway:  http://localhost:3000 (Load Balancer Port)"
echo "📈 Grafana:      http://localhost:3001 (Default user/pass: admin/admin)"
echo "-----------------------------------"
echo "To view logs:    docker compose logs -f"
echo "To stop:         docker compose down"
