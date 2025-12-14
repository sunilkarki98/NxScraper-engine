import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    AIModuleOptions,
    AIModuleResult,
    PageUnderstanding,
    AISelector,
    AISchemaOutput,
    AIStrategy,
    AntiBlocking,
    Validation,
    PipelineInput,
    PipelineResult,
    EngineStats,
    HealthCheckResult,
    CostStats,
} from './types';

// Re-export types for easy consumption
export * from './types';

/**
 * SDK Configuration
 */
export interface NxScraperConfig {
    /** API key for authentication (optional for local/self-hosted) */
    apiKey?: string;
    /** Base URL of the API server */
    baseUrl?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Custom headers to include in all requests */
    headers?: Record<string, string>;
}

/**
 * API Error structure
 */
export interface APIError {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
}

/**
 * NxScraper SDK Client
 * 
 * @example
 * ```typescript
 * const client = new NxScraperClient({
 *     baseUrl: 'http://localhost:3000/api/v1',
 *     apiKey: 'your-api-key' // optional
 * });
 * 
 * // Run full AI pipeline
 * const result = await client.ai.pipeline({
 *     url: 'https://example.com',
 *     html: '<html>...</html>',
 *     features: ['understand', 'selectors', 'schema']
 * });
 * ```
 */
export class NxScraperClient {
    private client: AxiosInstance;

    /** AI capabilities */
    public readonly ai: AIResource;

    /** System operations */
    public readonly system: SystemResource;

    constructor(config: NxScraperConfig = {}) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...config.headers,
        };

        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        this.client = axios.create({
            baseURL: config.baseUrl || 'http://localhost:3000/api/v1',
            timeout: config.timeout || 60000,
            headers,
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response: import('axios').AxiosResponse) => response,
            (error: AxiosError<APIError>) => {
                const apiError: APIError = {
                    code: error.response?.data?.code || 'UNKNOWN_ERROR',
                    message: error.response?.data?.message || error.message,
                    details: error.response?.data?.details,
                };
                return Promise.reject(apiError);
            }
        );

        this.ai = new AIResource(this.client);
        this.system = new SystemResource(this.client);
    }
}

/**
 * AI Resource - All AI-related operations
 */
class AIResource {
    constructor(private client: AxiosInstance) { }

    /**
     * Run the full AI pipeline
     */
    async pipeline(params: PipelineInput): Promise<PipelineResult> {
        const response = await this.client.post<PipelineResult>('/ai/pipeline', params);
        return response.data;
    }

    /**
     * Analyze page structure and content
     */
    async understandPage(
        url: string,
        html: string,
        options?: AIModuleOptions
    ): Promise<AIModuleResult<PageUnderstanding>> {
        const response = await this.client.post<AIModuleResult<PageUnderstanding>>(
            '/ai/understand',
            { url, html, options }
        );
        return response.data;
    }

    /**
     * Generate CSS/XPath selectors for a field
     */
    async generateSelectors(
        html: string,
        fieldName: string,
        exampleValues?: string[],
        context?: string,
        options?: AIModuleOptions
    ): Promise<AIModuleResult<AISelector>> {
        const response = await this.client.post<AIModuleResult<AISelector>>(
            '/ai/selectors',
            { html, fieldName, exampleValues, context, options }
        );
        return response.data;
    }

    /**
     * Infer data schema from page understanding and extracted fields
     */
    async inferSchema(
        pageUnderstanding: PageUnderstanding,
        extractedFields: Record<string, any>,
        options?: AIModuleOptions
    ): Promise<AIModuleResult<AISchemaOutput>> {
        const response = await this.client.post<AIModuleResult<AISchemaOutput>>(
            '/ai/schema',
            { pageUnderstanding, extractedFields, options }
        );
        return response.data;
    }

    /**
     * Plan optimal scraping strategy
     */
    async planStrategy(
        url: string,
        pageUnderstanding: PageUnderstanding,
        previousAttempts?: Array<{ mode: string; success: boolean; errorLog: string }>,
        options?: AIModuleOptions
    ): Promise<AIModuleResult<AIStrategy>> {
        const response = await this.client.post<AIModuleResult<AIStrategy>>(
            '/ai/strategy',
            { url, pageUnderstanding, previousAttempts, options }
        );
        return response.data;
    }

    /**
     * Analyze blocking and get countermeasures
     */
    async analyzeBlocking(
        errorLog: string,
        statusCode?: number,
        responseBody?: string,
        requestHeaders?: Record<string, string>,
        options?: AIModuleOptions
    ): Promise<AIModuleResult<AntiBlocking>> {
        const response = await this.client.post<AIModuleResult<AntiBlocking>>(
            '/ai/anti-blocking',
            { errorLog, statusCode, responseBody, requestHeaders, options }
        );
        return response.data;
    }

    /**
     * Validate extracted data quality
     */
    async validateData(
        schema: AISchemaOutput,
        extractedData: any[],
        selectors?: AISelector[],
        options?: AIModuleOptions
    ): Promise<AIModuleResult<Validation>> {
        const response = await this.client.post<AIModuleResult<Validation>>(
            '/ai/validate',
            { schema, extractedData, selectors, options }
        );
        return response.data;
    }
}

/**
 * System Resource - Health checks, stats, and system operations
 */
class SystemResource {
    constructor(private client: AxiosInstance) { }

    /**
     * Get AI engine health status
     */
    async healthCheck(): Promise<HealthCheckResult> {
        const response = await this.client.get<HealthCheckResult>('/ai/health');
        return response.data;
    }

    /**
     * Get AI engine statistics
     */
    async getStats(): Promise<EngineStats> {
        const response = await this.client.get<{ stats: EngineStats }>('/ai/health');
        return response.data.stats;
    }

    /**
     * Get LLM cost tracking statistics
     */
    async getCostStats(): Promise<CostStats> {
        const stats = await this.getStats();
        return stats.costs;
    }
}

// Default export for convenience
export default NxScraperClient;
