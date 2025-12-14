import { LLMManager, createLLMManagerFromEnv } from './llm/manager.js';
import { costTracker } from './llm/retry-wrapper.js';
import { AICache, getAICache } from './cache/ai-cache.js';
import { PageUnderstandingModule } from './modules/page-understanding.js';
import { SelectorGenerationModule } from './modules/selector-generation.js';
import { SchemaInferenceModule } from './modules/schema-inference.js';
import { StrategyPlanningModule } from './modules/strategy-planning.js';
import { AntiBlockingModule } from './modules/anti-blocking.js';
import { DataValidationModule } from './modules/data-validation.js';
import { VisionModule } from './modules/vision.js';
import { AIModuleOptions, AIModuleResult } from './interfaces/ai-module.interface.js';
import { healingManager } from './healing/healing-manager.js';
import logger from '../utils/logger.js';

export type SafeAIResult<T> =
    | (AIModuleResult<T> & { success: true; error?: never })
    | { success: false; data: null; error: string; metadata: AIModuleResult<T>['metadata'] };


/**
 * AI Engine - Centralized orchestrator for all AI capabilities
 */
export class AIEngine {
    private llmManager: LLMManager;
    private cache: AICache;

    // AI Modules
    public readonly pageUnderstanding: PageUnderstandingModule;
    public readonly selectorGeneration: SelectorGenerationModule;
    public readonly schemaInference: SchemaInferenceModule;
    public readonly strategyPlanning: StrategyPlanningModule;
    public readonly antiBlocking: AntiBlockingModule;
    public readonly dataValidation: DataValidationModule;
    public readonly vision: VisionModule;

    constructor(llmManager?: LLMManager, cache?: AICache) {
        this.llmManager = llmManager || createLLMManagerFromEnv();
        this.cache = cache || getAICache();

        // Initialize all modules with shared dependencies
        this.pageUnderstanding = new PageUnderstandingModule(this.llmManager, this.cache);
        this.selectorGeneration = new SelectorGenerationModule(this.llmManager, this.cache);
        this.schemaInference = new SchemaInferenceModule(this.llmManager, this.cache);
        this.strategyPlanning = new StrategyPlanningModule(this.llmManager, this.cache);
        this.antiBlocking = new AntiBlockingModule(this.llmManager, this.cache);
        this.dataValidation = new DataValidationModule(this.llmManager, this.cache);
        this.vision = new VisionModule(this.llmManager, this.cache);

        logger.info('🧠 AI Engine initialized');
    }

    /**
     * Full AI Pipeline - Run all modules in sequence
     */
    async runPipeline(params: {
        url: string;
        html: string;
        extractedData?: unknown[];
        selectors?: Record<string, AIModuleResult<unknown>>;
        previousAttempts?: unknown[];
        features?: Array<'understand' | 'selectors' | 'schema' | 'strategy' | 'anti-blocking' | 'validate'>;
        options?: AIModuleOptions;
    }): Promise<{
        understanding?: SafeAIResult<any>;
        selectors?: Record<string, SafeAIResult<any>>;
        schema?: SafeAIResult<any>;
        strategy?: SafeAIResult<any>;
        antiBlocking?: SafeAIResult<any>;
        validation?: SafeAIResult<any>;
        metadata: {
            totalExecutionTime: number;
            modulesRun: string[];
            cacheHits: number;
            totalLLMCalls: number;
        };
    }> {
        const startTime = Date.now();
        const features = params.features || ['understand', 'schema', 'strategy', 'validate'];
        const results: {
            understanding?: SafeAIResult<any>;
            selectors?: Record<string, SafeAIResult<any>>;
            schema?: SafeAIResult<any>;
            strategy?: SafeAIResult<any>;
            antiBlocking?: SafeAIResult<any>;
            validation?: SafeAIResult<any>;
        } = {};
        const metadata = {
            modulesRun: [] as string[],
            cacheHits: 0,
            totalLLMCalls: 0,
        };

        try {
            // 1. Page Understanding
            if (features.includes('understand')) {
                try {
                    logger.info({ url: params.url }, 'Running page understanding...');
                    results.understanding = {
                        ...await this.pageUnderstanding.execute(
                            { url: params.url, html: params.html },
                            params.options
                        ), success: true
                    };
                    metadata.modulesRun.push('understanding');
                    if (results.understanding.metadata.cached) metadata.cacheHits++;
                    else metadata.totalLLMCalls++;
                } catch (error: unknown) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    logger.error({ error: err }, 'Page understanding module failed');
                    results.understanding = {
                        success: false,
                        data: null,
                        error: err.message,
                        metadata: {
                            module: 'page-understanding',
                            provider: 'unknown',
                            model: 'unknown',
                            tokenUsage: { prompt: 0, completion: 0, total: 0 },
                            cost: 0,
                            executionTime: 0,
                            cached: false,
                        }
                    };
                }
            }

            // 2. Selector Generation (if requested and primaryFields exist)
            if (features.includes('selectors') && results.understanding?.success) {
                try {
                    const primaryFields = results.understanding.data.primaryFields;
                    if (primaryFields && Object.keys(primaryFields).length > 0) {
                        logger.info('Running selector generation...');
                        results.selectors = {};

                        for (const [fieldKey, fieldInfo] of Object.entries(primaryFields)) {
                            try {
                                const selectorResult = await this.selectorGeneration.execute(
                                    {
                                        html: params.html,
                                        fieldName: fieldKey,
                                        context: (fieldInfo as any).description,
                                        url: params.url // Pass URL for healing
                                    },
                                    params.options
                                );
                                results.selectors[fieldKey] = { ...selectorResult, success: true };
                                if (selectorResult.metadata.cached) metadata.cacheHits++;
                                else metadata.totalLLMCalls++;
                            } catch (err: unknown) {
                                logger.warn({ field: fieldKey, error: err }, 'Selector generation failed for field');
                            }
                        }
                        metadata.modulesRun.push('selectors');
                    }
                } catch (error: unknown) {
                    logger.error({ error }, 'Selector generation module failed');
                }
            }

            // 3. Schema Inference
            if (features.includes('schema') && results.understanding?.success) {
                try {
                    logger.info('Running schema inference...');
                    results.schema = {
                        ...await this.schemaInference.execute(
                            {
                                pageUnderstanding: results.understanding.data,
                                extractedFields: params.extractedData || []
                            },
                            params.options
                        ), success: true
                    };
                    metadata.modulesRun.push('schema');
                    if (results.schema.metadata.cached) metadata.cacheHits++;
                    else metadata.totalLLMCalls++;
                } catch (error: unknown) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    logger.error({ error: err }, 'Schema inference module failed');
                    results.schema = {
                        success: false,
                        data: null,
                        error: err.message,
                        metadata: {
                            module: 'schema-inference',
                            provider: 'unknown',
                            model: 'unknown',
                            tokenUsage: { prompt: 0, completion: 0, total: 0 },
                            cost: 0,
                            executionTime: 0,
                            cached: false,
                        }
                    };
                }
            }

            // 4. Strategy Planning
            if (features.includes('strategy') && results.understanding) {
                logger.info('Running strategy planning...');
                results.strategy = {
                    ...await this.strategyPlanning.execute(
                        {
                            url: params.url,
                            pageUnderstanding: results.understanding.data,
                            previousAttempts: params.previousAttempts,
                        },
                        params.options
                    ), success: true
                };
                metadata.modulesRun.push('strategy');
                if (results.strategy.metadata.cached) metadata.cacheHits++;
                else metadata.totalLLMCalls++;
            }

            // 5. Data Validation
            if (features.includes('validate') && params.extractedData && results.schema) {
                logger.info('Running data validation...');
                results.validation = {
                    ...await this.dataValidation.execute(
                        {
                            schema: results.schema.data,
                            extractedData: params.extractedData,
                            selectors: params.selectors,
                        },
                        params.options
                    ), success: true
                };
                metadata.modulesRun.push('validation');
                if (results.validation.metadata.cached) metadata.cacheHits++;
                else metadata.totalLLMCalls++;

                // Feedback Loop for Healing
                if (results.selectors && results.validation.data && results.validation.data.fields) {
                    // Iterate through validated fields
                    for (const [fieldName, validation] of Object.entries(results.validation.data.fields) as any) {
                        const selectorResult = results.selectors[fieldName];
                        // We need the healing ID to report back. 
                        // If it came from HealingManager or was just saved, it should be in metadata.
                        const healingId = selectorResult?.metadata?.healingId;

                        if (healingId) {
                            // If field is valid, report success. If invalid, report failure.
                            const isSuccess = validation.isValid;
                            healingManager.reportOutcome(healingId, isSuccess).catch((err: any) =>
                                logger.warn({ err, healingId }, 'Failed to report healing outcome')
                            );
                        }
                    }
                }
            }

            return {
                ...results,
                metadata: {
                    ...metadata,
                    totalExecutionTime: Date.now() - startTime,
                },
            };
        } catch (error) {
            logger.error({ error, url: params.url }, 'AI pipeline failed');
            throw error;
        }
    }

    /**
     * Health check for all AI modules
     */
    async healthCheck(): Promise<Record<string, boolean>> {
        const health: Record<string, boolean> = {};

        // Check LLM providers
        const llmHealth = await this.llmManager.healthCheckAll();
        Object.entries(llmHealth).forEach(([provider, status]) => {
            health[`llm_${provider}`] = status;
        });

        // Check each module
        health.page_understanding = await this.pageUnderstanding.healthCheck();
        health.selector_generation = await this.selectorGeneration.healthCheck();
        health.schema_inference = await this.schemaInference.healthCheck();
        health.strategy_planning = await this.strategyPlanning.healthCheck();
        health.anti_blocking = await this.antiBlocking.healthCheck();
        health.data_validation = await this.dataValidation.healthCheck();

        // Check cache
        try {
            const stats = await this.cache.getStats();
            health.cache = stats.totalKeys !== undefined;
        } catch {
            health.cache = false;
        }

        return health;
    }

    /**
     * Get AI Engine statistics
     */
    async getStats(): Promise<{
        availableProviders: string[];
        cache: {
            totalKeys: number;
            memoryUsage: number;
        };
        modules: {
            name: string;
            healthy: boolean;
        }[];
        costs: {
            totalCost: number;
            totalTokens: number;
            callCount: number;
            byProvider: Record<string, { cost: number; tokens: number; calls: number }>;
        };
    }> {
        const cacheStats = await this.cache.getStats();
        const modules = [
            { name: 'page-understanding', module: this.pageUnderstanding },
            { name: 'selector-generation', module: this.selectorGeneration },
            { name: 'schema-inference', module: this.schemaInference },
            { name: 'strategy-planning', module: this.strategyPlanning },
            { name: 'anti-blocking', module: this.antiBlocking },
            { name: 'data-validation', module: this.dataValidation },
        ];

        const moduleHealth = await Promise.all(
            modules.map(async ({ name, module }) => ({
                name,
                healthy: await module.healthCheck(),
            }))
        );

        return {
            availableProviders: this.llmManager.getAvailableProviders(),
            cache: cacheStats,
            modules: moduleHealth,
            costs: costTracker.getStats(),
        };
    }

    /**
     * Get LLM cost statistics
     */
    getCostStats() {
        return costTracker.getStats();
    }

    /**
     * Reset LLM cost tracking
     */
    resetCostTracking(): void {
        costTracker.reset();
        logger.info('LLM cost tracking reset');
    }

    /**
     * Clear AI cache
     */
    async clearCache(): Promise<void> {
        await this.cache.clear();
        logger.info('AI cache cleared');
    }

    /**
     * Get the LLM manager for direct access
     */
    getLLMManager(): LLMManager {
        return this.llmManager;
    }
}

/**
 * Singleton instance
 */
let engineInstance: AIEngine | null = null;

export function getAIEngine(): AIEngine {
    if (!engineInstance) {
        engineInstance = new AIEngine();
    }
    return engineInstance;
}

export { AIModuleOptions, AIModuleResult };
