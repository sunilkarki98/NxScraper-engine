/**
 * AI Module - Main entry point
 * 
 * This module provides LLM-powered intelligence for web scraping including:
 * - Page Understanding: Analyze HTML to identify page structure and entities
 * - Selector Generation: Create robust CSS/XPath selectors with fallbacks
 * - Schema Inference: Map extracted data to Schema.org types
 * - Strategy Planning: Recommend optimal scraping approaches
 * - Anti-Blocking: Detect and counter bot detection systems
 * - Data Validation: Validate and repair extracted data
 */

// Core AI Engine
export { AIEngine, getAIEngine } from './ai-engine.js';

// LLM Providers & Manager
export { LLMManager, createLLMManagerFromEnv } from './llm/manager.js';
export { LLMProvider, LLMOptions, LLMResponse } from './llm/interfaces.js';
export { OpenAIProvider } from './llm/openai.js';
export { AnthropicProvider } from './llm/anthropic.js';
export { GeminiProvider } from './llm/gemini.js';
export { DeepSeekProvider } from './llm/deepseek.js';
export { RetryingLLMProvider, costTracker, CostEntry, TokenUsage, RetryConfig } from './llm/retry-wrapper.js';

// AI Modules
export { PageUnderstandingModule, PageUnderstandingInput } from './modules/page-understanding.js';
export { SelectorGenerationModule, SelectorGenerationInput } from './modules/selector-generation.js';
export { SchemaInferenceModule, SchemaInferenceInput } from './modules/schema-inference.js';
export { StrategyPlanningModule, StrategyPlanningInput } from './modules/strategy-planning.js';
export { AntiBlockingModule, AntiBlockingInput } from './modules/anti-blocking.js';
export { DataValidationModule, DataValidationInput } from './modules/data-validation.js';

// Interfaces
export { IAIModule, AIModuleOptions, AIModuleResult } from './interfaces/ai-module.interface.js';

// Schemas (Zod schemas for validation)
export {
    PageUnderstandingSchema,
    PageUnderstanding,
    AISelectorSchema,
    AISelector,
    AISchemaOutputSchema,
    AISchemaOutput,
    AIStrategySchema,
    AIStrategy,
    AntiBlockingSchema,
    AntiBlocking,
    ValidationSchema,
    Validation,
} from './schemas/ai-outputs.schema.js';

// Cache
export { AICache, getAICache } from './cache/ai-cache.js';

// Prompts (for customization)
export {
    SELECTOR_GENERATION_SYSTEM_PROMPT,
    SELECTOR_GENERATION_USER_PROMPT,
    SCHEMA_INFERENCE_SYSTEM_PROMPT,
    SCHEMA_INFERENCE_USER_PROMPT,
    STRATEGY_PLANNING_SYSTEM_PROMPT,
    STRATEGY_PLANNING_USER_PROMPT,
    ANTI_BLOCKING_SYSTEM_PROMPT,
    ANTI_BLOCKING_USER_PROMPT,
    DATA_VALIDATION_SYSTEM_PROMPT,
    DATA_VALIDATION_USER_PROMPT,
} from './prompts/all-prompts.js';

export {
    PAGE_UNDERSTANDING_SYSTEM_PROMPT,
    PAGE_UNDERSTANDING_USER_PROMPT,
} from './prompts/page-understanding.prompt.js';
