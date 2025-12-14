# Testing NxScraper Engine - Complete Guide

## Current Status

✅ **Engine Status**: Healthy  
✅ **All Scrapers**: Operational  
❌ **AI Endpoints**: Require API Key Authentication

## Important Notes

### API Routes

The API has two types of endpoints:

**Public Endpoints** (No Auth Required):
- `GET /health` - Health check
- `GET /ready` - Readiness check  
- `GET /metrics` - Prometheus metrics
- `GET /stats` - Basic stats

**Protected Endpoints** (API Key Required):
- `POST /api/v1/ai/*` - All AI endpoints require API key

---

## Quick Test (Health Check Only)

Test the basic health without API keys:

```bash
# Health Check
curl http://localhost:3000/health | jq .
```

Expected output:
```json
{
  "status": "healthy",
  "scrapers": {
    "universal-scraper": true,
    "heavy-scraper": true,
    "google-scraper": true
  }
}
```

---

## Full Testing (With API Keys)

### Step 1: Generate API Key

First, generate an API key using the management script:

```bash
cd /home/cosmic-soul/Desktop/my-project/NxScraper-engine/core-engine

# Generate a new API key
docker compose exec core-engine node dist/core-engine/scripts/manage-api-keys.js create \
  --name "test-key" \
  --tier "premium" \
  --user-id "test-user"
```

**Save the API key shown** - you'll need it for testing!

### Step 2: Test AI Endpoints

Use the API key with all requests:

```bash
export API_KEY="nx_sk_dev_YOUR_KEY_HERE"

# Page Understanding
curl -X POST http://localhost:3000/api/v1/ai/understand \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/product",
    "html": "<html><body><div class=\"product\"><h1>iPhone 15</h1><span class=\"price\">$999</span></div></body></html>",
    "options": {"temperature": 0.3}
  }' | jq .

# Generate Selectors
curl -X POST http://localhost:3000/api/v1/ai/selectors \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div class=\"product\"><span class=\"price-tag\">$999</span></div>",
    "fieldName": "product_price",
    "context": "Extract price"
  }' | jq .

# Cost Statistics
curl http://localhost:3000/api/v1/ai/costs \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

## Alternative: Disable Authentication (Testing Only)

For easier testing, you can temporarily disable authentication:

### Option 1: Modify ai.routes.ts

Edit `core-engine/src/api/routes/ai.routes.ts`:

```typescript
// Comment out authentication middleware
// router.use(requireAPIKey);
// router.use(apiKeyRateLimit);
```

Then rebuild:
```bash
docker compose build core-engine
docker compose up -d core-engine
```

### Option 2: Use Test Mode

Set environment variable:
```bash
# In docker-compose.yml
TEST_MODE=true
```

This will bypass authentication (NOT FOR PRODUCTION!)

---

## Automated Test Script

Use the provided test script:

```bash
# Without API key (public endpoints only)
./test-basic.sh

# With API key (full tests)
export API_KEY="your-key-here"
./test-full.sh
```

---

## Testing Different LLM Providers

### Test OpenAI
```bash
curl -X POST http://localhost:3000/api/v1/ai/understand \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "test.com",
    "html": "<html>test</html>",
    "options": {"provider": "openai", "model": "gpt-4o-mini"}
  }'
```

### Test OpenRouter
```bash
curl -X POST http://localhost:3000/api/v1/ai/understand \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "test.com",
    "html": "<html>test</html>",
    "options": {"provider": "openrouter", "model": "anthropic/claude-3.5-sonnet"}
  }'
```

---

## Troubleshooting

### "Unauthorized" Error

**Problem**: `401 Unauthorized` or `No API key provided`

**Solution**:
1. Generate an API key (see Step 1 above)
2. Include it in the Authorization header:
   ```bash
   -H "Authorization: Bearer your-api-key-here"
   ```

### "Cannot POST /api/ai/..." Error

**Problem**: Using wrong endpoint path

**Solution**: Use `/api/v1/ai/...` instead of `/api/ai/...`

### "No LLM providers available"

**Problem**: No LLM API keys configured

**Solution**: Run the setup wizard:
```bash
./setup.sh
```

Then restart:
```bash
docker compose restart core-engine
```

---

## Production Testing Checklist

- [ ] Health check returns `"status": "healthy"`
- [ ] All scrapers show `true`
- [ ] API key authentication works
- [ ] At least one LLM provider configured
- [ ] AI endpoints respond without errors
- [ ] Cost tracking is accurate
- [ ] Cache is working
- [ ] Rate limiting is enforced
- [ ] Logs are clean (no errors)
- [ ] Metrics endpoint accessible

---

## Next Steps

1. **Generate API Key**: Use the manage-api-keys script
2. **Configure LLM**: Run `./setup.sh` to add API keys
3. **Test Endpoints**: Use the curl examples above
4. **Monitor**: Check Grafana at http://localhost:3001
