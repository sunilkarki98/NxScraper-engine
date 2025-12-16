import { GooglePlacesAPI, getGooglePlacesAPI, PlaceResult } from '@nx-scraper/google-places';
import { pluginManager } from '../plugins/plugin-manager.js';
import { Business, BusinessSearchResult, getAICache, logger } from '@nx-scraper/shared';
import { createHash } from 'crypto';

export interface BusinessSearchOptions {
    query: string;
    businessType?: string; // 'restaurant', 'hotel', 'gym', 'cafe', 'shop', etc. (optional)
    location?: { lat: number; lng: number };
    radius?: number;
    maxResults?: number;
    strategy?: 'auto' | 'places-api' | 'scraper' | 'hybrid';
    bypassCache?: boolean;
}

/**
 * Generic Business Search Service
 * Works for ANY business type: restaurants, hotels, gyms, cafes, shops, salons, etc.
 */

interface GoogleScraperHours {
    weekday_text?: string[];
    [key: string]: unknown;
}

interface GoogleScraperBusiness {
    name: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: string | number;
    priceLevel?: string;
    [key: string]: unknown;
}

export class BusinessSearchService {
    private placesAPI: GooglePlacesAPI;
    private cache = getAICache();
    private readonly CACHE_TTL = 21600; // 6 hours

    constructor() {
        this.placesAPI = getGooglePlacesAPI();
        logger.info('🔍 Business Search Service initialized (supports all business types)');
    }

    /**
     * Search for businesses with intelligent strategy selection
     * Examples:
     * - "restaurants in kathmandu"
     * - "hotels near Times Square"
     * - "gyms in London"
     * - "coffee shops in Seattle"
     */
    async search(options: BusinessSearchOptions): Promise<BusinessSearchResult> {
        const startTime = Date.now();
        const strategy = options.strategy || 'auto';

        // Check unified cache first
        const cacheKey = this.generateCacheKey(options);
        if (!options.bypassCache) {
            const cached = await this.cache.get<BusinessSearchResult>(cacheKey);
            if (cached) {
                logger.info('📦 Returning cached business search results');
                return {
                    ...cached,
                    metadata: {
                        ...cached.metadata,
                        executionTime: Date.now() - startTime
                    }
                };
            }
        }

        logger.info({ query: options.query, businessType: options.businessType, strategy }, '🔍 Starting business search');

        let result: BusinessSearchResult;

        try {
            switch (strategy) {
                case 'places-api':
                    result = await this.searchPlacesAPI(options);
                    break;
                case 'scraper':
                    result = await this.searchScraper(options);
                    break;
                case 'hybrid':
                    result = await this.searchHybrid(options);
                    break;
                case 'auto':
                default:
                    result = await this.searchAuto(options);
                    break;
            }

            result.metadata.executionTime = Date.now() - startTime;

            // Cache results
            await this.cache.set(cacheKey, result, this.CACHE_TTL);

            return result;

        } catch (error: unknown) {
            logger.error(error, 'Business search failed');

            // Try to return cached results as fallback
            const cached = await this.cache.get<BusinessSearchResult>(cacheKey);
            if (cached) {
                logger.warn('⚠️ Returning stale cached results due to error');
                return cached;
            }

            throw error;
        }
    }

    /**
     * Auto strategy: Choose best approach based on API availability
     */
    private async searchAuto(options: BusinessSearchOptions): Promise<BusinessSearchResult> {
        const fallbacksUsed: string[] = [];

        // 1. Try Places API first (best quality)
        if (this.placesAPI.isConfigured()) {
            try {
                logger.info('🎯 Auto strategy: Trying Places API');
                const result = await this.searchPlacesAPI(options);
                return result;
            } catch (error: unknown) {
                logger.warn(error, '⚠️ Places API failed, falling back to scraper');
                fallbacksUsed.push('places-api-failed');
            }
        } else {
            logger.info('ℹ️ Places API not configured, using scraper');
            fallbacksUsed.push('places-api-not-configured');
        }

        // 2. Fallback to Google Scraper
        try {
            const result = await this.searchScraper(options);
            result.metadata.fallbacksUsed = fallbacksUsed;
            return result;
        } catch (error: unknown) {
            logger.error(error, '❌ All search strategies failed');
            throw new Error('All search strategies failed. Please try again later.');
        }
    }

    /**
     * Search using Google Places API only
     */
    private async searchPlacesAPI(options: BusinessSearchOptions): Promise<BusinessSearchResult> {
        const places = await this.placesAPI.searchByText({
            query: options.query,
            location: options.location,
            radius: options.radius,
            type: options.businessType as any, // Can be 'restaurant', 'hotel', 'gym', etc.
            maxResults: options.maxResults || 50
        });

        const businesses = places.map(place => this.normalizePlaceResult(place, options.businessType));

        return {
            query: options.query,
            businessType: options.businessType,
            strategy: 'places-api',
            totalResults: businesses.length,
            businesses,
            metadata: {
                executionTime: 0, // Will be set by caller
                sources: {
                    placesAPI: businesses.length
                },
                fallbacksUsed: [],
                costEstimate: this.estimatePlacesAPICost(businesses.length)
            }
        };
    }

    /**
     * Search using Google Scraper only
     */
    private async searchScraper(options: BusinessSearchOptions): Promise<BusinessSearchResult> {
        // Construct Google Maps search URL
        const searchUrl = this.constructGoogleMapsURL(options.query, options.location);

        // Get Google Scraper from plugin manager
        const googleScraper = pluginManager.getScraperByName('google-scraper');
        if (!googleScraper) {
            throw new Error(
                'Google Scraper not available. Please ensure @nx-scraper/google-scraper is installed.'
            );
        }

        const scrapeResult = await googleScraper.scrape({
            url: searchUrl,
            maxLinks: options.maxResults || 50,
            bypassCache: options.bypassCache
        });

        if (!scrapeResult.success) {
            throw new Error(`Scraper failed: ${scrapeResult.error}`);
        }

        const businesses = (scrapeResult.data?.localPackResults || []).map((business: GoogleScraperBusiness) =>
            this.normalizeScraperResult(business, options.businessType)
        );

        return {
            query: options.query,
            businessType: options.businessType,
            strategy: 'scraper',
            totalResults: businesses.length,
            businesses,
            metadata: {
                executionTime: 0,
                sources: {
                    scraper: businesses.length
                },
                fallbacksUsed: [],
                costEstimate: 0 // Free
            }
        };
    }

    /**
     * Hybrid strategy: Use both and merge results
     */
    private async searchHybrid(options: BusinessSearchOptions): Promise<BusinessSearchResult> {
        const results = await Promise.allSettled([
            this.placesAPI.isConfigured() ? this.searchPlacesAPI(options) : Promise.reject('Not configured'),
            this.searchScraper(options)
        ]);

        const placesResult = results[0].status === 'fulfilled' ? results[0].value : null;
        const scraperResult = results[1].status === 'fulfilled' ? results[1].value : null;

        if (!placesResult && !scraperResult) {
            throw new Error('Both search methods failed');
        }

        // Merge and deduplicate
        const allBusinesses = [
            ...(placesResult?.businesses || []),
            ...(scraperResult?.businesses || [])
        ];

        const uniqueBusinesses = this.deduplicateBusinesses(allBusinesses);

        return {
            query: options.query,
            businessType: options.businessType,
            strategy: 'hybrid',
            totalResults: uniqueBusinesses.length,
            businesses: uniqueBusinesses,
            metadata: {
                executionTime: 0,
                sources: {
                    placesAPI: placesResult?.totalResults || 0,
                    scraper: scraperResult?.totalResults || 0
                },
                fallbacksUsed: [],
                costEstimate: this.estimatePlacesAPICost(placesResult?.totalResults || 0)
            }
        };
    }

    /**
     * Normalize Google Places result to Business interface
     */
    private normalizePlaceResult(place: PlaceResult, businessType?: string): Business {
        return {
            id: place.placeId,
            name: place.name,
            businessType,
            address: place.address,
            phone: place.phone,
            website: place.website,
            location: place.location,
            rating: place.rating,
            reviewCount: place.reviewCount,
            priceLevel: place.priceLevel,
            hours: this.normalizeHours(place.hours as GoogleScraperHours),
            categories: place.cuisineTypes, // Generic categories
            photos: place.photos,
            verified: place.verified,
            source: 'google-places',
            fetchedAt: new Date().toISOString(),
            dataCompleteness: this.calculateCompleteness(place as unknown as Record<string, unknown>)
        };
    }

    /**
     * Normalize Google Scraper result to Business interface
     */
    private normalizeScraperResult(business: GoogleScraperBusiness, businessType?: string): Business {
        return {
            id: createHash('md5').update(business.name + (business.address || '')).digest('hex'),
            name: business.name,
            businessType,
            address: business.address || '',
            phone: business.phone || null,
            website: business.website || null,
            location: {
                lat: 0,
                lng: 0
            },
            rating: business.rating ? parseFloat(String(business.rating)) : null,
            reviewCount: null,
            priceLevel: this.parsePriceLevel(business.priceLevel),
            hours: null,
            categories: [],
            photos: [],
            verified: false,
            source: 'google-scraper',
            fetchedAt: new Date().toISOString(),
            dataCompleteness: this.calculateCompleteness(business)
        };
    }

    /**
     * Deduplicate businesses by name similarity
     */
    private deduplicateBusinesses(businesses: Business[]): Business[] {
        const seen = new Map<string, Business>();

        for (const business of businesses) {
            const key = business.name.toLowerCase().trim().replace(/[^\w\s]/g, '');

            if (!seen.has(key)) {
                seen.set(key, business);
            } else {
                // Keep the one with better completeness or from Places API
                const existing = seen.get(key)!;
                if (business.source === 'google-places' && existing.source !== 'google-places') {
                    seen.set(key, business);
                } else if (business.dataCompleteness > existing.dataCompleteness) {
                    seen.set(key, business);
                }
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Calculate data completeness score (0-100)
     */
    private calculateCompleteness(data: Record<string, unknown>): number {
        const fields = ['name', 'address', 'phone', 'website', 'rating'];
        const score = fields.filter(field => data[field]).length;
        return Math.round((score / fields.length) * 100);
    }

    /**
     * Normalize opening hours
     */
    private normalizeHours(hours: GoogleScraperHours | undefined): Record<string, string> | null {
        if (!hours || !hours.weekday_text) return null;

        const normalized: Record<string, string> = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        hours.weekday_text.forEach((text: string, index: number) => {
            const day = days[index].toLowerCase();
            normalized[day] = text.replace(`${days[index]}: `, '');
        });

        return normalized;
    }

    /**
     * Parse price level from text
     */
    private parsePriceLevel(priceText: string | undefined): number | null {
        if (!priceText) return null;
        const count = (priceText.match(/\$/g) || []).length;
        return count > 0 ? count : null;
    }

    /**
     * Construct Google Maps search URL
     */
    private constructGoogleMapsURL(query: string, location?: { lat: number; lng: number }): string {
        const baseUrl = 'https://www.google.com/maps/search/';
        const encodedQuery = encodeURIComponent(query);

        if (location) {
            return `${baseUrl}${encodedQuery}/@${location.lat},${location.lng},14z`;
        }

        return `${baseUrl}${encodedQuery}`;
    }

    /**
     * Estimate Places API cost
     */
    private estimatePlacesAPICost(resultCount: number): number {
        // Text Search: $0.032 per request
        // Place Details: $0.017 per request
        const searchCost = 0.032;
        const detailsCost = resultCount * 0.017;
        return searchCost + detailsCost;
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(options: BusinessSearchOptions): string {
        const data = JSON.stringify({
            query: options.query,
            businessType: options.businessType,
            location: options.location,
            radius: options.radius,
            maxResults: options.maxResults
        });
        return 'business-search:' + createHash('md5').update(data).digest('hex');
    }
}

// Singleton
let searchServiceInstance: BusinessSearchService | null = null;

export function getBusinessSearchService(): BusinessSearchService {
    if (!searchServiceInstance) {
        searchServiceInstance = new BusinessSearchService();
    }
    return searchServiceInstance;
}
