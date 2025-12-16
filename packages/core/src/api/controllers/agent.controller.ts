import { Request, Response } from 'express';
import { AgentOrchestrator } from '../../orchestrator/agent.orchestrator.js';
import { logger } from '@nx-scraper/shared';
import { AgentExecuteSchema } from '@nx-scraper/shared';
import { successResponse, errorResponse } from '@nx-scraper/shared';
import { z } from 'zod';
import { toAppError, logError } from '@nx-scraper/shared';

export class AgentController {
    private orchestrator: AgentOrchestrator;

    constructor() {
        this.orchestrator = new AgentOrchestrator();
    }

    /**
     * Execute an Agentic Scrape
     * POST /api/v1/agent/execute
     */
    async execute(req: Request, res: Response) {
        try {
            // Validate request
            const validated = AgentExecuteSchema.parse(req.body);

            const result = await this.orchestrator.execute({
                url: validated.url,
                goal: validated.goal,
                mode: validated.mode,
                model: validated.model,
                provider: validated.provider
            });

            res.json(successResponse(result, { requestId: req.id }));
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json(errorResponse(
                    'VALIDATION_ERROR',
                    'Invalid request parameters',
                    error.issues.map((err: z.ZodIssue) => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                ));
            }

            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'agent/execute' });

            res.status(appError.statusCode).json(errorResponse(
                appError.code,
                appError.message || 'Agent execution failed'
            ));
        }
    }
}
