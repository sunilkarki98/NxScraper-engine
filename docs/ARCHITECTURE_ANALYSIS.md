# Principal Engineer: System Architecture Analysis

## 1. Scraping Capabilities & Efficiency
The engine uses a tiered architecture with specialized scrapers and a robust browser management system.

### **Core Components**
*   **Browser Pool (`packages/shared/src/browser/pool.ts`)**:
    *   **Management**: Implements a lifecycle manager for Puppeteer and Playwright instances.
    *   **Efficiency**: Uses a "least-loaded" strategy for reuse and aggressive cleanup (30-second interval) for idle/aged browsers.
    *   **Fingerprinting**: Integrates `fingerprint-generator` for unique viewports/user-agents per launch.
    *   **Circuit Breaker**: Detects zombie browsers during page creation and recycles them automatically.
*   **Heavy Scraper (`packages/scrapers/heavy-scraper`)**:
    *   **Target**: Protected sites (Amazon, LinkedIn, Facebook).
    *   **Evasion**: Uses `ghost-cursor` for human-like mouse movements and `waitForSelector` for dynamic hydration.
    *   **Performance**: High resource cost due to full browser rendering + humanization delays.
*   **Universal Scraper**:
    *   Likely uses lighter-weight HTTP requests or optimized browser interaction (inferred from design patterns).

### **Efficiency Rating: 7/10**
*   **Pros**: strong evasion, robust error recovery (circuit breaker), modular design.
*   **Cons**: No evidence of "headed" browser clustering (e.g., K8s scaling of browser pods) in the inspected code—it runs locally in the worker container, which limits vertical scalability.

## 2. Role of AI in the Engine
The `AIEngine` (`packages/shared/src/ai/ai-engine.ts`) is a sophisticated pipeline, not just a wrapper.

### **Pipeline Flow**
1.  **Page Understanding**: Analyzes raw HTML to identify page type and primary content.
2.  **Selector Generation**: Generates CSS/XPath selectors based on the understanding.
3.  **Schema Inference**: Maps HTML structure to JSON schema.
4.  **Strategy Planning**: Decides how to navigate (pagination, login).
5.  **Data Validation**: Checks extracted data against the schema.
6.  **Self-Healing**: Validation failures feed back into `HealingManager` to update selectors.

### **Efficiency & Cost**
*   **Caching**: `AICache` is checked before every major step, significantly reducing token costs for repeated scrapes of similar pages.
*   **Modularity**: Users can request specific features (`['understand', 'strategy']`), preventing wasted tokens on unused modules.

## 3. Data Flow Architecture
**Request Path:**
`API Request` -> `Controller` -> `Queue (BullMQ/Redis)` -> `Worker` -> `Plugin/Scraper` -> `AI Engine` -> `Result`

### **Analysis**
*   **Async First**: The architecture is fundamentally asynchronous using queues, which is correct for high-latency scraping tasks.
*   **Persistence**: Results are likely stored in Postgres/Redis (inferred from dependencies), allowing polling or webhook delivery.

## 4. Recommendations
1.  **Browser Scaling**: Move the `BrowserPool` to a dedicated microservice or use a remote browser grid (e.g., Browserless) to decouple scraping load from the worker logic.
2.  **Job Priority**: Implement priority queues (e.g., "VIP" vs "Free" tier) in `QueueManager` to ensure paid users aren't blocked by bulk free requests.
3.  **Stream Processing**: For large datasets, stream results to storage/webhooks instead of holding the entire payload in memory.
