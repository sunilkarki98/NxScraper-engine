#!/bin/bash

# NxScraper Engine - GCP Deployment Script
# This script builds clean Docker images and pushes them to Google Container Registry

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 NxScraper Engine - GCP Deployment${NC}"
echo "================================================"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
REGION="${GCP_REGION:-us-central1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Image Tag: $IMAGE_TAG"
echo ""

# Step 1: Clean everything
echo -e "${YELLOW}🧹 Step 1: Cleaning local environment...${NC}"
echo "  - Removing node_modules..."
rm -rf node_modules packages/*/node_modules

echo "  - Removing build artifacts..."
rm -rf packages/*/dist packages/*/build

echo "  - Removing Docker cache..."
docker system prune -af --volumes

echo -e "${GREEN}  ✓ Clean complete${NC}"
echo ""

# Step 2: Build the application
echo -e "${YELLOW}🔨 Step 2: Building application...${NC}"
npm install
npm run build

echo -e "${GREEN}  ✓ Build complete${NC}"
echo ""

# Step 3: Build Docker images (no cache)
echo -e "${YELLOW}🐳 Step 3: Building Docker images (no cache)...${NC}"

# API Image
echo "  Building API image..."
docker build --no-cache \
  -f packages/core/Dockerfile \
  -t gcr.io/${PROJECT_ID}/nxscraper-api:${IMAGE_TAG} \
  --target production \
  .

# Worker Image
echo "  Building Worker image..."
docker build --no-cache \
  -f packages/core/Dockerfile \
  -t gcr.io/${PROJECT_ID}/nxscraper-worker:${IMAGE_TAG} \
  --target worker \
  .

echo -e "${GREEN}  ✓ Docker images built${NC}"
echo ""

# Step 4: Tag images
echo -e "${YELLOW}🏷️  Step 4: Tagging images...${NC}"
docker tag gcr.io/${PROJECT_ID}/nxscraper-api:${IMAGE_TAG} gcr.io/${PROJECT_ID}/nxscraper-api:latest
docker tag gcr.io/${PROJECT_ID}/nxscraper-worker:${IMAGE_TAG} gcr.io/${PROJECT_ID}/nxscraper-worker:latest

echo -e "${GREEN}  ✓ Images tagged${NC}"
echo ""

# Step 5: Push to Google Container Registry
echo -e "${YELLOW}☁️  Step 5: Pushing to Google Container Registry...${NC}"
echo "  Authenticating with GCR..."
gcloud auth configure-docker

echo "  Pushing API image..."
docker push gcr.io/${PROJECT_ID}/nxscraper-api:${IMAGE_TAG}
docker push gcr.io/${PROJECT_ID}/nxscraper-api:latest

echo "  Pushing Worker image..."
docker push gcr.io/${PROJECT_ID}/nxscraper-worker:${IMAGE_TAG}
docker push gcr.io/${PROJECT_ID}/nxscraper-worker:latest

echo -e "${GREEN}  ✓ Images pushed to GCR${NC}"
echo ""

# Summary
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "================================================"
echo ""
echo "📦 Images available at:"
echo "  API:    gcr.io/${PROJECT_ID}/nxscraper-api:${IMAGE_TAG}"
echo "  Worker: gcr.io/${PROJECT_ID}/nxscraper-worker:${IMAGE_TAG}"
echo ""
echo "🚀 Next steps:"
echo "  1. Deploy to Cloud Run or GKE"
echo "  2. Set environment variables"
echo "  3. Monitor logs and metrics"
echo ""
