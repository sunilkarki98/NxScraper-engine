# NxScraper Cookbook: Advanced Scraping Guide

This guide provides "copy-paste" recipes for common scraping scenarios.

## 🥘 Recipes

### 1. The "Heavy" Scrape (Use for SPAs)
Use the `HeavyScraper` when you need to render JavaScript (React/Vue/Angular) or bypass Cloudflare.

```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "x-api-key: <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/some-profile",
    "scraperType": "heavy-scraper",
    "options": {
      "waitForSelector": ".pv-top-card", 
      "priority": 10 // High priority (if you are Admin)
    }
  }'
```
> **Pro Tip:** Use `waitForSelector` to ensure the dynamic content is fully loaded before the scraper snapshots the page.

### 2. The "Smart" Extraction (AI Pipeline)
Don't write selectors manually. Let the AI do it.

```javascript
/* Node.js Example */
const response = await fetch('http://localhost:3000/api/v1/scrape', {
  method: 'POST',
  body: JSON.stringify({
    url: "https://example.com/product/123",
    scraperType: "universal-scraper", // Fast engine
    options: {
        // AI will parse the result after scraping
        pipeline: ["understand", "schema", "validate"] 
    }
  })
});
```

### 3. Local Business Lead Gen
Find all pizza places in Chicago and get their emails.

```bash
curl "http://localhost:3000/api/v1/business/search?query=pizza+in+chicago&enrich=true" \
  -H "x-api-key: <YOUR_KEY>"
```
*   `enrich=true`: Tells the engine to visit each business website and look for `mailto:` links.

---

## 🛡️ Anti-Fingerprinting (Defense Evasion)

The engine automatically:
1.  **Rotates User-Agents**: Mimics different browsers (Chrome, Firefox, Safari).
2.  **Randomizes Viewports**: Prevents patterns based on screen size.
3.  **Hides Automation Flags**: Removes `navigator.webdriver` property.

**What YOU should do:**
*   **Use Proxies**: If scraping >100 pages from the same site, supply a proxy in `options.proxy`.
*   **Respect Rate Limits**: Don't be greedy. Use the `Queue` logic we built to space out requests.
