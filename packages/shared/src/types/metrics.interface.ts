export interface IMetricsRecorder {
    recordScrapeMetrics(success: boolean, scraperType: string, durationMs: number): void;
    recordLLMCall(provider: string, success: boolean, costUsd?: number): void;
    updateQueueMetrics(queueName: string, depth: number): void;
    recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void;
}
