import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BusinessController } from '@core/api/controllers/business.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';
import type { BusinessSearchResult } from '@nx-scraper/shared/types/business.interface';
import { container, Tokens } from '@nx-scraper/shared';

// Mock the business search service
vi.mock('@core/services/business-search.js', () => ({
    getBusinessSearchService: vi.fn(() => mockSearchService)
}));

const mockSearchService = {
    search: vi.fn()
};

describe('BusinessController', () => {
    let controller: BusinessController;

    const mockSearchResult: BusinessSearchResult = {
        query: 'restaurants in kathmandu',
        businessType: 'restaurant',
        strategy: 'places-api',
        totalResults: 3,
        businesses: [
            {
                id: '1',
                name: 'Test Restaurant',
                address: '123 Test St',
                phone: '+1234567890',
                website: 'https://test.com',
                location: { lat: 27.7172, lng: 85.324 },
                rating: 4.5,
                reviewCount: 100,
                priceLevel: 2,
                verified: true,
                source: 'google-places' as const,
                fetchedAt: new Date().toISOString(),
                dataCompleteness: 85
            }
        ],
        metadata: {
            executionTime: 1500,
            sources: { placesAPI: 3 },
            fallbacksUsed: [],
            costEstimate: 0.015
        }
    };

    beforeEach(() => {
        const mockDragonfly = {
            getClient: vi.fn(),
            getSubscriber: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            execute: vi.fn()
        };
        container.register(Tokens.Dragonfly, { useValue: mockDragonfly });

        vi.clearAllMocks();
        controller = new BusinessController();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('search', () => {
        describe('validation', () => {
            it('should return 400 when query is missing', async () => {
                const req = createMockRequest({}, {});
                const res = createMockResponse();

                await controller.search(req, res);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Query parameter is required'
                });
            });

            it('should return 400 when query is not a string', async () => {
                const req = createMockRequest({}, { query: 123 });
                const res = createMockResponse();

                await controller.search(req, res);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Query parameter is required'
                });
            });
        });

        describe('successful searches', () => {
            it('should search with minimal parameters', async () => {
                const req = createMockRequest({}, { query: 'restaurants' });
                const res = createMockResponse();

                mockSearchService.search.mockResolvedValue(mockSearchResult);

                await controller.search(req, res);

                expect(mockSearchService.search).toHaveBeenCalledWith({
                    query: 'restaurants',
                    businessType: undefined,
                    maxResults: 50,
                    strategy: 'auto',
                    bypassCache: false
                });

                expect(res.json).toHaveBeenCalledWith({
                    success: true,
                    ...mockSearchResult
                });
            });

            it('should search with all parameters', async () => {
                const req = createMockRequest({}, {
                    query: 'restaurants in kathmandu',
                    businessType: 'restaurant',
                    lat: '27.7172',
                    lng: '85.324',
                    radius: '5000',
                    maxResults: '20',
                    strategy: 'hybrid',
                    bypassCache: 'true'
                });
                const res = createMockResponse();

                mockSearchService.search.mockResolvedValue(mockSearchResult);

                await controller.search(req, res);

                expect(mockSearchService.search).toHaveBeenCalledWith({
                    query: 'restaurants in kathmandu',
                    businessType: 'restaurant',
                    location: { lat: 27.7172, lng: 85.324 },
                    radius: 5000,
                    maxResults: 20,
                    strategy: 'hybrid',
                    bypassCache: true
                });
            });

            it('should parse numeric parameters correctly', async () => {
                const req = createMockRequest({}, {
                    query: 'hotels',
                    lat: '40.7128',
                    lng: '-74.0060',
                    radius: '10000',
                    maxResults: '100'
                });
                const res = createMockResponse();

                mockSearchService.search.mockResolvedValue(mockSearchResult);

                await controller.search(req, res);

                const callArgs = mockSearchService.search.mock.calls[0][0];
                expect(callArgs.location.lat).toBe(40.7128);
                expect(callArgs.location.lng).toBe(-74.0060);
                expect(callArgs.radius).toBe(10000);
                expect(callArgs.maxResults).toBe(100);
            });
        });

        describe('error handling', () => {
            it('should handle service errors gracefully', async () => {
                const req = createMockRequest({}, { query: 'test' });
                const res = createMockResponse();

                const error = new Error('Service unavailable');
                mockSearchService.search.mockRejectedValue(error);

                await controller.search(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: expect.any(String)
                    })
                );
            });
        });
    });

    describe('getStats', () => {
        it('should return stats successfully', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            await controller.getStats(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Business search service active',
                    supportedTypes: expect.arrayContaining(['restaurant', 'cafe', 'hotel', 'gym']),
                    strategies: expect.arrayContaining(['auto', 'places-api', 'scraper', 'hybrid'])
                })
            );
        });

        it('should include all strategies', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            await controller.getStats(req, res);

            const callArgs = res.json.mock.calls[0][0];
            expect(callArgs.strategies).toEqual(['auto', 'places-api', 'scraper', 'hybrid']);
        });
    });
});
