#!/bin/bash
# ============================================================================
# NxScraper Engine - Docker Startup Script
# ============================================================================
# This script starts the NxScraper engine and all related services in Docker

set -e

echo "🚀 Starting NxScraper Engine in Docker..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "📝 Copying .env.example to .env..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add your API keys before continuing!"
    echo "   At minimum, add at least one LLM provider key (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)"
    echo ""
    read -p "Press Enter after you've configured .env, or Ctrl+C to exit..."
fi

# Start services
echo "🐳 Starting Docker services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ NxScraper Engine is now running!"
echo ""
echo "📍 Service URLs:"
echo "   • Engine API:    http://localhost:3000"
echo "   • Prometheus:    http://localhost:9091"
echo "   • Grafana:       http://localhost:3002 (admin/admin)"
echo "   • DragonflyDB:   localhost:6379"
echo ""
echo "📝 Useful commands:"
echo "   • View logs:     docker compose logs -f core-engine"
echo "   • Stop services: ./stop-engine.sh or docker compose down"
echo "   • Restart:       docker compose restart core-engine"
echo ""
echo "🔍 Health check:"
curl -s http://localhost:3000/health || echo "   ⚠️  Engine not responding yet, give it a few seconds..."
echo ""
