import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController } from '@core/api/controllers/agent.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';

// Mock AgentOrchestrator
const mockExecute = vi.fn();

vi.mock('@core/orchestrator/agent.orchestrator.js', () => {
    return {
        AgentOrchestrator: class {
            execute = mockExecute;
        }
    };
});

import { container, Tokens } from '@nx-scraper/shared';

describe('AgentController', () => {
    let controller: AgentController;

    beforeEach(() => {
        // Register mock Dragonfly to satisfy shared service dependencies
        const mockDragonfly = {
            getClient: vi.fn(),
            getSubscriber: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            execute: vi.fn()
        };
        container.register(Tokens.Dragonfly, { useValue: mockDragonfly });

        // Reset mocks
        vi.clearAllMocks();
        controller = new AgentController();
    });

    describe('execute', () => {
        it('should execute agent task successfully', async () => {
            const req = createMockRequest({
                goal: 'Find all products under $50',
                url: 'https://example.com/products',
                mode: 'smart'
            });
            const res = createMockResponse();

            const mockResult = {
                success: true,
                goal: 'Find all products under $50',
                steps: [],
                result: { products: [] }
            };

            mockExecute.mockResolvedValue(mockResult);

            await controller.execute(req, res);

            expect(mockExecute).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true
                })
            );
        });

        it('should handle validation errors for missing url', async () => {
            const req = createMockRequest({
                goal: 'Find products',
                mode: 'smart'
                // Missing url
            });
            const res = createMockResponse();

            await controller.execute(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'VALIDATION_ERROR'
                    })
                })
            );
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('should handle validation errors for missing goal', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                mode: 'smart'
                // Missing goal
            });
            const res = createMockResponse();

            await controller.execute(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'VALIDATION_ERROR'
                    })
                })
            );
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('should handle agent execution errors', async () => {
            const req = createMockRequest({
                goal: 'Find products',
                url: 'https://example.com',
                mode: 'smart'
            });
            const res = createMockResponse();

            mockExecute.mockRejectedValue(new Error('Agent failed'));

            await controller.execute(req, res);

            expect(res.status).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false
                })
            );
        });

        it('should pass correct parameters to orchestrator', async () => {
            const req = createMockRequest({
                goal: 'Find products',
                url: 'https://example.com',
                mode: 'agent'
            });
            const res = createMockResponse();

            mockExecute.mockResolvedValue({
                success: true,
                steps: [],
                result: {}
            });

            await controller.execute(req, res);

            expect(mockExecute).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'https://example.com',
                    goal: 'Find products',
                    mode: 'agent'
                })
            );
        });
    });
});
