# 📘 NxScraper Engine: The Complete Guide

Welcome to the NxScraper API! This explorer's guide will help you understand how to use the engine to scrape websites, use AI, and manage your scraping business.

---

## 🔑 1. Getting Started (Authentication)

Before you can ask the engine to do anything, you need an **API Key**. Think of this as your "Passcode".

### How to use your API Key
You must include your key in the **Header** of every request you send.

**Header Name:** `x-api-key`
**Value:** `your_secret_key_here`

### 👑 Where is my Admin Key?
To start managing the system (like creating keys for others), you need the **Master Admin Secret**.
1. Open the `.env` file in your project root.
2. Look for `ADMIN_SECRET=...`.
3. Use this value as your `x-api-key` to access the Admin endpoints (Section 5).

> **Can I change this?** Yes! You can change `ADMIN_SECRET` in your `.env` file to anything you want (e.g., "my-super-secret-password" or a random UUID). Just remember to restart the server (`docker-compose restart`) after changing it.

> **Tip:** You should create a dedicated "Admin" key for yourself using Section 5 instead of using the raw secret everywhere.

#### Example (using cURL):
```bash
curl http://localhost:3000/api/v1/health \
  -H "x-api-key: nx_sk_johndoe123"
```

---

## 🕷️ 2. Scraping Websites

This is the main feature. You give us a URL, and we give you the data.

### 🚀 Start a Scrape Job (`POST /scrape`)

**What it does:** Tells the engine to go visit a website and capture its content.
**When to use it:** Whenever you need data from a webpage.

**Request Body:**
```json
{
  "url": "https://www.amazon.com/dp/B08N5KB911",  // The website you want to scrape
  "scraperType": "universal-scraper",              // "universal-scraper" (Fast) or "heavy-scraper" (Powerful)
  "options": {
    "waitForSelector": "#productTitle",            // Optional: Wait until this item appears on screen
    "proxy": "http://user:pass@proxy.com:8080"    // Optional: Use a specific proxy IP
  }
}
```

**Response (What you get back):**
The engine starts working in the background. It gives you a **Job ID** immediately.
```json
{
  "success": true,
  "data": {
    "jobId": "job_123456789",                     // SAVE THIS ID! You need it to check progress.
    "statusUrl": "/api/v1/jobs/job_123456789"     // The link to check your job
  }
}
```

**👇 Try it yourself (Copy & Paste):**
```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "scraperType": "universal-scraper"
  }'
```

---

### 📊 Check Job Status (`GET /jobs/:id`)

**What it does:** Checks if your scrape is finished and shows you the result.
**When to use it:** After you start a scrape, keep checking this until `status` is "completed".

**Request:**
Replace `:id` with the `jobId` you got from the previous step.

**Response (When finished):**
```json
{
  "id": "job_123456789",
  "status": "completed",        // Look for "completed" or "failed"
  "returnvalue": {
    "html": "<html>...</html>", // The raw HTML of the page
    "text": "Product Title...", // The visible text
    "headers": { ... }          // Technical page details
  }
}
```

**👇 Try it yourself:**
```bash
# Replace 'job_123' with your actual Job ID
curl http://localhost:3000/api/v1/jobs/job_123 \
  -H "x-api-key: YOUR_KEY"
```

---

## 📚 8. RAG (Your Knowledge Base)

**"Chat with your Data"**
This is a mini-database for text. You can store things here and search them by meaning later.

### Why use this?
1.  **Build a Chatbot:** Scrape a website -> Index it here -> Query it to answer questions.
2.  **Smart Search:** Store thousands of product descriptions and search for "cheap red shoes" (semantic search).

### 📥 Save Data (`POST /rag/index`)
Save text into your brain.
```bash
curl -X POST http://localhost:3000/api/v1/rag/index \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The iPhone 15 was released in September 2023.",
    "metadata": { "source": "apple.com" }
  }'
```

### 🔎 Ask Questions (`POST /rag/query`)
Search your brain.
```bash
curl -X POST http://localhost:3000/api/v1/rag/query \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "When did the new iPhone come out?" }'
```
> **Result:** It will find the text you saved above!

**What it does:** The AI looks at the messy HTML and tells you what the page is about.
**When to use it:** When you don't know the layout of a website and want the AI to figure it out.

**Request Body:**
```json
{
  "url": "https://example.com/product",
  "html": "<html>...raw page content...</html>",  // Paste the HTML you scraped
  "options": {
    "model": "gpt-4o" // Optional: Choose your brain
  }
}
```

**Response:**
```json
{
  "summary": "This is a Product Page",
  "category": "E-commerce",
  "entities": ["Product Name", "Price", "Reviews"]
}
```

**👇 Try it yourself:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/understand \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "html": "<h1>Super Widget</h1><p>$49.99</p>"
  }'
```

---

## 💼 4. Business Search

Find business leads (emails, phone numbers) automatically.

### 🔍 Find Businesses (`GET /business/search`)

**What it does:** Searches Google Maps for businesses and can even visit their websites to find emails.
**When to use it:** "I need a list of all Dentists in London with their email addresses."

**Parameters:**
*   `query`: What to search for (e.g., "Dentists in London").
*   `limit`: How many results (max 50).
*   `enrich`: set to `true` to visit their websites and find emails (slower but better).

**👇 Try it yourself:**
```bash
# Find 5 Pizza places in New York and find their emails
curl "http://localhost:3000/api/v1/business/search?query=pizza+new+york&limit=5&enrich=true" \
  -H "x-api-key: YOUR_KEY"
```

---

## 🗣️ 6. Just Ask (Natural Language)

Yes! You can simply "prompt" the engine if you don't want to deal with URLs.

### 🏨 Find Places ("Hotels in Kathmandu")
Use the **Business Search** endpoint.
*   **What it does:** Replaces specific URLs with a general query.
*   **Endpoint:** `GET /business/search`
*   **Prompt:** Put your prompt in the `query` parameter.

**👇 Try it yourself:**
```bash
curl "http://localhost:3000/api/v1/business/search?query=hotels+in+kathmandu&limit=5" \
  -H "x-api-key: YOUR_KEY"
```

### 🕵️ Agent Actions ("Go to Amazon and find X")
If you want the engine to **navigate** a specific site for you.
*   **Endpoint:** `POST /agent/execute`
*   **Prompt:** Put your instructions in the `goal` field.

**👇 Try it yourself:**
```bash
curl -X POST http://localhost:3000/api/v1/agent/execute \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.booking.com",
    "goal": "Find a hotel in Kathmandu under $50 with free wifi"
  }'
```

---

## 🛠️ 7. Managing Your Engine (Admin)

Commands to manage the system.

### 🔑 Create a User Key (`POST /keys/internal`)

**What it does:** Creates a NEW API key for a user.
**When to use it:** When you sign up a new customer and need to give them access.

**Request:**
```json
{
  "tier": "pro",          // "free" or "pro"
  "userId": "user_bob",   // The user's name or ID
  "name": "Bob's Key"     // A nickname for the key
}
```

**👇 Try it yourself:**
```bash
curl -X POST http://localhost:3000/api/v1/keys/internal \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier": "pro", "userId": "test_user", "name": "Test Key"}'
```

### 🧠 Setup LLM Keys (2 Ways)

You have two ways to give the engine your OpenAI/Gemini/Anthropic keys.

#### Method 1: The Easy Way (`.env`)
1.  Open the `.env` file in your project root.
2.  Paste your keys next to the matching name:
    ```bash
    GOOGLE_API_KEY=AIzr...
    OPENAI_API_KEY=sk-proj...
    ANTHROPIC_API_KEY=sk-ant...
    ```
3.  Restart: `docker-compose restart`

> **Do I need ALL of them?**
> **No.** You only need **ONE** to start (e.g., just OpenAI or just Gemini).
> *   **Start Simple:** Just add `OPENAI_API_KEY`.
> *   **Go Pro:** Add others later as "backups". If OpenAI goes down, the engine acts smart and switches to Gemini automatically!

#### Method 2: The Advanced Way (API)
Use this if you want to add keys without restarting, or use multiple keys for valid keys rotation.

**Endpoint:** `POST /keys/external`
**Request:**
```json
{
  "provider": "openai",              // "openai", "anthropic", or "google"
  "value": "sk-proj-12345...",       // Your actual secret key from OpenAI
  "name": "My Main OpenAI Key"
}
```

**👇 Try it yourself:**
```bash
curl -X POST http://localhost:3000/api/v1/keys/external \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "value": "sk-...", "name": "Primary"}'
```

---

## ❌ Common Errors

If something goes wrong, here is what the codes mean:

*   **401 Unauthorized:** You forgot your API Key or it's wrong. check `x-api-key`.
*   **400 Bad Request:** You sent bad JSON or missed a required field (like `url`).
*   **402 Payment Required:** Your "free" tier key ran out of credits. Upgrade to "pro".
*   **429 Too Many Requests:** You are scraping too fast! Slow down.
