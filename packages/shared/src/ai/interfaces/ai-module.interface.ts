/**
 * Base interface for all AI modules
 * Ensures consistency across the AI system
 */
export interface IAIModule<TInput, TOutput, TOptions = {}> {
    /**
     * Module name for logging and metrics
     */
    readonly name: string;

    /**
     * Execute the AI module
     */
    execute(input: TInput, options?: TOptions): Promise<AIModuleResult<TOutput>>;

    /**
     * Validate input before execution
     */
    validate(input: TInput): Promise<boolean>;

    /**
     * Health check for the module
     */
    healthCheck(): Promise<boolean>;
}

/**
 * AI Module execution options
 */
export interface AIModuleOptions {
    /** LLM provider to use */
    provider?: string;

    /** Specific model to use */
    model?: string;

    /** Enable/disable caching */
    useCache?: boolean;

    /** Cache TTL in seconds */
    cacheTTL?: number;

    /** Temperature (0-1) */
    temperature?: number;

    /** Timeout in milliseconds */
    timeout?: number;
}

/**
 * AI Module execution result with metadata
 */
export interface AIModuleResult<T> {
    /** The actual result */
    data: T;

    /** Metadata about execution */
    metadata: {
        /** Module that produced this result */
        module: string;

        /** LLM provider used */
        provider: string;

        /** Model used */
        model: string;

        /** Execution time in ms */
        executionTime: number;

        /** Whether result came from cache */
        cached: boolean;

        /** Token usage (if applicable) */
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        };

        /** Confidence score (0-1) */
        confidence?: number;

        /** ID of the healing selector used/created */
        healingId?: string;

        /** Cost in USD */
        cost?: number;
    };
}
