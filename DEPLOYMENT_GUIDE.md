# NxScraper Engine - GCP Deployment Guide

## 🚀 Quick Deployment to GCP

### Prerequisites

1. **GCP Setup**:
   ```bash
   # Install gcloud CLI (if not already installed)
   # https://cloud.google.com/sdk/docs/install
   
   # Login to GCP
   gcloud auth login
   
   # Set your project
   gcloud config set project YOUR_PROJECT_ID
   
   # Enable required APIs
   gcloud services enable containerregistry.googleapis.com
   gcloud services enable run.googleapis.com
   ```

2. **Local Setup**:
   - Docker installed and running
   - Node.js 18+ installed
   - At least 8GB free disk space

---

## 📦 Building Clean Images

### Option 1: Using the Deployment Script (RECOMMENDED)

```bash
# Set your GCP project ID
export GCP_PROJECT_ID="your-project-id"

# Make script executable
chmod +x deploy-gcp.sh

# Run deployment
./deploy-gcp.sh
```

This script will:
- ✅ Clean all caches and build artifacts
- ✅ Rebuild the application from scratch
- ✅ Build Docker images with `--no-cache`
- ✅ Push images to Google Container Registry

### Option 2: Manual Steps

```bash
# 1. Clean everything
rm -rf node_modules packages/*/node_modules
rm -rf packages/*/dist packages/*/build
docker system prune -af --volumes

# 2. Fresh build
npm install
npm run build

# 3. Build Docker images (no cache)
docker build --no-cache \
  -f packages/core/Dockerfile \
  -t gcr.io/YOUR_PROJECT_ID/nxscraper-api:latest \
  --target production \
  .

docker build --no-cache \
  -f packages/core/Dockerfile \
  -t gcr.io/YOUR_PROJECT_ID/nxscraper-worker:latest \
  --target worker \
  .

# 4. Push to GCR
gcloud auth configure-docker
docker push gcr.io/YOUR_PROJECT_ID/nxscraper-api:latest
docker push gcr.io/YOUR_PROJECT_ID/nxscraper-worker:latest
```

---

## ☁️ Deploying to Cloud Run (Recommended for API)

```bash
# Deploy API
gcloud run deploy nxscraper-api \
  --image gcr.io/YOUR_PROJECT_ID/nxscraper-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300

# Deploy Worker (if using Cloud Run)
gcloud run deploy nxscraper-worker \
  --image gcr.io/YOUR_PROJECT_ID/nxscraper-worker:latest \
  --platform managed \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,WORKER_CONCURRENCY=5" \
  --min-instances=1 \
  --max-instances=5 \
  --memory=4Gi \
  --cpu=2
```

---

## 🎛️ Environment Variables

Create a `.env.production` file:

```bash
# Application
NODE_ENV=production
PORT=8080

# Database (if using Cloud SQL)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis/Dragonfly (Cloud Memorystore)
REDIS_HOST=your-redis-host
REDIS_PORT=6379

# Queue
REDIS_QUEUE_HOST=your-queue-host
REDIS_QUEUE_PORT=6379

# API Keys
OPENAI_API_KEY=sk-...
GOOGLE_PLACES_API_KEY=...

# Monitoring
PROMETHEUS_ENABLED=true
```

---

## 🔍 Verification Steps

### 1. Check Images Built
```bash
docker images | grep nxscraper
```

### 2. Test Locally (Optional)
```bash
# Run API locally
docker run -p 8080:8080 --env-file .env.production \
  gcr.io/YOUR_PROJECT_ID/nxscraper-api:latest

# Test endpoint
curl http://localhost:8080/health
```

### 3. Verify GCR Push
```bash
gcloud container images list --repository=gcr.io/YOUR_PROJECT_ID
```

### 4. Check Cloud Run Deployment
```bash
gcloud run services list
```

---

## 📊 Monitoring

### View Logs
```bash
# API logs
gcloud run services logs tail nxscraper-api --region=us-central1

# Worker logs
gcloud run services logs tail nxscraper-worker --region=us-central1
```

### Metrics Endpoint
```
https://your-api-url.run.app/metrics
```

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear everything and retry
docker system prune -af --volumes
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Image Too Large
```bash
# Check image size
docker images | grep nxscraper

# If > 2GB, review Dockerfile for optimization
```

### Permission Denied
```bash
# Re-authenticate
gcloud auth login
gcloud auth configure-docker
```

### Worker Not Processing Jobs
- Check Redis/Dragonfly connection
- Verify environment variables
- Check worker logs for errors

---

## 🔄 Updating Deployment

```bash
# 1. Build new images
export IMAGE_TAG="v$(date +%Y%m%d-%H%M%S)"
./deploy-gcp.sh

# 2. Update Cloud Run
gcloud run services update nxscraper-api \
  --image gcr.io/YOUR_PROJECT_ID/nxscraper-api:$IMAGE_TAG \
  --region us-central1

gcloud run services update nxscraper-worker \
  --image gcr.io/YOUR_PROJECT_ID/nxscraper-worker:$IMAGE_TAG \
  --region us-central1
```

---

## 💰 Cost Optimization

- Use Cloud Run with min-instances=0 for auto-scaling to zero
- Use shared VPC for Redis/PostgreSQL
- Enable Cloud CDN for static assets
- Use committed use discounts for sustained workloads

---

## 🎯 Production Checklist

Before going live:

- [ ] Images built with `--no-cache`
- [ ] All dependencies installed fresh
- [ ] TypeScript compiled with no errors
- [ ] Environment variables configured
- [ ] Health check endpoint working
- [ ] Metrics endpoint accessible
- [ ] Database migrations run
- [ ] Secrets stored in Secret Manager
- [ ] Auto-scaling configured
- [ ] Monitoring alerts set up
- [ ] Rollback plan documented

---

## 📞 Support

For issues, check:
1. Cloud Run logs
2. Container Registry for image status
3. Prometheus metrics at `/metrics`
4. Application health at `/health`
