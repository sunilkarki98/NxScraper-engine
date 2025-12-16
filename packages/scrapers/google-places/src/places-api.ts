import { Client, PlaceInputType, PlaceData, PlaceType1 } from '@googlemaps/google-maps-services-js';
import { getAICache } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { CircuitBreaker } from '@nx-scraper/shared'; // Auto-import if exported
import { createHash } from 'crypto';
import { isMainThread } from 'worker_threads';

export interface PlaceSearchOptions {
    query: string;
    location?: { lat: number; lng: number };
    radius?: number;
    type?: string;
    maxResults?: number;
}

export interface PlaceResult {
    placeId: string;
    name: string;
    address: string;
    phone: string | null;
    website: string | null;
    rating: number | null;
    reviewCount: number | null;
    priceLevel: number | null;
    hours: unknown | null;
    location: {
        lat: number;
        lng: number;
    };
    photos: string[];
    cuisineTypes: string[];
    verified: boolean;
}

export class GooglePlacesAPI {
    private client: Client;
    private apiKey: string;
    private _cache: ReturnType<typeof getAICache> | null = null;
    private readonly baseUrl = 'https://www.google.com/maps/search/';
    private readonly CACHE_TTL = 86400; // 24 hours
    private readonly CACHE_ENABLED = true; // Enabled for both main thread and workers
    private breaker: CircuitBreaker;
    private fallbackHandler?: (query: string) => Promise<PlaceResult[]>;

    // Lazy cache getter
    private get cache(): ReturnType<typeof getAICache> | null {
        if (!this._cache && this.CACHE_ENABLED) {
            this._cache = getAICache();
        }
        return this._cache;
    }

    constructor(apiKey?: string, options?: { fallbackHandler?: (query: string) => Promise<PlaceResult[]> }) {
        this.apiKey = apiKey || process.env.GOOGLE_PLACES_API_KEY || '';

        if (!this.apiKey) {
            logger.warn('⚠️ GOOGLE_PLACES_API_KEY not configured. Places API will not work.');
        }

        this.client = new Client({});
        this.breaker = new CircuitBreaker('google-places-api', {
            failureThreshold: 5,
            cooldownMs: 60000, // 1 minute
            successThreshold: 2
        });
        this.fallbackHandler = options?.fallbackHandler;
        logger.info('🗺️ Google Places API initialized');
    }

    /**
     * Search places by text query
     */
    async searchByText(options: PlaceSearchOptions): Promise<PlaceResult[]> {
        if (!this.apiKey) {
            logger.warn('⚠️ Google Places API key not configured, falling back to web scraping');
            return await this.fallbackToScraper(options);
        }

        // Check cache first (only in main thread)
        if (this.CACHE_ENABLED && this.cache) {
            const cacheKey = this.generateCacheKey('text-search', options);
            const cached = await this.cache.get<PlaceResult[]>(cacheKey).catch(() => null);

            if (cached) {
                logger.info('📦 Returning cached Places API results');
                return cached;
            }
        }

        try {
            logger.info({ query: options.query }, '🔍 Searching Google Places API');

            const response = await this.breaker.execute(() => this.client.textSearch({
                params: {
                    query: options.query,
                    key: this.apiKey,
                    type: options.type as PlaceType1
                },
                timeout: 10000
            }));

            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                // 🧠 SMART FALLBACK: Check if quota exceeded or API error
                if (this.isQuotaExceeded(response.data.status) || this.isAPIError(response.data.status)) {
                    logger.warn({ status: response.data.status }, '🔄 API failed, falling back to web scraping');
                    return await this.fallbackToScraper(options);
                }
                throw new Error(`Places API error: ${response.data.status}`);
            }

            const maxResults = options.maxResults || 20;
            const places = response.data.results.slice(0, maxResults);

            // Mapped directly from search results WITHOUT additional API calls
            // This prevents the N+1 cost explosion
            const mappedPlaces = places.map((place) => this.mapPlaceToResult(place));

            // Cache results (only in main thread)
            if (this.CACHE_ENABLED && this.cache) {
                const cacheKey = this.generateCacheKey('text-search', options);
                await this.cache.set(cacheKey, mappedPlaces, this.CACHE_TTL).catch((err: unknown) => {
                    logger.warn({ err }, 'Failed to cache Places API results');
                });
            }

            logger.info({ count: mappedPlaces.length }, '✅ Places API search complete');
            return mappedPlaces;

        } catch (error: unknown) {
            logger.error({ error }, 'Places API search failed, attempting web scraping fallback');
            // 🧠 RESILIENCE: Fall back to scraper on any error
            return await this.fallbackToScraper(options);
        }
    }

    /**
     * Search nearby places
     */
    async searchNearby(location: { lat: number; lng: number }, radius: number, type: string): Promise<PlaceResult[]> {
        if (!this.apiKey) {
            throw new Error('Google Places API key not configured');
        }

        if (this.CACHE_ENABLED && this.cache) {
            const cacheKey = this.generateCacheKey('nearby', { location, radius, type });
            const cached = await this.cache.get<PlaceResult[]>(cacheKey).catch(() => null);

            if (cached) {
                logger.info('📦 Returning cached nearby results');
                return cached;
            }
        }

        try {
            const response = await this.breaker.execute(() => this.client.placesNearby({
                params: {
                    location,
                    radius,
                    type: type,
                    key: this.apiKey
                },
                timeout: 10000
            }));

            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Places API error: ${response.data.status}`);
            }

            const mappedPlaces = response.data.results.map((place) => this.mapPlaceToResult(place));

            if (this.CACHE_ENABLED && this.cache) {
                const cacheKey = this.generateCacheKey('nearby', { location, radius, type });
                await this.cache.set(cacheKey, mappedPlaces, this.CACHE_TTL).catch((err: unknown) => {
                    logger.warn({ err }, 'Failed to cache nearby results');
                });
            }
            return mappedPlaces;

        } catch (error: unknown) {
            logger.error({ error }, 'Nearby search failed');
            throw error;
        }
    }

    /**
     * Get detailed information for a specific place
     * Call this ONLY when user clicks on a specific result
     */
    public async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
        if (!this.apiKey) {
            throw new Error('Google Places API key not configured');
        }

        if (this.CACHE_ENABLED && this.cache) {
            const cacheKey = this.generateCacheKey('details', { placeId });
            const cached = await this.cache.get<PlaceResult>(cacheKey).catch(() => null);

            if (cached) {
                return cached;
            }
        }

        try {
            const response = await this.breaker.execute(() => this.client.placeDetails({
                params: {
                    place_id: placeId,
                    fields: ['name', 'formatted_address', 'formatted_phone_number', 'website', 'rating', 'user_ratings_total', 'price_level', 'opening_hours', 'geometry', 'photos', 'types'],
                    key: this.apiKey
                },
                timeout: 5000
            }));

            if (response.data.status !== 'OK') {
                return null;
            }

            const result = this.mapPlaceToResult({ place_id: placeId, ...response.data.result });

            if (this.CACHE_ENABLED && this.cache) {
                const cacheKey = this.generateCacheKey('details', { placeId });
                await this.cache.set(cacheKey, result, this.CACHE_TTL).catch((err: unknown) => {
                    logger.warn({ err }, 'Failed to cache place details');
                });
            }

            return result;
        } catch (error) {
            logger.warn({ placeId, error }, 'Failed to fetch place details');
            return null;
        }
    }

    /**
     * Map basic place data to PlaceResult
     */
    private mapPlaceToResult(place: Partial<PlaceData>): PlaceResult {
        return {
            placeId: place.place_id!,
            name: place.name || '',
            address: place.formatted_address || place.vicinity || '',
            phone: place.formatted_phone_number || null, // Will be null in list search usually
            website: place.website || null,              // Will be null in list search usually
            rating: place.rating || null,
            reviewCount: place.user_ratings_total || null,
            priceLevel: place.price_level || null,
            hours: place.opening_hours || null,
            location: {
                lat: place.geometry?.location.lat || 0,
                lng: place.geometry?.location.lng || 0
            },
            photos: this.extractPhotoUrls(place.photos),
            cuisineTypes: this.extractCuisineTypes(place.types),
            verified: place.business_status === 'OPERATIONAL'
        };
    }

    /**
     * Extract photo URLs
     */
    private extractPhotoUrls(photos: { photo_reference: string }[] | undefined): string[] {
        if (!photos) return [];

        return photos.slice(0, 5).map(photo => {
            const photoReference = photo.photo_reference;
            return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoReference}&key=${this.apiKey}`;
        });
    }

    /**
     * Extract cuisine types from Google types
     */
    private extractCuisineTypes(types: string[] | undefined): string[] {
        if (!types) return [];

        const cuisineKeywords = [
            'restaurant', 'cafe', 'bar', 'bakery', 'meal_delivery',
            'meal_takeaway', 'food'
        ];

        return types.filter(type => !cuisineKeywords.includes(type));
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(method: string, params: unknown): string {
        const data = JSON.stringify({ method, params });
        return 'places-api:' + createHash('md5').update(data).digest('hex');
    }

    /**
     * Check if API is configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Check if API error is quota related
     */
    private isQuotaExceeded(status: string): boolean {
        return status === 'OVER_QUERY_LIMIT' || status === 'REQUEST_DENIED';
    }

    /**
     * Check if API error requires fallback
     */
    private isAPIError(status: string): boolean {
        return status === 'UNKNOWN_ERROR' || status === 'INVALID_REQUEST';
    }

    /**
     * 🧠 HYBRID FALLBACK: Use injected fallback handler when API fails
     */
    /**
     * 🧠 HYBRID FALLBACK: Use injected fallback handler when API fails
     * Now strictly wired to GoogleScraper
     */
    private async fallbackToScraper(options: PlaceSearchOptions): Promise<PlaceResult[]> {
        logger.info({ query: options.query }, '🕷️ 🔄 Hybrid Fallback: Switching to GoogleScraper...');

        try {
            // Lazy load GoogleScraper to avoid circular init issues if any
            const { GoogleScraper } = await import('@nx-scraper/google-scraper');
            const scraper = new GoogleScraper();

            // Execute scrape
            // Construct a search URL for Google Maps
            const safeQuery = encodeURIComponent(options.query);
            const searchUrl = `https://www.google.com/search?q=${safeQuery}&tbm=lcl`; // tbm=lcl forces Local Pack view

            const scrapeResult = await scraper.scrape({
                url: searchUrl,
                proxy: undefined, // Let scraper/proxy-manager decide
                bypassCache: false
            });

            if (!scrapeResult.success || !scrapeResult.data?.localPackResults) {
                logger.warn('⚠️ Hybrid Fallback: Scraper returned no results');
                return [];
            }

            // Map Scrape Result to PlaceResult
            const results: PlaceResult[] = scrapeResult.data.localPackResults.map((item: any): PlaceResult => {
                return {
                    placeId: `scraped_${createHash('md5').update(item.name + item.address).digest('hex').substring(0, 10)}`, // Generate synthetic ID
                    name: item.name,
                    address: item.address,
                    phone: item.phone || null,
                    website: item.website || null,
                    rating: parseFloat(item.rating) || null,
                    reviewCount: null, // Scraper doesn't get this easily yet
                    priceLevel: null,
                    hours: null,
                    location: { lat: 0, lng: 0 }, // We don't get geocodes from list scrape
                    photos: [],
                    cuisineTypes: [],
                    verified: false // Scraped data is never "verified"
                };
            });

            logger.info({ count: results.length }, '✅ Hybrid Fallback: Successfully recovered data via scraping');

            // Cache fallback results
            if (this.CACHE_ENABLED && this.cache) {
                const cacheKey = this.generateCacheKey('fallback-search', options);
                await this.cache.set(cacheKey, results, this.CACHE_TTL).catch(() => { });
            }

            return results;

        } catch (error) {
            logger.error({ error }, '❌ Hybrid Fallback failed completely');
            return [];
        }
    }

    /**
     * Parse price level string to number
     */
    private parsePriceLevel(priceLevel: string): number {
        const dollarSigns = (priceLevel.match(/\$/g) || []).length;
        return dollarSigns || 2;
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        if (!this.apiKey) return false;

        try {
            // Simple API check
            await this.client.textSearch({
                params: {
                    query: 'restaurant',
                    key: this.apiKey
                },
                timeout: 5000
            });
            return true;
        } catch {
            return false;
        }
    }
}

// Singleton
let placesAPIInstance: GooglePlacesAPI | null = null;

export function getGooglePlacesAPI(): GooglePlacesAPI {
    if (!placesAPIInstance) {
        placesAPIInstance = new GooglePlacesAPI();
    }
    return placesAPIInstance;
}
