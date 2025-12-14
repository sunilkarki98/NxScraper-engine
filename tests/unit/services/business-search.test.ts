import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import types first
import type { BusinessSearchOptions } from '@core/services/business-search';

// Mock modules BEFORE importing the service
vi.mock('@nx-scraper/google-places/places-api', () => ({
    getGooglePlacesAPI: vi.fn(() => ({
        searchNearby: vi.fn(),
        getPlaceDetails: vi.fn(),
        isConfigured: vi.fn(() => true)
    }))
}));

vi.mock('@core/plugins/plugin-manager.js', () => ({
    pluginManager: {
        getScraperByName: vi.fn(),
        scrape: vi.fn()
    }
}));

vi.mock('@nx-scraper/shared/ai/cache/ai-cache.js', () => ({
    getAICache: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn()
    }))
}));

// Now import after mocks are established
import { BusinessSearchService } from '@core/services/business-search';
import { getGooglePlacesAPI } from '@nx-scraper/google-places/places-api';
import { pluginManager } from '@core/plugins/plugin-manager.js';
import { getAICache } from '@nx-scraper/shared/ai/cache/ai-cache.js';

describe('BusinessSearchService', () => {
    let service: BusinessSearchService;
    let mockPlaces: any;
    let mockCache: any;

    beforeEach(() => {
        service = new BusinessSearchService();

        // Get mock instances
        mockPlaces = (getGooglePlacesAPI as any)();
        mockCache = (getAICache as any)();

        vi.clearAllMocks();

        // Set default behaviors
        mockPlaces.isConfigured.mockReturnValue(true);
        mockCache.get.mockResolvedValue(null);
        mockCache.set.mockResolvedValue(undefined);
    });

    describe('generateCacheKey', () => {
        it('should generate consistent cache keys for same options', () => {
            const options1: BusinessSearchOptions = {
                query: 'restaurants',
                location: { lat: 27.7172, lng: 85.324 },
                maxResults: 50
            };

            const options2: BusinessSearchOptions = {
                query: 'restaurants',
                location: { lat: 27.7172, lng: 85.324 },
                maxResults: 50
            };

            const key1 = (service as any).generateCacheKey(options1);
            const key2 = (service as any).generateCacheKey(options2);

            expect(key1).toBe(key2);
            expect(key1).toContain('business-search:');
        });

        it('should generate different keys for different queries', () => {
            const options1: BusinessSearchOptions = {
                query: 'restaurants',
                location: { lat: 27.7172, lng: 85.324 }
            };

            const options2: BusinessSearchOptions = {
                query: 'cafes',
                location: { lat: 27.7172, lng: 85.324 }
            };

            const key1 = (service as any).generateCacheKey(options1);
            const key2 = (service as any).generateCacheKey(options2);

            expect(key1).not.toBe(key2);
        });

        it('should generate different keys for different locations', () => {
            const options1: BusinessSearchOptions = {
                query: 'restaurants',
                location: { lat: 27.7172, lng: 85.324 }
            };

            const options2: BusinessSearchOptions = {
                query: 'restaurants',
                location: { lat: 40.7128, lng: -74.0060 }
            };

            const key1 = (service as any).generateCacheKey(options1);
            const key2 = (service as any).generateCacheKey(options2);

            expect(key1).not.toBe(key2);
        });
    });

    describe('estimatePlacesAPICost', () => {
        it('should return cost for result count', () => {
            const cost = (service as any).estimatePlacesAPICost(10);

            expect(cost).toBeGreaterThan(0);
            expect(typeof cost).toBe('number');
        });

        it('should scale cost with result count', () => {
            const cost10 = (service as any).estimatePlacesAPICost(10);
            const cost100 = (service as any).estimatePlacesAPICost(100);

            expect(cost100).toBeGreaterThan(cost10);
        });
    });

    describe('constructGoogleMapsURL', () => {
        it('should construct URL with query', () => {
            const url = (service as any).constructGoogleMapsURL('restaurants in NYC');

            expect(url).toContain('google.com/maps');
            expect(url).toContain('restaurants');
        });

        it('should include coordinates when provided', () => {
            const url = (service as any).constructGoogleMapsURL('restaurants', {
                lat: 40.7128,
                lng: -74.0060
            });

            expect(url).toContain('40.7128');
            expect(url).toContain('-74.006'); // URL trims trailing zeros
        });
    });

    describe('calculateCompleteness', () => {
        it('should return higher score for complete data', () => {
            const data = {
                name: 'Test Restaurant',
                address: '123 Main St',
                phone: '+1234567890',
                website: 'https://test.com',
                rating: 4.5,
                reviewCount: 100,
                hours: { monday: '9-5' },
                photos: ['photo1.jpg']
            };

            const score = (service as any).calculateCompleteness(data);

            expect(score).toBeGreaterThan(70);
        });

        it('should return lower score for minimal data', () => {
            const data = {
                name: 'Test',
                address: '123 St'
            };

            const score = (service as any).calculateCompleteness(data);

            expect(score).toBeLessThan(50);
        });
    });
});
