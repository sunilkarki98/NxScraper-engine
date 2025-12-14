#!/bin/bash
# ============================================================================
# NxScraper Engine - Docker Shutdown Script
# ============================================================================
# This script stops all NxScraper engine services

set -e

echo "🛑 Stopping NxScraper Engine..."
echo ""

# Stop services
docker compose down

echo ""
echo "✅ All services stopped successfully!"
echo ""
echo "📝 To start again, run: ./start-engine.sh"
echo ""
