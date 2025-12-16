import { z } from 'zod';

/**
 * Page Understanding Output Schema
 */
export const PageUnderstandingSchema = z.object({
    pageType: z.enum([
        'job',
        'product',
        'event',
        'listing',
        'article',
        'business',
        'profile',
        'directory',
        'other',
    ]),
    confidence: z.number().min(0).max(1),
    sections: z.array(
        z.object({
            type: z.enum(['card', 'table', 'grid', 'list', 'component']),
            selector: z.string(),
            description: z.string(),
        })
    ),
    entities: z.array(
        z.object({
            type: z.string(),
            selector: z.string(),
            confidence: z.number().min(0).max(1),
        })
    ),
    primaryFields: z.record(
        z.string(),
        z.object({
            fieldName: z.string(),
            selector: z.string(),
            dataType: z.string(),
            importance: z.enum(['critical', 'high', 'medium', 'low']),
        })
    ),
    summary: z.string(),
});

export type PageUnderstanding = z.infer<typeof PageUnderstandingSchema>;

/**
 * Selector Generation Output Schema
 */
export const AISelectorSchema = z.object({
    fieldName: z.string(),
    primary: z.object({
        css: z.string(),
        xpath: z.string(),
        confidence: z.number().min(0).max(1),
    }),
    fallbacks: z.array(
        z.object({
            css: z.string(),
            xpath: z.string(),
            confidence: z.number().min(0).max(1),
            reason: z.string(),
        })
    ),
    selfHealingStrategy: z.object({
        attributes: z.array(z.string()),
        structures: z.array(z.string()),
        avoidance: z.array(z.string()),
    }),
});

export type AISelector = z.infer<typeof AISelectorSchema>;

/**
 * Schema Inference Output Schema
 */
export const AISchemaOutputSchema = z.object({
    schemaType: z.enum([
        'JobPosting',
        'Product',
        'Event',
        'LocalBusiness',
        'Person',
        'Article',
        'Organization',
        'Custom',
    ]),
    confidence: z.number().min(0).max(1),
    normalizedSchema: z.object({
        name: z.string(),
        requiredFields: z.array(z.string()),
        optionalFields: z.array(z.string()),
    }),
    fieldMapping: z.record(
        z.string(),
        z.object({
            sourceField: z.string(),
            targetField: z.string(),
            transform: z.string().optional(),
            dataType: z.string(),
        })
    ),
    recommendations: z.object({
        missingFields: z.array(z.string()),
        dataQualityIssues: z.array(z.string()),
        improvements: z.array(z.string()),
    }),
});

export type AISchemaOutput = z.infer<typeof AISchemaOutputSchema>;

/**
 * Strategy Planning Output Schema
 */
export const AIStrategySchema = z.object({
    recommendedMode: z.enum([
        'http-only',
        'headless-browser',
        'full-browser',
        'mobile-emulation',
        'api-sniffing',
        'infinite-scroll',
        'pagination',
    ]),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    configuration: z.object({
        scrollDepth: z.number().optional(),
        waitSelectors: z.array(z.string()).optional(),
        delays: z.object({ min: z.number(), max: z.number() }).optional(),
        retries: z.number().optional(),
        userAgent: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
    }),
    alternatives: z.array(
        z.object({
            mode: z.string(),
            confidence: z.number().min(0).max(1),
            when: z.string(),
        })
    ),
});

export type AIStrategy = z.infer<typeof AIStrategySchema>;

/**
 * Anti-Blocking Output Schema
 */
export const AntiBlockingSchema = z.object({
    blockDetected: z.boolean(),
    blockType: z.enum([
        'cloudflare',
        'bot-trap',
        'shadow-dom',
        'honeypot',
        'rate-limit',
        'captcha',
        'ip-block',
        'unknown',
    ]),
    confidence: z.number().min(0).max(1),
    recommendations: z.object({
        proxyRotation: z.object({
            enabled: z.boolean(),
            strategy: z.enum(['per-request', 'session-based', 'time-based']),
            minDelay: z.number(),
        }),
        headers: z.record(z.string(), z.string()),
        fingerprint: z.object({
            rotate: z.boolean(),
            profile: z.string(),
        }),
        timing: z.object({
            delays: z.object({ min: z.number(), max: z.number() }),
            retryStrategy: z.enum(['exponential', 'linear', 'fixed']),
        }),
        captcha: z.object({
            detected: z.boolean(),
            type: z.string().optional(),
            solveStrategy: z.string(),
        }),
    }),
});

export type AntiBlocking = z.infer<typeof AntiBlockingSchema>;

/**
 * Data Validation Output Schema
 */
export const ValidationSchema = z.object({
    overall: z.object({
        confidenceScore: z.number().min(0).max(100),
        status: z.enum(['excellent', 'good', 'fair', 'poor']),
        totalRecords: z.number(),
        validRecords: z.number(),
        invalidRecords: z.number(),
    }),
    issues: z.array(
        z.object({
            type: z.enum(['missing_field', 'duplicate', 'anomaly', 'inconsistency', 'invalid_format']),
            severity: z.enum(['critical', 'high', 'medium', 'low']),
            field: z.string(),
            description: z.string(),
            affectedRecords: z.array(z.number()),
        })
    ),
    repair: z.object({
        applicable: z.boolean(),
        suggestedFixes: z.array(
            z.object({
                issue: z.string(),
                fix: z.string(),
                confidence: z.number().min(0).max(1),
            })
        ),
        selectorFixes: z.array(
            z.object({
                field: z.string(),
                currentSelector: z.string(),
                suggestedSelector: z.string(),
                reason: z.string(),
            })
        ),
        schemaFixes: z.array(
            z.object({
                field: z.string(),
                currentType: z.string(),
                suggestedType: z.string(),
                reason: z.string(),
            })
        ),
    }),
    rescrapeRecommendation: z.object({
        recommended: z.boolean(),
        strategy: z.string(),
        priority: z.enum(['immediate', 'high', 'medium', 'low']),
    }),
});

export type Validation = z.infer<typeof ValidationSchema>;

/**
 * Action Engine Schemas
 */
export const ActionPlanSchema = z.object({
    actions: z.array(
        z.object({
            type: z.enum(['click', 'fill', 'wait', 'scroll', 'select', 'hover']),
            selector: z.string().optional(),
            value: z.string().optional(),
            description: z.string(), // Reason for this action
            mandatory: z.boolean().default(true)
        })
    ),
    confidence: z.number().min(0).max(1),
    reasoning: z.string()
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ActionStep = ActionPlan['actions'][0];
