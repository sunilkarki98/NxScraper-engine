import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AIController } from '@core/api/controllers/ai.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';

vi.mock('@nx-scraper/shared/ai/ai-engine', () => ({
    getAIEngine: vi.fn(() => ({
        runPipeline: vi.fn(),
        pageUnderstanding: { execute: vi.fn() },
        selectorGeneration: { execute: vi.fn() },
        schemaInference: { execute: vi.fn() },
        strategyPlanning: { execute: vi.fn() },
        antiBlocking: { execute: vi.fn() },
        dataValidation: { execute: vi.fn() },
        healthCheck: vi.fn(),
        getStats: vi.fn(),
        getCostStats: vi.fn(),
        clearCache: vi.fn(),
        resetCostTracking: vi.fn()
    }))
}));

// We need to get the mocked instance to spy on it in tests
import { getAIEngine } from '@nx-scraper/shared/ai/ai-engine';
const mockAIEngine = getAIEngine() as unknown as {
    runPipeline: Mock;
    pageUnderstanding: { execute: Mock };
    selectorGeneration: { execute: Mock };
    schemaInference: { execute: Mock };
    strategyPlanning: { execute: Mock };
    antiBlocking: { execute: Mock };
    dataValidation: { execute: Mock };
    healthCheck: Mock;
    getStats: Mock;
    getCostStats: Mock;
    clearCache: Mock;
    resetCostTracking: Mock;
};
const mockPageUnderstanding = mockAIEngine.pageUnderstanding;
const mockSelectorGeneration = mockAIEngine.selectorGeneration;
const mockSchemaInference = mockAIEngine.schemaInference;
const mockStrategyPlanning = mockAIEngine.strategyPlanning;
const mockAntiBlocking = mockAIEngine.antiBlocking;
const mockDataValidation = mockAIEngine.dataValidation;

describe('AIController', () => {
    let controller: AIController;

    beforeEach(() => {
        controller = new AIController();
        vi.clearAllMocks();
    });

    describe('runPipeline', () => {
        it('should run full AI pipeline successfully', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                html: '<html><body>Test</body></html>',
                extractedData: { test: 'data' }
            });
            const res = createMockResponse();

            const mockResult = {
                understanding: { purpose: 'ecommerce' },
                selectors: { price: '.product-price' }
            };

            mockAIEngine.runPipeline.mockResolvedValue(mockResult);

            await controller.runPipeline(req, res);

            expect(mockAIEngine.runPipeline).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(mockResult);
        });

        it('should handle pipeline errors', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                html: '<html></html>'
            });
            const res = createMockResponse();

            mockAIEngine.runPipeline.mockRejectedValue(new Error('Pipeline failed'));

            await controller.runPipeline(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.any(String)
                })
            );
        });
    });

    describe('understandPage', () => {
        it('should understand page successfully', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                html: '<html><head><title>Shop</title></head></html>'
            });
            const res = createMockResponse();

            const mockUnderstanding = {
                purpose: 'E-commerce product page',
                dataTypes: ['products', 'prices']
            };

            mockPageUnderstanding.execute.mockResolvedValue(mockUnderstanding);

            await controller.understandPage(req, res);

            expect(res.json).toHaveBeenCalledWith(mockUnderstanding);
        });
    });

    describe('generateSelectors', () => {
        it('should generate selectors successfully', async () => {
            const req = createMockRequest({
                html: '<html><body><p class="price">$10</p></body></html>',
                fieldName: 'price'
            });
            const res = createMockResponse();

            const mockSelectors = {
                price: '.price'
            };

            mockSelectorGeneration.execute.mockResolvedValue(mockSelectors);

            await controller.generateSelectors(req, res);

            expect(res.json).toHaveBeenCalledWith(mockSelectors);
        });
    });

    describe('inferSchema', () => {
        it('should infer schema successfully', async () => {
            const req = createMockRequest({
                pageUnderstanding: { purpose: 'product' },
                extractedFields: { title: 'Product', price: 99.99 }
            });
            const res = createMockResponse();

            const mockSchema = {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    price: { type: 'number' }
                }
            };

            mockSchemaInference.execute.mockResolvedValue(mockSchema);

            await controller.inferSchema(req, res);

            expect(res.json).toHaveBeenCalledWith(mockSchema);
        });
    });

    describe('planStrategy', () => {
        it('should plan strategy successfully', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                pageUnderstanding: { purpose: 'list' }
            });
            const res = createMockResponse();

            const mockStrategy = {
                approach: 'pagination',
                steps: ['navigate', 'extract', 'next-page']
            };

            mockStrategyPlanning.execute.mockResolvedValue(mockStrategy);

            await controller.planStrategy(req, res);

            expect(res.json).toHaveBeenCalledWith(mockStrategy);
        });
    });

    describe('analyzeBlocking', () => {
        it('should analyze blocking successfully', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                html: '<html><body><div id="captcha"></div></body></html>'
            });
            const res = createMockResponse();

            const mockAnalysis = {
                hasCaptcha: true,
                hasRateLimit: false
            };

            mockAntiBlocking.execute.mockResolvedValue(mockAnalysis);

            await controller.analyzeBlocking(req, res);

            expect(res.json).toHaveBeenCalledWith(mockAnalysis);
        });
    });

    describe('validateData', () => {
        it('should validate data successfully', async () => {
            const req = createMockRequest({
                schema: { type: 'object' },
                extractedData: { price: 99.99 }
            });
            const res = createMockResponse();

            const mockValidation = {
                isValid: true,
                errors: []
            };

            mockDataValidation.execute.mockResolvedValue(mockValidation);

            await controller.validateData(req, res);

            expect(res.json).toHaveBeenCalledWith(mockValidation);
        });

        it('should return validation errors', async () => {
            const req = createMockRequest({
                schema: { type: 'object' },
                extractedData: { price: 'invalid' }
            });
            const res = createMockResponse();

            const mockValidation = {
                isValid: false,
                errors: ['price must be a number']
            };

            mockDataValidation.execute.mockResolvedValue(mockValidation);

            await controller.validateData(req, res);

            expect(res.json).toHaveBeenCalledWith(mockValidation);
        });
    });

    describe('healthCheck', () => {
        it('should return healthy status', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            mockAIEngine.healthCheck.mockResolvedValue({
                openai: true,
                anthropic: true
            });
            mockAIEngine.getStats.mockResolvedValue({
                requestCount: 100,
                totalCost: 5.25
            });

            await controller.healthCheck(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'healthy',
                    components: expect.any(Object),
                    stats: expect.any(Object)
                })
            );
        });

        it('should return degraded status when component unhealthy', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            mockAIEngine.healthCheck.mockResolvedValue({
                openai: false,
                anthropic: true
            });
            mockAIEngine.getStats.mockResolvedValue({});

            await controller.healthCheck(req, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'degraded'
                })
            );
        });
    });

    describe('getCostStats', () => {
        it('should return cost statistics', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            mockAIEngine.getCostStats.mockReturnValue({
                totalCost: 12.50,
                requestCount: 1000
            });

            await controller.getCostStats(req, res);

            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: expect.objectContaining({
                    totalCost: 12.50,
                    requestCount: 1000
                }),
                timestamp: expect.any(String)
            });
        });
    });

    describe('clearCache', () => {
        it('should clear cache successfully', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            mockAIEngine.clearCache.mockResolvedValue(undefined);

            await controller.clearCache(req, res);

            expect(mockAIEngine.clearCache).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'AI cache cleared successfully',
                timestamp: expect.any(String)
            });
        });
    });

    describe('resetCostTracking', () => {
        it('should reset cost tracking successfully', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            mockAIEngine.resetCostTracking.mockReturnValue(undefined);

            await controller.resetCostTracking(req, res);

            expect(mockAIEngine.resetCostTracking).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Cost tracking reset successfully',
                timestamp: expect.any(String)
            });
        });
    });
});
