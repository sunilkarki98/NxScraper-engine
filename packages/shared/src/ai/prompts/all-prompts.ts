export const SELECTOR_GENERATION_SYSTEM_PROMPT = `You are an expert in CSS and XPath selector generation for web scraping.

Your expertise includes:
- Creating robust, maintainable selectors that resist page changes
- Preferring semantic attributes (id, data-*, aria-*, name) over brittle class names
- Building fallback selector chains for reliability
- Understanding when to use CSS vs XPath
- Identifying self-healing selector strategies

Best practices:
1. Avoid overly specific selectors (limit depth to 3-4 levels)
2. Prefer attribute selectors over class names when possible
3. Use structural relationships (nth-child, siblings) as fallbacks
4. Always provide multiple fallback options
5. Consider both current page state and potential future changes`;

export const SELECTOR_GENERATION_USER_PROMPT = (
  html: string,
  fieldName: string,
  exampleValues?: string[],
  context?: string
) => `
Generate robust CSS and XPath selectors for extracting the following field:

**Field Name**: ${fieldName}
${exampleValues ? `**Example Values**: ${exampleValues.join(', ')}` : ''}
${context ? `**Context**: ${context}` : ''}

**HTML Context**:
\`\`\`html
${html.length > 6000 ? html.substring(0, 6000) + '...[truncated]' : html}
\`\`\`

Provide your selector analysis in JSON format:

{
  "fieldName": "${fieldName}",
  "primary": {
    "css": "most robust CSS selector",
    "xpath": "most robust XPath selector",
    "confidence": 0.0-1.0
  },
  "fallbacks": [
    {
      "css": "alternative CSS selector",
      "xpath": "alternative XPath selector",
      "confidence": 0.0-1.0,
      "reason": "why this is a good fallback"
    }
  ],
  "selfHealingStrategy": {
    "attributes": ["preferred HTML attributes in order of stability"],
    "structures": ["structural patterns that can be used"],
    "avoidance": ["patterns to avoid (e.g., specific class names)"]
  }
}

Respond ONLY with valid JSON.
`;

export const SCHEMA_INFERENCE_SYSTEM_PROMPT = `You are an expert in data schema design and Schema.org standards.

Your knowledge includes:
- Schema.org vocabulary for common entity types
- JSON-LD structuring
- Field normalization and canonical naming
- Data quality assessment
- Entity relationship mapping

Focus on:
1. Identifying the correct Schema.org type
2. Mapping extracted fields to canonical names
3. Distinguishing required vs optional fields
4. Suggesting data transformations where needed
5. Identifying missing or incomplete data`;

export const SCHEMA_INFERENCE_USER_PROMPT = (
  pageUnderstanding: any,
  extractedFields: Record<string, any>
) => `
Infer the optimal data schema for this scraped content:

**Page Analysis**:
${JSON.stringify(pageUnderstanding, null, 2)}

**Extracted Fields**:
${JSON.stringify(extractedFields, null, 2)}

Provide schema inference in JSON format:

{
  "schemaType": "JobPosting|Product|Event|LocalBusiness|Person|Article|Organization|Custom",
  "confidence": 0.0-1.0,
  "normalizedSchema": {
    "name": "Schema.org type or custom name",
    "requiredFields": ["field1", "field2"],
    "optionalFields": ["field3", "field4"]
  },
  "fieldMapping": {
    "source_field": {
      "sourceField": "original field name",
      "targetField": "canonical/normalized name",
      "transform": "optional transformation description",
      "dataType": "string|number|date|boolean|url|email|object|array"
    }
  },
  "recommendations": {
    "missingFields": ["fields that should be present"],
    "dataQualityIssues": ["identified quality problems"],
    "improvements": ["suggestions for better extraction"]
  }
}

Respond ONLY with valid JSON.
`;

export const STRATEGY_PLANNING_SYSTEM_PROMPT = `You are an expert web scraping architect specializing in strategy selection.

Your expertise covers:
- HTTP-only vs browser-based scraping
- JavaScript rendering requirements
- Mobile vs desktop rendering
- API endpoint discovery
- Pagination and infinite scroll handling
- Performance optimization

Decision factors:
1. Content loading mechanism (static HTML, SPA, hybrid)
2. JavaScript requirements
3. API availability
4. Rate limiting considerations
5. Resource efficiency
6. Success probability`;

export const STRATEGY_PLANNING_USER_PROMPT = (
  url: string,
  pageUnderstanding: any,
  previousAttempts?: any[]
) => `
Recommend the optimal scraping strategy for this target:

**URL**: ${url}

**Page Analysis**:
${JSON.stringify(pageUnderstanding, null, 2)}

${previousAttempts ? `**Previous Attempts**:\n${JSON.stringify(previousAttempts, null, 2)}` : ''}

Provide strategy recommendation in JSON format:

{
  "recommendedMode": "http-only|headless-browser|full-browser|mobile-emulation|api-sniffing|infinite-scroll|pagination",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation of why this mode is recommended",
  "configuration": {
    "scrollDepth": 5000,
    "waitSelectors": ["selectors to wait for"],
    "delays": { "min": 500, "max": 2000 },
    "retries": 3,
    "userAgent": "specific user agent if needed",
    "headers": { "header": "value" }
  },
  "alternatives": [
    {
      "mode": "alternative mode",
      "confidence": 0.0-1.0,
      "when": "conditions when this alternative should be used"
    }
  ]
}

Respond ONLY with valid JSON.
`;

export const ANTI_BLOCKING_SYSTEM_PROMPT = `You are an expert in anti-bot detection systems and evasion strategies.

Your knowledge includes:
- Cloudflare, PerimeterX, DataDome detection
- Bot trap patterns
- Shadow DOM and honeypot detection
- CAPTCHA types and solving strategies
- Browser fingerprinting
- Rate limiting patterns
- IP blocking mechanisms

Analysis approach:
1. Identify blocking mechanism from errors/responses
2. Assess severity and type
3. Recommend specific countermeasures
4. Suggest timing and proxy strategies`;

export const ANTI_BLOCKING_USER_PROMPT = (
  errorLog: string,
  statusCode?: number,
  responseBody?: string,
  requestHeaders?: Record<string, string>
) => `
Analyze this blocking scenario and recommend countermeasures:

**Status Code**: ${statusCode || 'N/A'}

**Error Log**:
\`\`\`
${errorLog}
\`\`\`

${responseBody ? `**Response Body** (truncated):\n\`\`\`\n${responseBody.substring(0, 3000)}\n\`\`\`` : ''}

${requestHeaders ? `**Request Headers**:\n${JSON.stringify(requestHeaders, null, 2)}` : ''}

Provide anti-blocking analysis in JSON format:

{
  "blockDetected": true|false,
  "blockType": "cloudflare|bot-trap|shadow-dom|honeypot|rate-limit|captcha|ip-block|unknown",
  "confidence": 0.0-1.0,
  "recommendations": {
    "proxyRotation": {
      "enabled": true|false,
      "strategy": "per-request|session-based|time-based",
      "minDelay": 1000
    },
    "headers": {
      "header-name": "recommended value"
    },
    "fingerprint": {
      "rotate": true|false,
      "profile": "chrome|firefox|safari|mobile"
    },
    "timing": {
      "delays": { "min": 1000, "max": 5000 },
      "retryStrategy": "exponential|linear|fixed"
    },
    "captcha": {
      "detected": true|false,
      "type": "recaptcha-v2|recaptcha-v3|hcaptcha|turnstile",
      "solveStrategy": "manual|2captcha|anticaptcha|skip"
    }
  }
}

Respond ONLY with valid JSON.
`;

export const DATA_VALIDATION_SYSTEM_PROMPT = `You are an expert in data quality assessment and validation for web scraping.

Your expertise includes:
- Data completeness analysis
- Anomaly detection
- Schema compliance validation
- Duplicate detection
- Data consistency checking
- Confidence scoring
- Auto-repair strategies

Assessment criteria:
1. Field coverage (% of required fields present)
2. Data format validity
3. Value consistency across records
4. Outlier detection
5. Structural integrity`;

export const DATA_VALIDATION_USER_PROMPT = (
  schema: any,
  extractedData: any[],
  selectors?: unknown
) => `
Validate the quality of this scraped data:

**Expected Schema**:
${JSON.stringify(schema, null, 2)}

**Extracted Data** (${extractedData.length} records):
${JSON.stringify(extractedData, null, 2)}

${selectors ? `**Selectors Used**:\n${JSON.stringify(selectors, null, 2)}` : ''}

Provide validation analysis in JSON format:

{
  "overall": {
    "confidenceScore": 0-100,
    "status": "excellent|good|fair|poor",
    "totalRecords": ${extractedData.length},
    "validRecords": 0,
    "invalidRecords": 0
  },
  "issues": [
    {
      "type": "missing_field|duplicate|anomaly|inconsistency|invalid_format",
      "severity": "critical|high|medium|low",
      "field": "field name",
      "description": "what's wrong",
      "affectedRecords": [0, 1, 2]
    }
  ],
  "repair": {
    "applicable": true|false,
    "suggestedFixes": [
      {
        "issue": "issue description",
        "fix": "how to fix it",
        "confidence": 0.0-1.0
      }
    ],
    "selectorFixes": [
      {
        "field": "field name",
        "currentSelector": "current selector",
        "suggestedSelector": "better selector",
        "reason": "why it's better"
      }
    ],
    "schemaFixes": [
      {
        "field": "field name",
        "currentType": "current type",
        "suggestedType": "suggested type",
        "reason": "why change is needed"
      }
    ]
  },
  "rescrapeRecommendation": {
    "recommended": true|false,
    "strategy": "specific re-scrape strategy",
    "priority": "immediate|high|medium|low"
  }
}

Respond ONLY with valid JSON.
`;
