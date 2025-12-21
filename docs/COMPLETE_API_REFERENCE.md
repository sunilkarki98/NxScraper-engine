# 📘 NxScraper Engine - Complete API Reference
## Every Endpoint Documented

**Base URL**: `http://localhost:3000` (or your deployed URL)  
**Authentication**: Bearer token in `Authorization` header or `x-api-key` header  
**Version**: v1

---

## 📑 Table of Contents

1. [Authentication](#authentication)
2. [Public Endpoints (No Auth)](#public-endpoints)
3. [Scraping Endpoints](#scraping-endpoints)
4. [Business Search](#business-search)
5. [AI Modules](#ai-modules)
6. [Agentic Orchestration](#agentic-orchestration)
7. [Job Management](#job-management)
8. [Keys Management](#keys-management)
9. [Proxy Management](#proxy-management)
10. [RAG (Knowledge Base)](#rag-knowledge-base)
11. [Complete Error Reference](#error-reference)

---

## 🔐 Authentication

All protected endpoints require authentication via API key.

### Methods

**Option 1: Bearer Token** (Recommended)
```http
Authorization: Bearer nx_pk_prod_8KmT3hF9LpQx2vN7jRwY5zC4dE6aB1sG
```

**Option 2: Custom Header**
```http
x-api-key: nx_pk_prod_8KmT3hF9LpQx2vN7jRwY5zC4dE6aB1sG
```

### API Key Tiers

| Tier | Rate Limit | Use Case |
|------|-----------|----------|
| **free** | 100 requests/hour | Testing, hobbyists |
| **pro** | 1,000 requests/hour | Production use |
| **enterprise** | 10,000 requests/hour | High-volume |
| **admin** | Unlimited | System administration |

---

## 🌐 PUBLIC ENDPOINTS

### 1. Health Check

**Endpoint**: `GET /health`  
**Auth**: ❌ None  
**Description**: Check if the engine is healthy and operational

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-21T05:00:00.000Z",
  "scrapers": {
    "universal-scraper": true,
    "google-scraper": true,
    "ultra-scraper": true,
    "google-places": true
  },
  "browserPool": {
    "totalBrowsers": 2,
    "activePages": 5,
    "maxBrowsers": 5
  },
  "proxy": {
    "total": 10,
    "healthy": 8,
    "unhealthy": 2
  },
  "cache": {
    "hitRate": 0.85,
    "size": 1024
  }
}
```

**Status Codes**:
- `200`: Healthy
- `503`: Degraded (some scrapers offline)
- `500`: Unhealthy (critical failure)

**Example**:
```bash
curl http://localhost:3000/health
```

---

### 2. Readiness Check (Kubernetes)

**Endpoint**: `GET /ready`  
**Auth**: ❌ None  
**Description**: Check if the service is ready to accept requests (K8s readiness probe)

**Response**:
```json
{
  "ready": true,
  "scrapers": 4
}
```

**Status Codes**:
- `200`: Ready
- `503`: Not ready (no scrapers registered)

**Example**:
```bash
curl http://localhost:3000/ready
```

---

### 3. Prometheus Metrics

**Endpoint**: `GET /metrics`  
**Auth**: ❌ None  
**Description**: Expose Prometheus-compatible metrics

**Response Format**: `text/plain`
```
# HELP scrape_requests_total Total number of scrape requests
# TYPE scrape_requests_total counter
scrape_requests_total{scraper="universal-scraper",status="success"} 1523

# HELP scrape_duration_seconds Scrape duration in seconds
# TYPE scrape_duration_seconds histogram
scrape_duration_seconds_bucket{le="5"} 1200
scrape_duration_seconds_bucket{le="10"} 1480
scrape_duration_seconds_sum 7234.5
scrape_duration_seconds_count 1523

# HELP browser_pool_size Number of browsers in pool
# TYPE browser_pool_size gauge
browser_pool_size 2

# HELP queue_jobs_waiting Jobs waiting in queue
# TYPE queue_jobs_waiting gauge
queue_jobs_waiting{queue="scrape-queue"} 15
```

**Example**:
```bash
curl http://localhost:3000/metrics
```

---

### 4. Stats (JSON)

**Endpoint**: `GET /stats`  
**Auth**: ❌ None  
**Description**: Get system statistics in JSON format

**Response**:
```json
{
  "scrapers": [
    {"name": "universal-scraper", "version": "2.0.0"},
    {"name": "google-scraper", "version": "1.5.0"},
    {"name": "ultra-scraper", "version": "1.0.0"},
    {"name": "google-places", "version": "1.0.0"}
  ],
  "browserPool": {
    "totalBrowsers": 2,
    "activePages": 5,
    "totalPagesCreated": 142,
    "maxBrowsers": 5,
    "browsers": [
      {
        "id": "playwright-1703097600000-abc123",
        "engine": "playwright",
        "pages": 3,
        "totalCreated": 75,
        "ageSeconds": 1800,
        "idleSeconds": 5
      }
    ]
  },
  "proxy": {
    "total": 10,
    "healthy": 8,
    "unhealthy": 2,
    "rotation": "round-robin"
  },
  "cache": {
    "hitRate": 0.85,
    "size": 1024,
    "maxSize": 10000
  }
}
```

**Example**:
```bash
curl http://localhost:3000/stats
```

---

### 5. Sessions by Domain

**Endpoint**: `GET /sessions/:domain`  
**Auth**: ❌ None  
**Description**: Get active sessions for a specific domain

**Path Parameters**:
- `domain`: Domain name (e.g., `amazon.com`)

**Response**:
```json
{
  "domain": "amazon.com",
  "count": 3,
  "sessions": [
    {
      "id": "sess_abc123",
      "isValid": true,
      "expiresAt": "2025-12-22T05:00:00.000Z",
      "lastUsed": "2025-12-21T04:55:00.000Z"
    }
  ]
}
```

**Example**:
```bash
curl http://localhost:3000/sessions/amazon.com
```

---

### 6. API Documentation (Swagger)

**Endpoint**: `GET /api/docs`  
**Auth**: ❌ None  
**Description**: Interactive API documentation (Swagger UI)

**Example**:
```
Open in browser: http://localhost:3000/api/docs
```

---

## 🕷️ SCRAPING ENDPOINTS

Base Path: `/api/v1/scrape`

### 1. Submit Scrape Job

**Endpoint**: `POST /api/v1/scrape`  
**Auth**: ✅ Required  
**Description**: Submit a new scraping job (async)

**Request Body**:
```json
{
  "url": "https://example.com/product",
  "scraperType": "universal-scraper",
  "options": {
    "waitForSelector": "#product-title",
    "proxy": "http://user:pass@proxy.com:8080",
    "features": ["anti-blocking", "screenshot"],
    "timeout": 30000,
    "bypassCache": false
  }
}
```

**Parameters**:
- `url` (required): Target URL to scrape
- `scraperType` (required): Scraper to use
  - `universal-scraper`: Fast, general-purpose
  - `ultra-scraper`: AI-powered with action planning
  - `google-scraper`: Google search results
  - `google-places`: Google Maps/Places
  - `auto`: Auto-detect best scraper
- `options.waitForSelector`: CSS selector to wait for
- `options.proxy`: Custom proxy URL
- `options.features`: Array of features
  - `anti-blocking`: AI-powered bot detection
  - `screenshot`: Capture screenshot
  - `pdf`: Generate PDF
- `options.timeout`: Max wait time (ms)
- `options.bypassCache`: Skip cache

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "job_1703097600000_abc123",
    "statusUrl": "/api/v1/jobs/job_1703097600000_abc123"
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "scraperType": "universal-scraper",
    "options": {
      "waitForSelector": "body",
      "features": ["anti-blocking"]
    }
  }'
```

---

### 2. List Available Scrapers

**Endpoint**: `GET /api/v1/scrape/list`  
**Auth**: ✅ Required  
**Description**: Get list of available scrapers and their capabilities

**Response**:
```json
{
  "success": true,
  "data": {
    "scrapers": [
      {
        "name": "universal-scraper",
        "version": "2.0.0",
        "description": "Fast general-purpose scraper",
        "features": ["html", "pdf", "screenshot"],
        "recommended": true
      },
      {
        "name": "ultra-scraper",
        "version": "1.0.0",
        "description": "AI-powered with action planning",
        "features": ["html", "ai-navigation", "dynamic-content"],
        "recommended": false
      },
      {
        "name": "google-scraper",
        "version": "1.5.0",
        "description": "Google search results scraper",
        "features": ["search-results", "local-pack"],
        "recommended": false
      },
      {
        "name": "google-places",
        "version": "1.0.0",
        "description": "Google Maps/Places API + scraper hybrid",
        "features": ["places-api", "maps-scraping"],
        "recommended": false
      }
    ]
  }
}
```

**Example**:
```bash
curl http://localhost:3000/api/v1/scrape/list \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 💼 BUSINESS SEARCH

Base Path: `/api/v1/business`

### 1. Search for Businesses

**Endpoint**: `GET /api/v1/business/search`  
**Auth**: ✅ Required  
**Description**: Search for businesses using Google Places API or web scraping

**Query Parameters**:
- `query` (required): Search query (e.g., "restaurants in kathmandu")
- `businessType`: Filter by type (`restaurant`, `hotel`, `cafe`, etc.)
- `lat`: Latitude for geo search
- `lng`: Longitude for geo search
- `radius`: Search radius in meters (default: 5000)
- `maxResults`: Max results to return (default: 50)
- `strategy`: Search strategy
  - `auto`: Automatic (default)
  - `places-api`: Google Places API only
  - `scraper`: Web scraping only
  - `hybrid`: Both (fallback)
- `bypassCache`: Skip cache (`true`/`false`)

**Response**:
```json
{
  "success": true,
  "query": "restaurants in kathmandu",
  "businessType": "restaurant",
  "strategy": "places-api",
  "totalResults": 47,
  "businesses": [
    {
      "id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "name": "Krishnarpan Restaurant",
      "businessType": "restaurant",
      "address": "Battisputali Road, Kathmandu 44600, Nepal",
      "phone": "+977-1-4479488",
      "website": "https://www.dwarikas.com",
      "rating": 4.8,
      "reviewCount": 1523,
      "priceLevel": 4,
      "openNow": true,
      "location": {
        "lat": 27.7172,
        "lng": 85.324
      },
      "verified": true,
      "source": "google-places"
    }
  ],
  "metadata": {
    "executionTime": 2341,
    "sources": {
      "placesAPI": 47,
      "scraper": 0
    },
    "costEstimate": 0.83,
    "cacheHit": false
  }
}
```

**Example**:
```bash
# Basic search
curl "http://localhost:3000/api/v1/business/search?query=restaurants+in+kathmandu" \
  -H "Authorization: Bearer YOUR_API_KEY"

# With filters
curl "http://localhost:3000/api/v1/business/search?query=hotels+in+paris&businessType=hotel&maxResults=20" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Geo search
curl "http://localhost:3000/api/v1/business/search?query=gyms+near+me&lat=27.7172&lng=85.324&radius=5000" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### 2. Get Business Stats

**Endpoint**: `GET /api/v1/business/stats`  
**Auth**: ✅ Required  
**Description**: Get supported business types and search strategies

**Response**:
```json
{
  "success": true,
  "supportedTypes": [
    "restaurant", "hotel", "cafe", "gym", "hospital",
    "dentist", "lawyer", "plumber", "electrician"
  ],
  "strategies": [
    {
      "name": "auto",
      "description": "Automatic selection based on query",
      "costEfficient": true
    },
    {
      "name": "places-api",
      "description": "Google Places API (fast, quota limited)",
      "costEfficient": false
    },
    {
      "name": "scraper",
      "description": "Web scraping (slower, unlimited)",
      "costEfficient": true
    },
    {
      "name": "hybrid",
      "description": "API with scraper fallback",
      "costEfficient": true
    }
  ]
}
```

**Example**:
```bash
curl http://localhost:3000/api/v1/business/stats \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 🤖 AI MODULES

Base Path: `/api/v1/ai`

### 1. Run Full AI Pipeline

**Endpoint**: `POST /api/v1/ai/pipeline`  
**Auth**: ✅ Required  
**Description**: Execute complete AI extraction pipeline

**Request Body**:
```json
{
  "url": "https://example.com/product",
  "html": "<html>...</html>",
  "features": ["understand", "schema", "strategy", "validate", "selectors"]
}
```

**Parameters**:
- `url`: Page URL
- `html`: Raw HTML content
- `features`: Array of AI modules to run
  - `understand`: Page understanding
  - `schema`: Schema inference
  - `strategy`: Extraction strategy
  - `validate`: Data validation
  - `selectors`: Selector generation

**Response**:
```json
{
  "success": true,
  "data": {
    "understanding": {
      "pageType": "product",
      "category": "e-commerce",
      "entities": ["title", "price", "rating"]
    },
    "schema": {
      "title": "string",
      "price": "number",
      "rating": "number"
    },
    "selectors": {
      "title": "#product-title",
      "price": ".price-value",
      "rating": ".rating-stars"
    },
    "strategy": "static",
    "validationRules": {
      "price": "required|numeric|min:0"
    }
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/ai/pipeline \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "html": "<html><h1>Product</h1><p>$49.99</p></html>",
    "features": ["understand", "schema"]
  }'
```

---

### 2. Understand Page

**Endpoint**: `POST /api/v1/ai/understand`  
**Auth**: ✅ Required  
**Description**: Analyze page content and extract key information

**Request Body**:
```json
{
  "url": "https://example.com",
  "html": "<html>...</html>",
  "options": {
    "model": "gpt-4o"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "pageType": "product",
    "category": "e-commerce",
    "summary": "This is a product page for a widget",
    "entities": [
      {"type": "product_name", "confidence": 0.95},
      {"type": "price", "confidence": 0.98},
      {"type": "reviews", "confidence": 0.85}
    ],
    "primaryContent": "h1, .price, .rating",
    "language": "en"
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/ai/understand \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "html": "<h1>Super Widget</h1><p>$49.99</p>"
  }'
```

---

### 3. Generate CSS Selectors

**Endpoint**: `POST /api/v1/ai/selectors`  
**Auth**: ✅ Required  
**Description**: Generate robust CSS selectors for data extraction

**Request Body**:
```json
{
  "html": "<html>...</html>",
  "targets": ["title", "price", "description"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "selectors": {
      "title": "#product-title",
      "price": ".price-value",
      "description": ".product-description"
    },
    "confidence": {
      "title": 0.95,
      "price": 0.98,
      "description": 0.85
    },
    "fallbacks": {
      "title": ["h1", ".title"],
      "price": [".price", "[itemprop='price']"]
    }
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/ai/selectors \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div class=\"product\"><h1>Widget</h1><span class=\"price\">$50</span></div>",
    "targets": ["title", "price"]
  }'
```

---

### 4. Infer Data Schema

**Endpoint**: `POST /api/v1/ai/schema`  
**Auth**: ✅ Required  
**Description**: Automatically infer data schema from HTML

**Request Body**:
```json
{
  "html": "<html>...</html>"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "schema": {
      "title": {
        "type": "string",
        "required": true
      },
      "price": {
        "type": "number",
        "format": "currency",
        "required": true
      },
      "rating": {
        "type": "number",
        "min": 0,
        "max": 5,
        "required": false
      }
    }
  }
}
```

---

### 5. Plan Extraction Strategy

**Endpoint**: `POST /api/v1/ai/strategy`  
**Auth**: ✅ Required  
**Description**: Determine best extraction strategy for a page

**Request Body**:
```json
{
  "url": "https://example.com",
  "html": "<html>...</html>"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "strategy": "static",
    "rendering": "client-side",
    "recommendedTimeout": 3000,
    "antiBlockingRequired": false,
    "dynamicContent": false,
    "ajaxLoading": false
  }
}
```

---

### 6. Analyze Anti-Blocking

**Endpoint**: `POST /api/v1/ai/anti-blocking`  
**Auth**: ✅ Required  
**Description**: Detect bot protection and blocking mechanisms

**Request Body**:
```json
{
  "url": "https://example.com",
  "html": "<html>...</html>",
  "statusCode": 200
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "blockDetected": true,
    "blockType": "captcha",
    "confidence": 0.95,
    "details": {
      "captchaType": "recaptcha-v3",
      "provider": "Google"
    },
    "recommendations": [
      "Use proxy rotation",
      "Implement CAPTCHA solver",
      "Add realistic delays"
    ]
  }
}
```

---

### 7. Validate Extracted Data

**Endpoint**: `POST /api/v1/ai/validate`  
**Auth**: ✅ Required  
**Description**: Validate extracted data quality and completeness

**Request Body**:
```json
{
  "data": {
    "title": "Super Widget",
    "price": 49.99,
    "rating": 4.5
  },
  "schema": {
    "title": "string",
    "price": "number",
    "rating": "number"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "quality": "high",
    "completeness": 1.0,
    "errors": [],
    "warnings": [],
    "suggestions": []
  }
}
```

---

### 8. AI Health Check

**Endpoint**: `GET /api/v1/ai/health`  
**Auth**: ✅ Required  
**Description**: Check AI module health and availability

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "modules": {
      "understanding": "operational",
      "selectors": "operational",
      "schema": "operational",
      "strategy": "operational",
      "antiBlocking": "operational",
      "validation": "operational"
    },
    "providers": {
      "openai": "available",
      "anthropic": "available",
      "gemini": "unavailable"
    }
  }
}
```

---

### 9. Get Cost Statistics

**Endpoint**: `GET /api/v1/ai/costs`  
**Auth**: ✅ Required (Admin)  
**Description**: Get AI usage and cost statistics

**Response**:
```json
{
  "success": true,
  "data": {
    "totalCost": 45.23,
    "totalRequests": 1523,
    "averageCost": 0.03,
    "byProvider": {
      "openai": {
        "requests": 1200,
        "cost": 38.50,
        "tokens": 1250000
      },
      "anthropic": {
        "requests": 323,
        "cost": 6.73,
        "tokens": 450000
      }
    },
    "period": {
      "start": "2025-12-01T00:00:00.000Z",
      "end": "2025-12-21T05:00:00.000Z"
    }
  }
}
```

---

### 10. Reset Cost Tracking

**Endpoint**: `POST /api/v1/ai/costs/reset`  
**Auth**: ✅ Required (Admin)  
**Description**: Reset AI cost tracking counters

**Response**:
```json
{
  "success": true,
  "message": "Cost tracking reset successfully"
}
```

---

### 11. Clear AI Cache

**Endpoint**: `POST /api/v1/ai/cache/clear`  
**Auth**: ✅ Required (Admin)  
**Description**: Clear AI module caches

**Response**:
```json
{
  "success": true,
  "message": "AI cache cleared",
  "itemsCleared": 1234
}
```

---

## 🤖 AGENTIC ORCHESTRATION

Base Path: `/api/v1/agent`

### 1. Execute Agent Task

**Endpoint**: `POST /api/v1/agent/execute`  
**Auth**: ✅ Required  
**Description**: Execute autonomous agent with natural language goal

**Request Body**:
```json
{
  "url": "https://www.booking.com",
  "goal": "Find a hotel in Kathmandu under $50 with free wifi",
  "options": {
    "maxSteps": 10,
    "timeout": 60000,
    "model": "gpt-4o"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "agent_1703097600000_abc123",
    "statusUrl": "/api/v1/jobs/agent_1703097600000_abc123",
    "estimatedTime": 45000
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/agent/execute \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.booking.com",
    "goal": "Find a hotel in Kathmandu under $50"
  }'
```

---

## 📋 JOB MANAGEMENT

Base Path: `/api/v1/jobs`

### 1. Get Job Status

**Endpoint**: `GET /api/v1/jobs/:id`  
**Auth**: ✅ Required  
**Description**: Get status and result of a job

**Path Parameters**:
- `id`: Job ID (from scrape/agent response)

**Response (Completed)**:
```json
{
  "id": "job_1703097600000_abc123",
  "name": "scrape",
  "status": "completed",
  "progress": 100,
  "attemptsMade": 1,
  "finishedOn": 1703097660000,
  "processedOn": 1703097610000,
  "returnvalue": {
    "success": true,
    "data": {
      "html": "<html>...</html>",
      "text": "Product Title...",
      "metadata": {
        "url": "https://example.com",
        "timestamp": "2025-12-21T05:00:00.000Z",
        "executionTimeMs": 3456
      }
    }
  }
}
```

**Response (Failed)**:
```json
{
  "id": "job_1703097600000_abc123",
  "status": "failed",
  "failedReason": "BOT_DETECTION: CAPTCHA detected",
  "attemptsMade": 3,
  "error": {
    "code": "BOT_DETECTION",
    "category": "BLOCKING",
    "failurePoint": "EVASION_APPLICATION",
    "retryable": true
  }
}
```

**Response (Active)**:
```json
{
  "id": "job_1703097600000_abc123",
  "status": "active",
  "progress": 45,
  "attemptsMade": 1,
  "processedOn": 1703097610000
}
```

**Status Values**:
- `waiting`: Job queued
- `active`: Job processing
- `completed`: Job finished successfully
- `failed`: Job failed (check `failedReason`)
- `delayed`: Job delayed (will retry)
- `stalled`: Job stalled (maybe crashed)

**Example**:
```bash
curl http://localhost:3000/api/v1/jobs/job_1703097600000_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 🔑 KEYS MANAGEMENT

Base Path: `/api/v1/keys`

### Internal API Keys (User Keys)

#### 1. Create Internal API Key

**Endpoint**: `POST /api/v1/keys/internal`  
**Auth**: ✅ Required (Admin)  
**Description**: Generate new API key for a user

**Request Body**:
```json
{
  "userId": "customer-123",
  "tier": "pro",
  "metadata": {
    "name": "Production Key"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": "nx_pk_prod_8KmT3hF9LpQx2vN7jRwY5zC4dE6aB1sG"
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/keys/internal \
  -H "Authorization: Bearer ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "customer-123",
    "tier": "pro",
    "metadata": {"name": "Production Key"}
  }'
```

---

#### 2. Register Pre-Generated API Key

**Endpoint**: `POST /api/v1/keys/register`  
**Auth**: ✅ Required (Admin)  
**Description**: Register a key that was generated externally (from admin panel)

**Request Body**:
```json
{
  "keyHash": "bcrypt_hash_of_key",
  "userId": "customer-456",
  "tier": "pro",
  "rateLimit": {
    "maxRequests": 1000,
    "windowSeconds": 3600
  },
  "name": "External Key",
  "role": "user"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-12345"
  }
}
```

---

#### 3. List Internal API Keys

**Endpoint**: `GET /api/v1/keys/internal?userId=customer-123`  
**Auth**: ✅ Required (Admin)  
**Description**: List all keys for a user

**Query Parameters**:
- `userId`: User ID to filter keys

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-12345",
      "name": "Production Key",
      "tier": "pro",
      "role": "user",
      "isActive": true,
      "requestCount": 1523,
      "lastUsedAt": 1703097600000,
      "createdAt": 1703000000000,
      "rateLimit": {
        "maxRequests": 1000,
        "windowSeconds": 3600
      }
    }
  ]
}
```

**Example**:
```bash
curl "http://localhost:3000/api/v1/keys/internal?userId=customer-123" \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

#### 4. Revoke Internal API Key

**Endpoint**: `DELETE /api/v1/keys/internal/:id`  
**Auth**: ✅ Required (Admin)  
**Description**: Revoke (disable) an API key

**Path Parameters**:
- `id`: Key ID

**Response**:
```json
{
  "success": true,
  "message": "Key revoked successfully"
}
```

**Example**:
```bash
curl -X DELETE http://localhost:3000/api/v1/keys/internal/uuid-12345 \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

### External LLM Keys

#### 5. Add External API Key

**Endpoint**: `POST /api/v1/keys/external`  
**Auth**: ✅ Required (Admin)  
**Description**: Add encrypted LLM provider key (OpenAI, Anthropic, etc.)

**Request Body**:
```json
{
  "provider": "openai",
  "value": "sk-proj-...",
  "name": "Primary OpenAI Key"
}
```

**Supported Providers**:
- `openai`
- `anthropic`
- `gemini`
- `deepseek`
- `openrouter`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "ext_uuid_789",
    "provider": "openai",
    "name": "Primary OpenAI Key"
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/keys/external \
  -H "Authorization: Bearer ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "value": "sk-proj-...",
    "name": "Primary OpenAI Key"
  }'
```

---

#### 6. List External API Keys

**Endpoint**: `GET /api/v1/keys/external?provider=openai`  
**Auth**: ✅ Required (Admin)  
**Description**: List encrypted external keys (masked)

**Query Parameters**:
- `provider` (optional): Filter by provider

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "ext_uuid_789",
      "provider": "openai",
      "name": "Primary OpenAI Key",
      "status": "active",
      "value": "sk-...proj",
      "usageCount": 542,
      "lastUsed": 1703097600000,
      "lastError": null,
      "errorCount": 0
    }
  ]
}
```

**Example**:
```bash
curl "http://localhost:3000/api/v1/keys/external?provider=openai" \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

#### 7. Remove External API Key

**Endpoint**: `DELETE /api/v1/keys/external/:id`  
**Auth**: ✅ Required (Admin)  
**Description**: Remove external key

**Path Parameters**:
- `id`: Key ID

**Response**:
```json
{
  "success": true,
  "message": "Key removed successfully"
}
```

**Example**:
```bash
curl -X DELETE http://localhost:3000/api/v1/keys/external/ext_uuid_789 \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

## 🌐 PROXY MANAGEMENT

Base Path: `/api/v1/proxies`

### 1. Add Proxies

**Endpoint**: `POST /api/v1/proxies`  
**Auth**: ✅ Required (Admin)  
**Description**: Add proxy servers to rotation pool

**Request Body**:
```json
{
  "proxies": [
    {
      "url": "http://user:pass@proxy1.com:8080",
      "type": "http",
      "priority": 1
    },
    {
      "url": "socks5://user:pass@proxy2.com:1080",
      "type": "socks5",
      "priority": 2
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "added": 2,
    "total": 12
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/proxies \
  -H "Authorization: Bearer ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "proxies": [
      {"url": "http://user:pass@proxy.com:8080", "type": "http"}
    ]
  }'
```

---

### 2. List Proxies

**Endpoint**: `GET /api/v1/proxies`  
**Auth**: ✅ Required (Admin)  
**Description**: List all registered proxies

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 12,
    "healthy": 10,
    "unhealthy": 2,
    "proxies": [
      {
        "id": "proxy_123",
        "url": "proxy1.com:8080",
        "type": "http",
        "status": "healthy",
        "lastUsed": 1703097600000,
        "successRate": 0.95,
        "responseTime": 234
      }
    ]
  }
}
```

**Example**:
```bash
curl http://localhost:3000/api/v1/proxies \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

### 3. Remove Proxy

**Endpoint**: `DELETE /api/v1/proxies/:id`  
**Auth**: ✅ Required (Admin)  
**Description**: Remove a proxy from rotation

**Path Parameters**:
- `id`: Proxy ID

**Response**:
```json
{
  "success": true,
  "message": "Proxy removed successfully"
}
```

**Example**:
```bash
curl -X DELETE http://localhost:3000/api/v1/proxies/proxy_123 \
  -H "Authorization: Bearer ADMIN_SECRET"
```

---

## 📚 RAG (KNOWLEDGE BASE)

Base Path: `/api/v1/rag`

### 1. Index Document

**Endpoint**: `POST /api/v1/rag/index`  
**Auth**: ✅ Required  
**Description**: Add document to knowledge base (vector store)

**Request Body**:
```json
{
  "text": "The iPhone 15 was released in September 2023. It features USB-C charging.",
  "metadata": {
    "source": "apple.com",
    "category": "product",
    "date": "2023-09-15"
  },
  "namespace": "products"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "indexed": true,
    "chunks": 1,
    "tokens": 24
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/rag/index \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The iPhone 15 was released in September 2023.",
    "metadata": {"source": "apple.com"}
  }'
```

---

### 2. Query Knowledge Base

**Endpoint**: `POST /api/v1/rag/query`  
**Auth**: ✅ Required  
**Description**: Search knowledge base with semantic search

**Request Body**:
```json
{
  "query": "When did the new iPhone come out?",
  "namespace": "products",
  "maxResults": 5,
  "minScore": 0.7
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc_abc123",
        "text": "The iPhone 15 was released in September 2023.",
        "score": 0.95,
        "metadata": {
          "source": "apple.com",
          "category": "product",
          "date": "2023-09-15"
        }
      }
    ],
    "totalResults": 1
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/v1/rag/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "When did the new iPhone come out?",
    "maxResults": 5
  }'
```

---

## ❌ ERROR REFERENCE

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 202 | Accepted | Job accepted (async) |
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Insufficient permissions (not admin) |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Server degraded or shutting down |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "BOT_DETECTION",
    "category": "BLOCKING",
    "message": "CAPTCHA detected on page",
    "failurePoint": "EVASION_APPLICATION",
    "retryable": true,
    "context": {
      "url": "https://example.com",
      "captchaType": "recaptcha-v3"
    }
  }
}
```

### Error Categories

| Category | Description | Retryable |
|----------|-------------|-----------|
| `NETWORK` | Network connectivity issues | ✅ Yes |
| `BLOCKING` | Bot detection, CAPTCHA | ⚠️ Maybe |
| `CONFIGURATION` | Invalid configuration | ❌ No |
| `EXTERNAL_SERVICE` | External API failure | ✅ Yes |
| `TIMEOUT` | Operation timed out | ✅ Yes |
| `VALIDATION` | Invalid input data | ❌ No |
| `AUTHORIZATION` | Permission denied | ❌ No |
| `RATE_LIMIT` | Rate limit exceeded | ⏰ Wait |
| `DATA_EXTRACTION` | Failed to extract data | ⚠️ Maybe |

### Common Error Codes

- `BOT_DETECTION`: CAPTCHA or bot protection detected
- `TIMEOUT`: Operation exceeded time limit
- `NETWORK_ERROR`: Network connection failed
- `INVALID_SELECTOR`: CSS selector not found
- `QUOTA_EXCEEDED`: External API quota exceeded
- `PROXY_ERROR`: Proxy connection failed
- `INVALID_API_KEY`: API key invalid or revoked
- `RATE_LIMIT_EXCEEDED`: Too many requests

---

## 📊 Rate Limits

| Tier | Requests/Hour | Burst Limit | Concurrent Jobs |
|------|---------------|-------------|-----------------|
| Free | 100 | 10/min | 2 |
| Pro | 1,000 | 100/min | 10 |
| Enterprise | 10,000 | 1000/min | 50 |
| Admin | Unlimited | Unlimited | Unlimited |

**Headers**:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 2025-12-21T06:00:00.000Z
Retry-After: 3600
```

---

## 🎯 Quick Reference

### Base URLs
- Local: `http://localhost:3000`
- Production: `https://your-domain.com`

### Authentication
```bash
-H "Authorization: Bearer YOUR_API_KEY"
# or
-H "x-api-key: YOUR_API_KEY"
```

### Complete Endpoint List

```
PUBLIC (No Auth):
├── GET  /health
├── GET  /ready
├── GET  /metrics
├── GET  /stats
├── GET  /sessions/:domain
└── GET  /api/docs

SCRAPING:
├── POST /api/v1/scrape
└── GET  /api/v1/scrape/list

BUSINESS:
├── GET  /api/v1/business/search
└── GET  /api/v1/business/stats

AI:
├── POST /api/v1/ai/pipeline
├── POST /api/v1/ai/understand
├── POST /api/v1/ai/selectors
├── POST /api/v1/ai/schema
├── POST /api/v1/ai/strategy
├── POST /api/v1/ai/anti-blocking
├── POST /api/v1/ai/validate
├── GET  /api/v1/ai/health
├── GET  /api/v1/ai/costs
├── POST /api/v1/ai/costs/reset
└── POST /api/v1/ai/cache/clear

AGENT:
└── POST /api/v1/agent/execute

JOBS:
└── GET  /api/v1/jobs/:id

KEYS:
├── POST   /api/v1/keys/internal
├── POST   /api/v1/keys/register
├── GET    /api/v1/keys/internal
├── DELETE /api/v1/keys/internal/:id
├── POST   /api/v1/keys/external
├── GET    /api/v1/keys/external
└── DELETE /api/v1/keys/external/:id

PROXIES:
├── POST   /api/v1/proxies
├── GET    /api/v1/proxies
└── DELETE /api/v1/proxies/:id

RAG:
├── POST /api/v1/rag/index
└── POST /api/v1/rag/query
```

---

**Total Endpoints Documented**: 40+  
**Last Updated**: 2025-12-21  
**API Version**: v1
