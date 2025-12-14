import { IMetricsRecorder } from '@nx-scraper/shared/types/metrics.interface';
import {
    recordScrapeMetrics,
    recordLLMCall,
    updateQueueMetrics,
    recordError
} from './metrics.js';

export class MetricsAdapter implements IMetricsRecorder {
    recordScrapeMetrics(success: boolean, scraperType: string, durationMs: number): void {
        recordScrapeMetrics(success, scraperType, durationMs);
    }

    recordLLMCall(provider: string, success: boolean, costUsd?: number): void {
        recordLLMCall(provider, success, costUsd);
    }

    updateQueueMetrics(queueName: string, depth: number): void {
        updateQueueMetrics(queueName, depth);
    }

    recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
        recordError(errorType, severity);
    }
}

export const metricsAdapter = new MetricsAdapter();
