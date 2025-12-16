
export interface PlanStep {
    id: number;
    type: 'search' | 'scrape' | 'browse' | 'extract' | 'compare' | 'map' | 'filter' | 'crawl';
    description: string;
    params?: Record<string, any>;
}

export interface ExecutionStage {
    id: number;
    steps: PlanStep[];
}

export interface ExecutionPlan {
    goal: string;
    stages: ExecutionStage[];
    estimatedCost?: number;
}

export interface AgentContext {
    goal: string;
    currentUrl?: string;
    // Map of step ID to its result
    history: Record<number, StepResult>;
    // Accumulated data from extract steps
    data: Record<string, any>;
    // Shared state for sharing data between steps
    state: Record<string, any>;
    // Metadata for tracking
    startTime: number;
    maxRetries: number;
}

export interface StepResult {
    success: boolean;
    data?: any;
    error?: string;
    url?: string;
    metadata?: any;
    stepId: number;
}

export interface AIModuleOptions {
    model?: string;
    imageDetail?: 'low' | 'high' | 'auto';
    provider?: string;
    temperature?: number;
}

export interface AIModuleResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
        model?: string;
        tokens?: number;
        cost?: number;
        processingTime?: number;
    };
}

export interface IAIModule<Input = any, Output = any> {
    name: string;
    execute(input: Input, options?: AIModuleOptions): Promise<AIModuleResult<Output>>;
}
