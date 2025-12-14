import { Request, Response } from 'express';
import { queueManager } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class JobController {
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
            const job = await queueManager.getJob(jobType, id);

            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }

            const state = await job.getState();
            const result = job.returnvalue;
            const error = job.failedReason;
            const progress = job.progress;

            res.json({
                success: true,
                data: {
                    id: job.id,
                    type: jobType,
                    state,
                    progress,
                    result,
                    error,
                    createdAt: job.timestamp,
                    finishedAt: job.finishedOn
                }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get job status');
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
