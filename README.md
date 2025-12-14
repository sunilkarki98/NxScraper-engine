# 🕷️ ScrapeX - Next-Gen AI-Powered Web Scraping Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Production-ready web scraping engine with AI-powered data extraction, async job processing, and enterprise-grade scalability. Built with TypeScript, BullMQ, and multi-LLM support.

## ✨ Features

- 🤖 **AI-Powered Extraction** - Multi-LLM support (DeepSeek, Gemini, Claude, Ollama)
- ⚡ **Async Job Processing** - BullMQ-powered queues with automatic retries
- 🛡️ **Anti-Bot Evasion** - Puppeteer Stealth, Playwright, rotating proxies
- 🔧 **TypeScript Native** - Full type safety with comprehensive error handling
- 📊 **Production Ready** - Docker, Redis caching, circuit breakers, monitoring
- 🚀 **Plugin Architecture** - Extend with custom scrapers and middleware
- 🔐 **Secure** - API key authentication with rate limiting
- 📈 **Scalable** - Horizontal scaling with Redis-backed job queues
- 🎛️ **Admin Dashboard** - Web UI for key management, analytics, and monitoring


## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│            (Express.js + Authentication)                 │
└──────────────────┬──────────────────────────────────────┘
                   │
       ┌───────────┴────────────┐
       │                        │
┌──────▼──────┐         ┌──────▼──────┐
│  Core Engine│         │  AI Engine  │
│  (Scrapers) │         │   (LLMs)    │
└──────┬──────┘         └──────┬──────┘
       │                        │
       └───────────┬────────────┘
                   │
       ┌───────────▼────────────┐
       │    BullMQ Job Queue     │
       │    (Redis-backed)       │
       └───────────┬────────────┘
                   │
       ┌───────────▼────────────┐
       │   Worker Pool           │
       │   (Async Processing)    │
       └─────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Redis 6+
- PostgreSQL 14+ (optional, for API key persistence)
- Docker & Docker Compose (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/scrapex-engine.git
cd scrapex-engine

# Install dependencies
npm install

# Run interactive setup
bash setup.sh
```

### Running with Docker (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Running Locally

```bash
# Start Redis (required)
redis-server

# Start the engine
# Start Redis (required)
redis-server

# Start the engine (from root)
npm run dev -w @nx-scraper/core

# In another terminal, generate an API key
npm run keys:create -w @nx-scraper/core
```

## 📖 Usage

### Basic Scraping

```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "scraperType": "heavy-scraper"
  }'
```

Response:
```json
{
  "jobId": "job_abc123def456",
  "status": "queued",
  "estimatedTime": "2-5s",
  "pollUrl": "/api/v1/jobs/job_abc123def456"
}
```

### AI-Powered Extraction

```bash
curl -X POST http://localhost:3000/api/v1/ai/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/product",
    "schema": {
      "productName": "string",
      "price": "number",
      "inStock": "boolean"
    },
    "model": "gemini-1.5-flash"
  }'
```

### Check Job Status

```bash
curl http://localhost:3000/api/v1/jobs/job_abc123def456 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🛠️ Configuration

### Environment Variables

Key environment variables (see `.env.example`):

```bash
# Server
PORT=3000
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/scrapex

# AI Providers
DEEPSEEK_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Security
JWT_SECRET=your_secret_here
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Supported AI Models

| Provider   | Model ID              | Best For                    |
|------------|-----------------------|-----------------------------|
| DeepSeek   | deepseek-chat         | General extraction          |
| Google     | gemini-1.5-flash      | Fast, cost-effective        |
| Anthropic  | claude-3-5-sonnet     | Complex data structures     |
| Ollama     | llama3                | Local/offline processing    |

## 📚 Documentation

- [API Reference](./docs/API_REFERENCE.md) - Complete endpoint documentation
- [Architecture](./docs/ARCHITECTURE.md) - System design and components
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment
- [Contributing](./docs/CONTRIBUTING.md) - How to contribute

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Test specific scraper
bash test-engine.sh
```

## 📦 Project Structure

```
scrapex-engine/
├── packages/
│   ├── core/            # Main API server (@nx-scraper/core)
│   │   ├── src/
│   │   ├── api/         # Express routes & controllers
│   │   └── server.ts    # Entry point
│   ├── shared/          # Shared code (@nx-scraper/shared)
│   │   ├── ai/          # AI engine & LLM providers
│   │   └── browser/     # Browser automation adapters
│   └── scrapers/        # Scraper implementations
│       ├── google-places/
│       ├── google-scraper/
│       ├── heavy-scraper/
│       └── universal-scraper/

├── package.json         # Workspace root
├── docker-compose.yml   # Development orchestration
└── setup.sh             # Interactive setup script
```

## 🚢 Deployment

### Docker Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Cloud Deployment

Recommended platforms:
- **AWS ECS** - Container orchestration
- **Google Cloud Run** - Serverless containers
- **DigitalOcean App Platform** - Managed deployment
- **Railway/Render** - Quick deployment

See [Deployment Guide](./docs/DEPLOYMENT.md) for detailed instructions.

## 🔒 Security

- ✅ API key authentication
- ✅ Rate limiting per API key
- ✅ Input validation & sanitization
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Secure headers (Helmet.js)

## 📊 Monitoring

The engine includes built-in monitoring:

- **Health Check**: `GET /health`
- **Metrics**: Prometheus-compatible endpoint at `/metrics`
- **Job Queue Stats**: Real-time queue monitoring
- **Circuit Breaker**: Automatic failure detection and recovery

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Quick steps:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Puppeteer](https://pptr.dev/), [Playwright](https://playwright.dev/), [BullMQ](https://bullmq.io/)
- AI powered by DeepSeek, Google Gemini, and Anthropic Claude
- Inspired by [Scrapy](https://scrapy.org/)

## 📞 Support

- 📧 Email: support@scrapex.com
- 💬 Discord: [Join our community](#)
- 📚 Docs: [docs.scrapex.com](#)

---

**Made with ❤️ for developers who need reliable web scraping**
