import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobController } from '@core/api/controllers/job.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';
import { container, Tokens } from '@nx-scraper/shared';

describe('JobController', () => {
    let controller: JobController;
    let mockQueueManager: any;

    beforeEach(() => {
        const mockDragonfly = {
            getClient: vi.fn(),
            getSubscriber: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            execute: vi.fn()
        };
        container.register(Tokens.Dragonfly, { useValue: mockDragonfly });

        // Mock QueueManager instance
        mockQueueManager = {
            getJob: vi.fn()
        };

        vi.clearAllMocks();
        // Inject mockQueueManager into the controller
        controller = new JobController(mockQueueManager);
    });

    describe('getJobStatus', () => {
        const mockJob = {
            id: 'job-123',
            timestamp: 1234567890,
            finishedOn: 1234567900,
            getState: vi.fn(),
            returnvalue: null,
            failedReason: null,
            progress: 0
        };

        describe('validation', () => {
            it('should return 400 when job ID is missing', async () => {
                const req = createMockRequest({}, {}, {});
                const res = createMockResponse();

                await controller.getJobStatus(req, res);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Job ID is required'
                });
            });

            it('should return 404 when job not found', async () => {
                const req = createMockRequest({}, { type: 'scrape' }, { id: 'non-existent' });
                const res = createMockResponse();

                mockQueueManager.getJob.mockResolvedValue(null);

                await controller.getJobStatus(req, res);

                expect(res.status).toHaveBeenCalledWith(404);
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Job not found'
                });
            });
        });

        describe('successful retrieval', () => {
            it('should return job status for completed job', async () => {
                const req = createMockRequest({}, { type: 'scrape' }, { id: 'job-123' });
                const res = createMockResponse();

                const completedJob = {
                    ...mockJob,
                    returnvalue: { success: true, data: 'test data' },
                    getState: vi.fn().mockResolvedValue('completed')
                };

                mockQueueManager.getJob.mockResolvedValue(completedJob as any);

                await controller.getJobStatus(req, res);

                expect(mockQueueManager.getJob).toHaveBeenCalledWith('scrape', 'job-123');
                expect(res.json).toHaveBeenCalledWith({
                    success: true,
                    data: {
                        id: 'job-123',
                        type: 'scrape',
                        state: 'completed',
                        progress: 0,
                        result: { success: true, data: 'test data' },
                        error: null,
                        createdAt: 1234567890,
                        finishedAt: 1234567900
                    }
                });
            });

            it('should return job status for failed job', async () => {
                const req = createMockRequest({}, { type: 'scrape' }, { id: 'job-456' });
                const res = createMockResponse();

                const failedJob = {
                    ...mockJob,
                    id: 'job-456',
                    failedReason: 'Connection timeout',
                    getState: vi.fn().mockResolvedValue('failed')
                };

                mockQueueManager.getJob.mockResolvedValue(failedJob as any);

                await controller.getJobStatus(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: true,
                        data: expect.objectContaining({
                            state: 'failed',
                            error: 'Connection timeout'
                        })
                    })
                );
            });

            it('should return job status for active job with progress', async () => {
                const req = createMockRequest({}, {}, { id: 'job-789' });
                const res = createMockResponse();

                const activeJob = {
                    ...mockJob,
                    id: 'job-789',
                    progress: 45,
                    getState: vi.fn().mockResolvedValue('active')
                };

                mockQueueManager.getJob.mockResolvedValue(activeJob as any);

                await controller.getJobStatus(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: true,
                        data: expect.objectContaining({
                            state: 'active',
                            progress: 45
                        })
                    })
                );
            });

            it('should default to scrape type when not specified', async () => {
                const req = createMockRequest({}, {}, { id: 'job-123' });
                const res = createMockResponse();

                const job = {
                    ...mockJob,
                    getState: vi.fn().mockResolvedValue('waiting')
                };

                mockQueueManager.getJob.mockResolvedValue(job as any);

                await controller.getJobStatus(req, res);

                expect(mockQueueManager.getJob).toHaveBeenCalledWith('scrape', 'job-123');
            });

            it('should handle ai-pipeline job type', async () => {
                const req = createMockRequest({}, { type: 'ai-pipeline' }, { id: 'ai-job-123' });
                const res = createMockResponse();

                const job = {
                    ...mockJob,
                    getState: vi.fn().mockResolvedValue('completed')
                };

                mockQueueManager.getJob.mockResolvedValue(job as any);

                await controller.getJobStatus(req, res);

                expect(mockQueueManager.getJob).toHaveBeenCalledWith('ai-pipeline', 'ai-job-123');
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            type: 'ai-pipeline'
                        })
                    })
                );
            });
        });

        describe('error handling', () => {
            it('should handle queue manager errors', async () => {
                const req = createMockRequest({}, {}, { id: 'job-123' });
                const res = createMockResponse();

                mockQueueManager.getJob.mockRejectedValue(new Error('Queue error'));

                await controller.getJobStatus(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Internal server error'
                });
            });

            it('should handle getState errors', async () => {
                const req = createMockRequest({}, {}, { id: 'job-123' });
                const res = createMockResponse();

                const job = {
                    ...mockJob,
                    getState: vi.fn().mockRejectedValue(new Error('State error'))
                };

                mockQueueManager.getJob.mockResolvedValue(job as any);

                await controller.getJobStatus(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });

        describe('edge cases', () => {
            it('should handle job with no timestamps', async () => {
                const req = createMockRequest({}, {}, { id: 'job-123' });
                const res = createMockResponse();

                const job = {
                    id: 'job-123',
                    timestamp: undefined,
                    finishedOn: undefined,
                    getState: vi.fn().mockResolvedValue('waiting'),
                    returnvalue: null,
                    failedReason: null,
                    progress: 0
                };

                mockQueueManager.getJob.mockResolvedValue(job as any);

                await controller.getJobStatus(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            createdAt: undefined,
                            finishedAt: undefined
                        })
                    })
                );
            });

            it('should handle numeric job IDs', async () => {
                const req = createMockRequest({}, {}, { id: '12345' });
                const res = createMockResponse();

                const job = {
                    ...mockJob,
                    id: '12345',
                    getState: vi.fn().mockResolvedValue('completed')
                };

                mockQueueManager.getJob.mockResolvedValue(job as any);

                await controller.getJobStatus(req, res);

                expect(mockQueueManager.getJob).toHaveBeenCalledWith('scrape', '12345');
            });
        });
    });
});
