import { Router } from 'express';
import { ScrapeController } from '../controllers/scrape.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';
import { apiKeyRateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new ScrapeController();

// Apply authentication and rate limiting
router.use(requireAPIKey);
router.use(apiKeyRateLimit);

/**
 * @openapi
 * /scrape:
 *   post:
 *     summary: Submit a new scrape job
 *     tags: [Scrape]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - scraperType
 *             properties:
 *               url:
 *                 type: string
 *                 example: https://example.com
 *               scraperType:
 *                 type: string
 *                 enum: [universal-scraper, heavy-scraper, google-scraper, google-places, ai, auto]
 *                 example: universal-scraper
 *               options:
 *                 type: object
 *                 properties:
 *                   features:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       202:
 *         description: Job accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                     statusUrl:
 *                       type: string
 * */
router.post('/', controller.scrape.bind(controller));

/**
 * @openapi
 * /scrape/list:
 *   get:
 *     summary: List available scrapers
 *     tags: [Scrape]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of scrapers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     scrapers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           version:
 *                             type: string
 * */
router.get('/list', controller.listScrapers.bind(controller));

export default router;
