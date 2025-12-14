import { Request, Response } from 'express';
import { getAIEngine } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { toAppError, logError } from '@nx-scraper/shared';

export class AIController {
    private aiEngine = getAIEngine();

    /**
     * Run the full AI pipeline
     */
    async runPipeline(req: Request, res: Response) {
        try {
            const { url, html, extractedData, selectors, previousAttempts, features, options } = req.body;

            if (!url || !html) {
                return res.status(400).json({ error: 'URL and HTML content are required' });
            }

            const result = await this.aiEngine.runPipeline({
                url,
                html,
                extractedData,
                selectors,
                previousAttempts,
                features,
                options
            });

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai/runPipeline' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Page Understanding Endpoint
     */
    async understandPage(req: Request, res: Response) {
        try {
            const { url, html, options } = req.body;

            if (!url || !html) {
                return res.status(400).json({ error: 'URL and HTML content are required' });
            }

            const result = await this.aiEngine.pageUnderstanding.execute(
                { url, html },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai/understandPage' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Selector Generation Endpoint
     */
    async generateSelectors(req: Request, res: Response) {
        try {
            const { html, fieldName, context, options } = req.body;

            if (!html || !fieldName) {
                return res.status(400).json({ error: 'HTML and fieldName are required' });
            }

            const result = await this.aiEngine.selectorGeneration.execute(
                { html, fieldName, context },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Schema Inference Endpoint
     */
    async inferSchema(req: Request, res: Response) {
        try {
            const { pageUnderstanding, extractedFields, options } = req.body;

            if (!pageUnderstanding || !extractedFields) {
                return res.status(400).json({ error: 'Page understanding and extracted fields are required' });
            }

            const result = await this.aiEngine.schemaInference.execute(
                { pageUnderstanding, extractedFields },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Strategy Planning Endpoint
     */
    async planStrategy(req: Request, res: Response) {
        try {
            const { url, pageUnderstanding, previousAttempts, options } = req.body;

            if (!url || !pageUnderstanding) {
                return res.status(400).json({ error: 'URL and page understanding are required' });
            }

            const result = await this.aiEngine.strategyPlanning.execute(
                { url, pageUnderstanding, previousAttempts },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Anti-Blocking Analysis Endpoint
     */
    async analyzeBlocking(req: Request, res: Response) {
        try {
            const { url, html, statusCode, headers, options } = req.body;

            if (!url || !html) {
                return res.status(400).json({ error: 'URL and HTML are required' });
            }

            const result = await this.aiEngine.antiBlocking.execute(
                { url, html, statusCode, headers },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Data Validation Endpoint
     */
    async validateData(req: Request, res: Response) {
        try {
            const { schema, extractedData, selectors, options } = req.body;

            if (!schema || !extractedData) {
                return res.status(400).json({ error: 'Schema and extracted data are required' });
            }

            const result = await this.aiEngine.dataValidation.execute(
                { schema, extractedData, selectors },
                options
            );

            res.json(result);
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * AI Engine Health Check
     */
    async healthCheck(req: Request, res: Response) {
        try {
            const health = await this.aiEngine.healthCheck();
            const stats = await this.aiEngine.getStats();

            const allHealthy = Object.values(health).every(v => v === true);

            res.status(allHealthy ? 200 : 503).json({
                status: allHealthy ? 'healthy' : 'degraded',
                components: health,
                stats
            });
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Get LLM cost statistics
     */
    async getCostStats(req: Request, res: Response) {
        try {
            const stats = this.aiEngine.getCostStats();
            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Clear AI cache
     */
    async clearCache(req: Request, res: Response) {
        try {
            await this.aiEngine.clearCache();
            res.json({
                success: true,
                message: 'AI cache cleared successfully',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }

    /**
     * Reset cost tracking
     */
    async resetCostTracking(req: Request, res: Response) {
        try {
            this.aiEngine.resetCostTracking();
            res.json({
                success: true,
                message: 'Cost tracking reset successfully',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'ai/resetCostTracking' });
            res.status(appError.statusCode).json({ error: appError.message });
        }
    }
}
