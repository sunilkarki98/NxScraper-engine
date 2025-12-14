# ScrapeX Deployment Guide

Complete guide for deploying ScrapeX to production environments.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Cloud Deployment](#cloud-deployment)
   - [AWS ECS](#aws-ecs)
   - [Google Cloud Run](#google-cloud-run)
   - [DigitalOcean](#digitalocean)
5. [Environment Configuration](#environment-configuration)
6. [SSL & Domain Setup](#ssl--domain-setup)
7. [Monitoring & Logging](#monitoring--logging)
8. [Scaling](#scaling)
9. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required
- **Node.js** 18+ 
- **Redis** 6+
- **Docker** & Docker Compose (for containerized deployment)
- **Domain name** (for production)

### Optional
- PostgreSQL 14+ (for API key persistence)
- Nginx (reverse proxy)
- Let's Encrypt (SSL certificates)

---

## 🏠 Local Development

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/scrapex-engine.git
cd scrapex-engine
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Minimum required variables:**
```bash
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key
```

### 3. Start Services

```bash
# Start Redis
redis-server

# Start development server
cd core-engine
npm run dev
```

### 4. Generate API Key

```bash
npm run generate:api-key
```

### 5. Test

```bash
curl http://localhost:3000/health
```

---

## 🐳 Docker Deployment

### Quick Start

```bash
# Set required environment variables
export POSTGRES_PASSWORD=your_secure_password
export JWT_SECRET=your_jwt_secret

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check health
curl http://localhost:3000/health
```

### Production Configuration

Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  core-engine:
    environment:
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
  
  worker:
    deploy:
      replicas: 5
```

### Build & Deploy

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Scale workers
docker-compose -f docker-compose.prod.yml up -d --scale worker=10
```

---

## ☁️ Cloud Deployment

### AWS ECS

#### 1. Create ECR Repository

```bash
aws ecr create-repository --repository-name scrapex-engine
```

#### 2. Build & Push Image

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t scrapex-engine -f core-engine/Dockerfile.prod core-engine/

# Tag
docker tag scrapex-engine:latest \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/scrapex-engine:latest

# Push
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/scrapex-engine:latest
```

#### 3. Create Task Definition

```json
{
  "family": "scrapex-engine",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "scrapex-api",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/scrapex-engine:latest",
      "portMappings": [{"containerPort": 3000}],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "REDIS_HOST", "value": "your-redis-endpoint"}
      ],
      "secrets": [
        {"name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:..."}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### 4. Create Service

```bash
aws ecs create-service \
  --cluster scrapex-cluster \
  --service-name scrapex-api \
  --task-definition scrapex-engine \
  --desired-count 3 \
  --launch-type FARGATE \
  --load-balancers targetGroupArn=arn:aws:...,containerName=scrapex-api,containerPort=3000
```

---

### Google Cloud Run

#### 1. Build & Push

```bash
# Build
gcloud builds submit --tag gcr.io/PROJECT_ID/scrapex-engine core-engine/

# Or use Docker
docker build -t gcr.io/PROJECT_ID/scrapex-engine -f core-engine/Dockerfile.prod core-engine/
docker push gcr.io/PROJECT_ID/scrapex-engine
```

#### 2. Deploy

```bash
gcloud run deploy scrapex-engine \
  --image gcr.io/PROJECT_ID/scrapex-engine \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,REDIS_HOST=your-redis \
  --set-secrets JWT_SECRET=jwt-secret:latest \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 80
```

---

### DigitalOcean

#### 1. Create App

```yaml
# .do/app.yaml
name: scrapex-engine
region: nyc

services:
  - name: api
    github:
      repo: yourusername/scrapex-engine
      branch: main
      deploy_on_push: true
    dockerfile_path: core-engine/Dockerfile.prod
    instance_count: 3
    instance_size_slug: professional-s
    http_port: 3000
    health_check:
      http_path: /health
    envs:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        scope: RUN_TIME
        type: SECRET

databases:
  - name: redis
    engine: REDIS
    version: "7"
```

#### 2. Deploy

```bash
# Using CLI
doctl apps create --spec .do/app.yaml

# Or use UI at cloud.digitalocean.com
```

---

## 🔐 Environment Configuration

### Production Best Practices

1. **Use Secrets Management**
   - AWS: Secrets Manager or Parameter Store
   - GCP: Secret Manager
   - Azure: Key Vault
   - Kubernetes: Secrets

2. **Environment Files**

Create separate `.env.production`:

```bash
NODE_ENV=production
PORT=3000

# Redis (external service)
REDIS_HOST=your-redis.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_TLS=true

# Database
DATABASE_URL=${DATABASE_URL}

# Security
JWT_SECRET=${JWT_SECRET}
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# AI Providers
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
GOOGLE_API_KEY=${GOOGLE_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# Monitoring
LOG_LEVEL=info
SENTRY_DSN=${SENTRY_DSN}
METRICS_ENABLED=true
```

---

## 🔒 SSL & Domain Setup

### Using Let's Encrypt with Nginx

#### 1. Install Certbot

```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

#### 2. Nginx Configuration

Create `/etc/nginx/sites-available/scrapex`:

```nginx
server {
    listen 80;
    server_name api.scrapex.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.scrapex.com;
    
    ssl_certificate /etc/letsencrypt/live/api.scrapex.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.scrapex.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 3. Get Certificate

```bash
sudo certbot --nginx -d api.scrapex.com
```

#### 4. Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Setup cron (auto-renewal)
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet
```

---

## 📊 Monitoring & Logging

### Prometheus + Grafana

Already included in `docker-compose.prod.yml`:

```bash
# Access Grafana
open http://localhost:3001
# Default: admin / admin (change immediately)

# Access Prometheus
open http://localhost:9090
```

### Application Monitoring

#### Sentry (Error Tracking)

```bash
# Install
npm install @sentry/node

# Configure in .env
SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=production
```

#### Log Aggregation

**Using CloudWatch (AWS):**

```bash
# Install CloudWatch agent
sudo yum install amazon-cloudwatch-agent

# Configure
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:cloudwatch-config.json
```

---

## 📈 Scaling

### Horizontal Scaling

#### Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml scrapex

# Scale service
docker service scale scrapex_core-engine=5
docker service scale scrapex_worker=10
```

#### Kubernetes

See `k8s/` directory for configurations.

### Vertical Scaling

Update resource limits in `docker-compose.prod.yml`:

```yaml
services:
  core-engine:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. High Memory Usage

```bash
# Check memory
docker stats

# Increase Node.js heap
NODE_OPTIONS="--max-old-space-size=4096"
```

#### 2. Redis Connection Errors

```bash
# Test Redis
redis-cli ping

# Check connection
docker-compose logs redis
```

#### 3. Worker Not Processing Jobs

```bash
# Check queue status
curl http://localhost:3000/api/v1/jobs/stats

# View worker logs  
docker-compose logs worker
```

#### 4. SSL Certificate Issues

```bash
# Check certificate
openssl s_client -connect api.scrapex.com:443

# Renew manually
sudo certbot renew
```

### Health Checks

```bash
# Basic health
curl https://api.scrapex.com/health

# Detailed health
curl https://api.scrapex.com/health/detailed

# Metrics
curl https://api.scrapex.com/metrics
```

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [AWS ECS Guide](https://docs.aws.amazon.com/ecs/)
- [Google Cloud Run Docs](https://cloud.google.com/run/docs)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Prometheus Monitoring](https://prometheus.io/docs/)

---

## 🆘 Support

- 📧 Email: support@scrapex.com
- 💬 Discord: [Join Community](#)
- 📚 Docs: [docs.scrapex.com](#)
