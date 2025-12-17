import { Request, Response } from 'express';
import { container, Tokens, QueueManager } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class JobController {
    private queueManager: QueueManager;

    constructor(queueManager?: QueueManager) {
        this.queueManager = queueManager || container.resolve(Tokens.QueueManager);
    }

    /**
     * Get job status and result
     */
    async getJobStatus(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { type } = req.query; // 'scrape' or 'ai-pipeline'

            if (!id) {
                return res.status(400).json({ success: false, error: 'Job ID is required' });
            }

            const jobType = (type as 'scrape' | 'ai-pipeline') || 'scrape';
            const job = await this.queueManager.getJob(jobType, id);

            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }

            const state = await job.getState();
            const result = job.returnvalue;
            const error = job.failedReason;
            const progress = job.progress;

            // CRITICAL: Include full error details for failed jobs
            const responseData = {
                id: job.id,
                type: jobType,
                state: state || 'unknown',
                progress: progress || 0,
                result: result,
                createdAt: job.timestamp,
                finishedAt: job.finishedOn,
                // Include error details if job failed
                error: error ? {
                    message: error,
                    stack: job.stacktrace, // Assuming stacktrace is available on the job object
                    type: job.data?.errorName, // Assuming errorName is stored in job.data
                    failurePoint: job.data?.failurePoint // Assuming failurePoint is stored in job.data
                } : undefined
            };

            return res.json({ success: true, data: responseData });
        } catch (error) {
            logger.error({ error }, 'Failed to get job status');
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
