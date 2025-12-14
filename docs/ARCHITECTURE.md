# ScrapeX Architecture: Clean Separation

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         ScrapeX SaaS Platform (website/)            │
│  ┌─────────────────────────────────────────────┐   │
│  │  Admin Dashboard (Next.js)                  │   │
│  │  - PostgreSQL (users, billing, analytics)   │   │
│  │  - User authentication                      │   │
│  │  - Subscription management                  │   │
│  │  - Job history & reporting                  │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │ HTTP REST API                 │
└─────────────────────┼───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│     ScrapeX Engine (Pure Scraping Engine)           │
│  ┌──────────────────────────────────────────────┐  │
│  │  API Layer                                   │  │
│  │  /api/v1/scrape     - Submit jobs           │  │
│  │  /api/v1/jobs/:id   - Get status            │  │
│  │  /api/v1/keys/*     - Key management        │  │
│  │  /api/v1/ai/*       - AI endpoints          │  │
│  │  /health, /metrics  - Monitoring            │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐  │
│  │  DragonflyDB (In-Memory)                     │  │
│  │  - API key hashes (fast auth)                │  │
│  │  - Job queue (BullMQ)                        │  │
│  │  - Scraping cache                            │  │
│  │  - No persistent storage                     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
NxScraper-engine/
│
├── core-engine/           ← Pure Scraping Engine
│   ├── src/api/          
│   │   ├── routes/       ← REST API endpoints
│   │   ├── controllers/  ← Business logic
│   │   └── middleware/   ← Auth, rate limiting
│   └── package.json
│
├── shared/               ← Engine internals
│   ├── ai/              ← LLM integration
│   ├── scrapers/        ← Scraper plugins
│   ├── queue/           ← Job queue (BullMQ)
│   └── database/        ← DragonflyDB client
│
├── services/            ← Scraper implementations
│   ├── heavy-scraper/
│   ├── google-scraper/
│   └── universal-scraper/
│
└── website/             ← SaaS Admin Layer (SEPARATE)
    ├── app/admin/       ← Admin UI
    ├── lib/
    │   ├── db/          ← PostgreSQL (admin data)
    │   └── engine-api.ts ← API client to call engine
    └── package.json
```

## 🔌 API Contract (Engine Interface)

### **Scraping**
```typescript
POST /api/v1/scrape
Authorization: Bearer {api_key}
{
  "url": "https://example.com",
  "scraperType": "heavy-scraper"
}
→ Returns: { jobId: "job_abc123" }

GET /api/v1/jobs/{jobId}
→ Returns: { status, result, error }
```

### **Key Management**
```typescript
POST /api/v1/keys/internal
{ "userId": "user_123", "tier": "pro" }
→ Returns: { key: "nx_pk_prod_..." }

DELETE /api/v1/keys/internal/{keyId}
→ Revokes key
```

### **Health & Metrics**
```typescript
GET /health
→ { status: "healthy", scrapers: {...} }

GET /metrics  
→ Prometheus format
```

## 🎯 Key Principles

### **Engine (core-engine/)**
- ✅ Stateless - No persistent database
- ✅ DragonflyDB only - For cache & queue
- ✅ API-first - Clean REST interface
- ✅ Standalone - Can run without admin
- ✅ Scalable - Horizontal scaling
- ✅ Open-sourceable - No SaaS logic

### **Admin/SaaS (website/)**
- ✅ PostgreSQL - For users, billing, history
- ✅ Next.js - Frontend + API routes
- ✅ Calls engine via HTTP - Loose coupling
- ✅ Owns user management - Auth & billing
- ✅ Stores results - Job history in PG

## 🔄 Data Flow

### Example: User submits scrape job

```
1. User → Admin UI (/admin)
2. Admin → PostgreSQL: Save job request
3. Admin → Engine API: POST /api/v1/scrape
4. Engine → DragonflyDB: Queue job
5. Engine → Worker: Process job
6. Worker → DragonflyDB: Store result (temp)
7. Engine → Admin: Return jobId
8. Admin → Engine API: GET /api/v1/jobs/{jobId}
9. Admin → PostgreSQL: Save result permanently
10. Admin → User: Display result
```

## 🚀 Deployment

### **Option 1: Monorepo (Current)**
```bash
# Both run from same repo
docker-compose up -d
```

### **Option 2: Separate Repos**
```bash
# Engine repo
github.com/you/scrapex-engine

# Admin repo  
github.com/you/scrapex-admin
```

## 💡 Benefits

1. **Clean Separation** - Engine has zero SaaS logic
2. **Flexibility** - Use engine standalone or with admin
3. **Scalability** - Scale engine and admin independently
4. **Open Source** - Engine can be open-sourced
5. **Multi-tenant** - One engine, multiple admin instances

## 🎓 Best Practices

- Engine never knows about users/billing
- Admin never knows about scraping internals
- All communication via REST API
- Engine uses DragonflyDB for speed
- Admin uses PostgreSQL for persistence
