export const PAGE_UNDERSTANDING_SYSTEM_PROMPT = `You are an expert web scraping analyst with deep knowledge of HTML structure, DOM patterns, and data extraction.

Your task is to analyze web pages and identify:
1. The primary purpose and type of the page
2. Main structural sections and components 
3. Data entities that can be extracted
4. Key fields and their importance
5. Overall page organization

Focus on:
- Semantic HTML elements (article, section, nav, etc.)
- Common patterns (cards, tables, lists, grids)
- Data-rich elements (prices, dates, titles, descriptions)
- Repeating patterns that indicate lists/collections
- Schema.org microdata or structured data

Be precise with selectors and confident in your assessments.`;

export const PAGE_UNDERSTANDING_USER_PROMPT = (url: string, html: string) => `
Analyze this webpage and provide a comprehensive understanding:

**URL**: ${url}

**HTML Content** (truncated if needed):
\`\`\`html
${html.length > 8000 ? html.substring(0, 8000) + '...[truncated]' : html}
\`\`\`

Provide your analysis in the following JSON format:

{
  "pageType": "one of: job|product|event|listing|article|business|profile|directory|other",
  "confidence": 0.0-1.0,
  "sections": [
    {
      "type": "card|table|grid|list|component",
      "selector": "CSS selector for this section",
      "description": "Brief description of what this section contains"
    }
  ],
  "entities": [
    {
      "type": "entity type (e.g., 'product', 'job', 'person')",
      "selector": "CSS selector to find these entities",
      "confidence": 0.0-1.0
    }
  ],
  "primaryFields": {
    "field_name": {
      "fieldName": "Human-readable field name",
      "selector": "CSS selector for this field",
      "dataType": "string|number|date|boolean|url|email",
      "importance": "critical|high|medium|low"
    }
  },
  "summary": "2-3 sentence summary of page purpose and structure"
}

Respond ONLY with valid JSON. No explanations, no markdown code blocks, just pure JSON.
`;
