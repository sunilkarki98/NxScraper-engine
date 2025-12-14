/**
 * SDK Types - Shared type definitions for NxScraper SDK
 */

// ============= LLM Types =============

export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    systemPrompt?: string;
}

export interface LLMResponse {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}

// ============= AI Module Types =============

export interface AIModuleOptions {
    provider?: string;
    model?: string;
    useCache?: boolean;
    cacheTTL?: number;
    temperature?: number;
    timeout?: number;
}

export interface AIModuleResult<T> {
    data: T;
    metadata: {
        module: string;
        provider: string;
        model: string;
        executionTime: number;
        cached: boolean;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        };
        confidence?: number;
    };
}

// ============= Page Understanding =============

export type PageType = 'job' | 'product' | 'event' | 'listing' | 'article' | 'business' | 'profile' | 'directory' | 'other';
export type SectionType = 'card' | 'table' | 'grid' | 'list' | 'component';
export type ImportanceLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PageSection {
    type: SectionType;
    selector: string;
    description: string;
}

export interface PageEntity {
    type: string;
    selector: string;
    confidence: number;
}

export interface PrimaryField {
    fieldName: string;
    selector: string;
    dataType: string;
    importance: ImportanceLevel;
}

export interface PageUnderstanding {
    pageType: PageType;
    confidence: number;
    sections: PageSection[];
    entities: PageEntity[];
    primaryFields: Record<string, PrimaryField>;
    summary: string;
}

// ============= Selector Generation =============

export interface SelectorPrimary {
    css: string;
    xpath: string;
    confidence: number;
}

export interface SelectorFallback extends SelectorPrimary {
    reason: string;
}

export interface SelfHealingStrategy {
    attributes: string[];
    structures: string[];
    avoidance: string[];
}

export interface AISelector {
    fieldName: string;
    primary: SelectorPrimary;
    fallbacks: SelectorFallback[];
    selfHealingStrategy: SelfHealingStrategy;
}

// ============= Schema Inference =============

export type SchemaType = 'JobPosting' | 'Product' | 'Event' | 'LocalBusiness' | 'Person' | 'Article' | 'Organization' | 'Custom';

export interface NormalizedSchema {
    name: string;
    requiredFields: string[];
    optionalFields: string[];
}

export interface FieldMapping {
    sourceField: string;
    targetField: string;
    transform?: string;
    dataType: string;
}

export interface SchemaRecommendations {
    missingFields: string[];
    dataQualityIssues: string[];
    improvements: string[];
}

export interface AISchemaOutput {
    schemaType: SchemaType;
    confidence: number;
    normalizedSchema: NormalizedSchema;
    fieldMapping: Record<string, FieldMapping>;
    recommendations: SchemaRecommendations;
}

// ============= Strategy Planning =============

export type ScrapingMode = 'http-only' | 'headless-browser' | 'full-browser' | 'mobile-emulation' | 'api-sniffing' | 'infinite-scroll' | 'pagination';

export interface StrategyConfiguration {
    scrollDepth?: number;
    waitSelectors?: string[];
    delays?: { min: number; max: number };
    retries?: number;
    userAgent?: string;
    headers?: Record<string, string>;
}

export interface StrategyAlternative {
    mode: string;
    confidence: number;
    when: string;
}

export interface AIStrategy {
    recommendedMode: ScrapingMode;
    confidence: number;
    reasoning: string;
    configuration: StrategyConfiguration;
    alternatives: StrategyAlternative[];
}

// ============= Anti-Blocking =============

export type BlockType = 'cloudflare' | 'bot-trap' | 'shadow-dom' | 'honeypot' | 'rate-limit' | 'captcha' | 'ip-block' | 'unknown';
export type ProxyStrategy = 'per-request' | 'session-based' | 'time-based';
export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

export interface AntiBlockingRecommendations {
    proxyRotation: {
        enabled: boolean;
        strategy: ProxyStrategy;
        minDelay: number;
    };
    headers: Record<string, string>;
    fingerprint: {
        rotate: boolean;
        profile: string;
    };
    timing: {
        delays: { min: number; max: number };
        retryStrategy: RetryStrategy;
    };
    captcha: {
        detected: boolean;
        type?: string;
        solveStrategy: string;
    };
}

export interface AntiBlocking {
    blockDetected: boolean;
    blockType: BlockType;
    confidence: number;
    recommendations: AntiBlockingRecommendations;
}

// ============= Data Validation =============

export type ValidationStatus = 'excellent' | 'good' | 'fair' | 'poor';
export type IssueType = 'missing_field' | 'duplicate' | 'anomaly' | 'inconsistency' | 'invalid_format';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type Priority = 'immediate' | 'high' | 'medium' | 'low';

export interface ValidationOverall {
    confidenceScore: number;
    status: ValidationStatus;
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
}

export interface ValidationIssue {
    type: IssueType;
    severity: IssueSeverity;
    field: string;
    description: string;
    affectedRecords: number[];
}

export interface SuggestedFix {
    issue: string;
    fix: string;
    confidence: number;
}

export interface SelectorFix {
    field: string;
    currentSelector: string;
    suggestedSelector: string;
    reason: string;
}

export interface SchemaFix {
    field: string;
    currentType: string;
    suggestedType: string;
    reason: string;
}

export interface RepairSuggestions {
    applicable: boolean;
    suggestedFixes: SuggestedFix[];
    selectorFixes: SelectorFix[];
    schemaFixes: SchemaFix[];
}

export interface RescrapeRecommendation {
    recommended: boolean;
    strategy: string;
    priority: Priority;
}

export interface Validation {
    overall: ValidationOverall;
    issues: ValidationIssue[];
    repair: RepairSuggestions;
    rescrapeRecommendation: RescrapeRecommendation;
}

// ============= Pipeline Types =============

export interface PipelineInput {
    url: string;
    html: string;
    extractedData?: any[];
    selectors?: AISelector[];
    previousAttempts?: Array<{
        mode: string;
        success: boolean;
        errorLog: string;
    }>;
    features?: Array<'understand' | 'selectors' | 'schema' | 'strategy' | 'anti-blocking' | 'validate'>;
    options?: AIModuleOptions;
}

export interface PipelineResult {
    understanding?: AIModuleResult<PageUnderstanding>;
    selectors?: Record<string, AIModuleResult<AISelector>>;
    schema?: AIModuleResult<AISchemaOutput>;
    strategy?: AIModuleResult<AIStrategy>;
    antiBlocking?: AIModuleResult<AntiBlocking>;
    validation?: AIModuleResult<Validation>;
    metadata: {
        totalExecutionTime: number;
        modulesRun: string[];
        cacheHits: number;
        totalLLMCalls: number;
    };
}

// ============= Cost Tracking =============

export interface CostStats {
    totalCost: number;
    totalTokens: number;
    callCount: number;
    byProvider: Record<string, {
        cost: number;
        tokens: number;
        calls: number;
    }>;
}

// ============= Engine Stats =============

export interface EngineStats {
    availableProviders: string[];
    cache: {
        totalKeys: number;
        memoryUsage: number;
    };
    modules: Array<{
        name: string;
        healthy: boolean;
    }>;
    costs: CostStats;
}

// ============= Health Check =============

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    stats: EngineStats;
}
