# 🧪 Testing Guide

## Test Infrastructure

NxScraper uses **Vitest** for both unit and integration tests.

---

## Quick Start

```bash
cd core-engine

# Unit tests (fast, mocked)
npm test

# Integration tests (real services)
npm run test:integration

# Coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

---

## Unit Tests (Mocked)

**Purpose:** Test business logic in isolation

**Speed:** < 10ms per test

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { toAppError } from '../types/errors';

describe('Error Handling', () => {
  it('should convert unknown to AppError', () => {
    const result = toAppError('string error');
    expect(result).toBeInstanceOf(AppError);
  });
});
```

**Run:**
```bash
npm run test:unit
```

---

## Integration Tests (Real Services)

**Purpose:** Test full stack with real Redis, browser, etc.

**Speed:** 100ms - 5s per test

**Prerequisites:**
```bash
# Start services
docker-compose up -d redis dragonfly chromadb
```

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { getBrowserPage } from '../utils/helpers';

describe('Real Browser', () => {
  it('should navigate to real website', async () => {
    const page = await getBrowserPage();
    await page.goto('https://example.com');
    const title = await page.title();
    expect(title).toContain('Example');
  });
});
```

**Run:**
```bash
npm run test:integration
```

---

## Test Structure

```
tests/
├── unit/                    # Unit tests (mocked)
│   ├── api/
│   │   └── *.test.ts
│   ├── errors/
│   │   └── *.test.ts
│   └── utils/
│       └── test-helpers.ts
│
└── integration/             # Integration tests (real)
    ├── api/
    │   └── *.test.ts
    ├── browser/
    │   └── real-browser.test.ts
    └── redis/
        └── real-redis.test.ts
```

---

## Test Utilities

### Unit Test Helpers
```typescript
import { createMockRequest, createMockResponse } from '../utils/test-helpers';

const req = createMockRequest({ url: 'https://example.com' });
const res = createMockResponse();
await controller.scrape(req, res);
expect(res.status).toHaveBeenCalledWith(202);
```

### Integration Test Helpers
```typescript
import { getRedisClient, getBrowserPage } from '../utils/helpers';

const redis = await getRedisClient();
const page = await getBrowserPage();
```

---

## Writing Tests

### Unit Test Template
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyComponent', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('MyIntegration', () => {
  beforeEach(async () => {
    // Setup real services
  });

  it('should work end-to-end', async () => {
    // Test with real services
  }, 15000); // 15 second timeout
});
```

---

## Coverage Goals

| Code | Target | Current |
|------|--------|---------|
| Lines | 80% | Running tests will show |
| Functions | 80% | Run `npm run test:coverage` |
| Branches | 70% | Opens HTML report |

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Unit Tests
  run: npm run test:unit -- --run

- name: Integration Tests
  run: |
    docker-compose up -d redis dragonfly
    npm run test:integration:run
```

---

## Debugging Tests

### Watch Mode
```bash
npm test  # Auto-reruns on file changes
```

### Single Test
```bash
npm test -- scrape.controller.test.ts
```

### Debug in VS Code
```json
{
  "type": "node",
  "request": "launch",
  "name": "Vitest",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"]
}
```

---

## Best Practices

1. **Unit tests for logic** - Fast feedback
2. **Integration tests for flows** - Confidence
3. **Mock external APIs** - Reliability
4. **Test error cases** - Robustness
5. **Keep tests fast** - < 1s for unit tests
