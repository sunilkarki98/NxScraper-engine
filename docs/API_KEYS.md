# 🔑 API Key Management Guide

## Two Key Systems

NxScraper-engine has two separate API key systems:

### 1. External LLM Keys (YOUR admin keys)
API keys from OpenAI, Gemini, etc. that YOUR engine uses internally.

### 2. Internal API Keys (USER authentication)
API keys that YOUR USERS use to authenticate with YOUR API.

---

## External LLM Keys

### Option 1: Static (.env)
```bash
# .env file
GOOGLE_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

### Option 2: Dynamic (API)
```bash
# Add key via API
curl -X POST http://localhost:3000/api/v1/keys/external \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "value": "AIza...your_key",
    "name": "Primary Gemini"
  }'

# List keys
curl http://localhost:3000/api/v1/keys/external

# Remove key
curl -X DELETE http://localhost:3000/api/v1/keys/external/:id
```

### Smart Selection
The engine automatically:
1. Checks dynamic keys (API)
2. Falls back to `.env`
3. Round-robin selection
4. Auto-disables failing keys (>10 errors)

---

## Internal API Keys

### Create Key
```bash
# Method 1: CLI
cd core-engine
npm run keys:create -- --name "Frontend App" --tier free

# Method 2: API
curl -X POST http://localhost:3000/api/v1/keys/register \
  -d '{"name": "My App", "tier": "free"}'
```

### Use Key
```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "Authorization: Bearer nx_pk_YOUR_KEY_HERE" \
  -d '{"url": "https://example.com"}'
```

### Manage Keys
```bash
# List
curl http://localhost:3000/api/v1/keys/internal?userId=user123

# Revoke
curl -X DELETE http://localhost:3000/api/v1/keys/internal/:id
```

---

## Supported LLM Providers

| Provider | Env Variable | Get Key |
|----------|--------------|---------|
| **Gemini** | `GOOGLE_API_KEY` | https://ai.google.dev/ (FREE) |
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/ |
| Anthropic | `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| DeepSeek | `DEEPSEEK_API_KEY` | https://platform.deepseek.com/ |

---

## Best Practices

### Use Both Methods
```bash
# .env - Fallback
GOOGLE_API_KEY=fallback_key

# API - Load balancing
# Add multiple keys for same provider
curl -X POST .../keys/external -d '{"provider":"gemini", "value":"key1"}'
curl -X POST .../keys/external -d '{"provider":"gemini", "value":"key2"}'
```

### Monitor Usage
```bash
curl http://localhost:3000/api/v1/keys/external
# Shows usage count, error count, last used
```

### Security
- Never commit `.env` to git
- Rotate keys regularly
- Use separate keys for dev/prod
- Monitor for suspicious usage

---

## API Endpoints

### External Keys (LLM Providers)
- `POST /api/v1/keys/external` - Add key
- `GET /api/v1/keys/external` - List keys
- `DELETE /api/v1/keys/external/:id` - Remove key

### Internal Keys (User Auth)
- `POST /api/v1/keys/internal` - Generate key
- `POST /api/v1/keys/register` - Register key
- `GET /api/v1/keys/internal` - List keys
- `DELETE /api/v1/keys/internal/:id` - Revoke key
