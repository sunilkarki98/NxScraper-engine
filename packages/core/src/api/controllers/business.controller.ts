import { Request, Response } from 'express';
import { getBusinessSearchService, BusinessSearchOptions } from '../../services/business-search.js';
import { logger } from '@nx-scraper/shared';
import { toAppError, logError } from '@nx-scraper/shared';
/**
 * Generic Business Controller
 * Handles searches for ANY business type: restaurants, hotels, gyms, cafes, shops, etc.
 */
export class BusinessController {
    private searchService = getBusinessSearchService();

    /**
     * Search for businesses of any type
     * GET /api/v1/business/search
     * 
     * Examples:
     * - /api/v1/business/search?query=restaurants+in+kathmandu
     * - /api/v1/business/search?query=hotels+in+paris&businessType=hotel
     * - /api/v1/business/search?query=gyms+near+me&lat=27.7172&lng=85.324&radius=5000
     */
    async search(req: Request, res: Response): Promise<void> {
        try {
            const {
                query,
                businessType,
                lat,
                lng,
                radius,
                maxResults,
                strategy,
                bypassCache
            } = req.query;

            // Validation
            if (!query || typeof query !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'Query parameter is required'
                });
                return;
            }

            // Parse options
            const searchOptions: BusinessSearchOptions = {
                query,
                businessType: businessType as string | undefined,
                maxResults: maxResults ? parseInt(maxResults as string) : 50,
                strategy: (strategy as 'auto' | 'places-api' | 'scraper' | 'hybrid') || 'auto',
                bypassCache: bypassCache === 'true'
            };

            if (lat && lng) {
                searchOptions.location = {
                    lat: parseFloat(lat as string),
                    lng: parseFloat(lng as string)
                };
            }

            if (radius) {
                searchOptions.radius = parseInt(radius as string);
            }

            logger.info({
                query,
                businessType: searchOptions.businessType,
                strategy: searchOptions.strategy
            }, 'Business search request');

            const result = await this.searchService.search(searchOptions);

            res.json({
                success: true,
                ...result
            });

        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'business/search' });
            res.status(appError.statusCode).json({
                success: false,
                error: appError.message
            });
        }
    }

    /**
     * Get search statistics
     * GET /api/v1/business/stats
     */
    async getStats(req: Request, res: Response): Promise<void> {
        try {
            res.json({
                success: true,
                message: 'Business search service active',
                supportedTypes: [
                    'restaurant', 'cafe', 'bar', 'bakery',
                    'hotel', 'lodging', 'hostel',
                    'gym', 'fitness_center', 'spa',
                    'shopping_mall', 'store',
                    'hospital', 'pharmacy',
                    'bank', 'atm',
                    'gas_station', 'car_repair',
                    'school', 'university',
                    'park', 'museum',
                    '... and any other Google Maps business type'
                ],
                strategies: ['auto', 'places-api', 'scraper', 'hybrid']
            });
        } catch (error) {
            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'business/stats' });
            res.status(appError.statusCode).json({
                success: false,
                error: appError.message
            });
        }
    }
}
