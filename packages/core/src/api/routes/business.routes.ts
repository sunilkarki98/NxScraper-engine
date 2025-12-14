import express from 'express';
import { BusinessController } from '../controllers/business.controller.js';

const router = express.Router();
const controller = new BusinessController();

/**
 * @route GET /api/v1/business/search
 * @desc Search for ANY type of business using Google Places API or web scraping
 * @access Public
 * 
 * @example Search for restaurants
 * GET /api/v1/business/search?query=restaurants+in+kathmandu&strategy=auto
 * 
 * @example Search for hotels
 * GET /api/v1/business/search?query=hotels+in+paris&businessType=hotel&maxResults=20
 * 
 * @example Search for gyms nearby
 * GET /api/v1/business/search?query=gyms+near+me&lat=27.7172&lng=85.324&radius=5000
 * 
 * @example Search for coffee shops
 * GET /api/v1/business/search?query=coffee+shops+in+seattle&businessType=cafe
 * 
 * Query Parameters:
 * - query (required): Search query (e.g., "restaurants in kathmandu", "hotels in paris")
 * - businessType (optional): Specific type filter ("restaurant", "hotel", "gym", "cafe", etc.)
 * - lat (optional): Latitude for location-based search
 * - lng (optional): Longitude for location-based search
 * - radius (optional): Search radius in meters (default: 5000)
 * - maxResults (optional): Maximum results to return (default: 50)
 * - strategy (optional): 'auto' | 'places-api' | 'scraper' | 'hybrid' (default: 'auto')
 * - bypassCache (optional): 'true' | 'false' (default: 'false')
 * 
 * Response:
 * {
 *   "success": true,
 *   "query": "restaurants in kathmandu",
 *   "businessType": "restaurant",
 *   "strategy": "places-api",
 *   "totalResults": 47,
 *   "businesses": [
 *     {
 *       "id": "ChIJ...",
 *       "name": "Krishnarpan Restaurant",
 *       "businessType": "restaurant",
 *       "address": "Battisputali Road, Kathmandu 44600, Nepal",
 *       "phone": "+977-1-4479488",
 *       "website": "https://www.dwarikas.com",
 *       "rating": 4.8,
 *       "priceLevel": 4,
 *       "verified": true,
 *       "source": "google-places"
 *     }
 *   ],
 *   "metadata": {
 *     "executionTime": 2341,
 *     "sources": { "placesAPI": 47 },
 *     "costEstimate": 0.83
 *   }
 * }
 */
router.get('/search', (req, res) => controller.search(req, res));

/**
 * @route GET /api/v1/business/stats
 * @desc Get supported business types and strategies
 * @access Public
 */
router.get('/stats', (req, res) => controller.getStats(req, res));

export default router;
