# 🚀 NxScraper Core Engine

**Clean, plugin-based web scraping orchestrator**

---

## 🏗️ Architecture

This is the **core orchestrator** using a plugin-based architecture. All scrapers are independent plugins that implement the `IScraper` interface.

### Why Plugin Architecture?

- ✅ **Loose coupling** - Core doesn't know about specific scrapers
- ✅ **Easy to extend** - Add scrapers without modifying core
- ✅ **Easy to test** - Mock scrapers independently  
- ✅ **Maintainable** - Small, focused components

---

## 📁 Structure

```
core-engine/
├── src/
│   ├── index.ts              # Entry point - registers plugins
│   ├── orchestrator/
│   │   └── worker.ts         # Job processor (73 lines)
│   └── plugins/
│       └── plugin-manager.ts # Scraper registry (99 lines)
└── package.json
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd core-engine
npm install
```

### 2. Configure Environment

```bash
cp . env.example .env
# Edit .env as needed
```

### 3. Build

```bash
npm run build
```

### 4. Run

```bash
# Development
npm run dev

# Production
npm start
```

---

## 🔌 Adding a New Scraper

### Step 1: Create Scraper Service

```bash
mkdir -p ../services/my-scraper/src
```

### Step 2: Implement IScraper

```typescript
// services/my-scraper/src/scraper.ts
import { IScraper, ScrapeOptions, ScrapeResult } from '../../../shared/types/scraper.interface';

export class MyScraper implements IScraper {
    name = 'my-scraper';
    version = '1.0.0';

    async canHandle(url: string): Promise<number> {
        // Return confidence score 0-1
        return url.includes('example.com') ? 0.9 : 0;
    }

    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        // Your scraping logic
        return {
            success: true,
            data: { /* ... */ },
            metadata: {
                url: options.url,
                timestamp: new Date().toISOString(),
                executionTimeMs: 0,
                engine: this.name
            }
        };
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
```

### Step 3: Register in Core Engine

```typescript
// core-engine/src/index.ts
async function registerScrapers() {
    // ... existing scrapers
    
    // Add your scraper
    const { MyScraper } = await import('../../services/my-scraper/src/scraper');
    pluginManager.register(new MyScraper());
    logger.info('Registered: MyScraper');
}
```

**That's it!** No changes to worker or orchestration logic needed.

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 📊 How It Works

### Job Flow

```
1. Job arrives in BullMQ queue
        ↓
2. JobWorker.processJob(job)
        ↓
3. pluginManager.scrape(job.data)
        ↓
4. findBestScraper(url)
   ├─ Call canHandle() on each scraper
   ├─ Get confidence scores
   └─ Return highest scoring scraper
        ↓
5. scraper.scrape(options)
        ↓
6. Return result
```

### Dynamic Scraper Selection

```typescript
// Each scraper implements canHandle()
UniversalScraper.canHandle("https://example.com") → 0.5
GoogleScraper.canHandle("https://google.com/search") → 1.0
TelegramScraper.canHandle("https://t.me/channel") → 1.0

// Plugin manager selects highest score
pluginManager.findBest("https://google.com") → GoogleScraper
```

---

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `REDIS_URL` | Redis connection string | redis://localhost:6379 |
| `WORKER_CONCURRENCY` | Number of concurrent jobs | 5 |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | info |

---

## 🔧 Development

### Project Commands

```bash
npm run build          # Compile TypeScript
npm run dev            # Run with ts-node (development)
npm start              # Run compiled code (production)
npm test               # Run tests
npm run test:coverage  # Test with coverage report
```

---

## 📈 Architecture Benefits

### Before (Monolithic)
- ❌ 300-line worker file
- ❌ 9 direct imports
- ❌ if-else chains for scraper selection
- ❌ Hard to test
- ❌ Hard to extend

### After (Plugin-Based)
- ✅ 73-line worker file
- ✅ Zero direct scraper imports
- ✅ Dynamic selection via canHandle()
- ✅ Easy to test (mock interface)
- ✅ Easy to extend (add plugin, done!)

---

## 🤝 Contributing

1. Create scraper service in `/services`
2. Implement `IScraper` interface
3. Register in `core-engine/src/index.ts`
4. Add tests
5. Submit PR

---

## 📚 Documentation

- [Migration Plan](../docs/MIGRATION_PLAN.md)
- [Architecture Review](../docs/ARCHITECTURE_REVIEW.md)
- [Architecture Comparison](../docs/ARCHITECTURE_COMPARISON.md)

---

**Status:** ✅ Migration in progress  
**Version:** 2.0.0  
**License:** MIT
