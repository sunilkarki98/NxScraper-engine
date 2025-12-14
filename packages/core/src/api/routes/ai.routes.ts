import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';
import { apiKeyRateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new AIController();

// Apply authentication and rate limiting to all routes
router.use(requireAPIKey);
router.use(apiKeyRateLimit);

/**
 * @openapi
 * /ai/pipeline:
 *   post:
 *     summary: Run full AI extraction pipeline
 *     tags: [AI]
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
 *               - html
 *             properties:
 *               url:
 *                 type: string
 *               html:
 *                 type: string
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [understand, schema, strategy, validate, selectors]
 *     responses:
 *       200:
 *         description: AI Pipeline results
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
 * */
router.post('/pipeline', controller.runPipeline.bind(controller));

// Individual Modules
/**
 * @openapi
 * /ai/understand:
 *   post:
 *     summary: Analyze page content key value pairs and context
 *     tags: [AI]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Page understanding result
 * */
router.post('/understand', controller.understandPage.bind(controller));
router.post('/selectors', controller.generateSelectors.bind(controller));
router.post('/schema', controller.inferSchema.bind(controller));
router.post('/strategy', controller.planStrategy.bind(controller));
router.post('/anti-blocking', controller.analyzeBlocking.bind(controller));
router.post('/validate', controller.validateData.bind(controller));

// Health, Stats & Management
/**
 * @openapi
 * /ai/health:
 *   get:
 *     summary: Check AI module health
 *     tags: [AI]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: AI Health Status
 * */
router.get('/health', controller.healthCheck.bind(controller));
router.get('/costs', controller.getCostStats.bind(controller));
router.post('/costs/reset', controller.resetCostTracking.bind(controller));
router.post('/cache/clear', controller.clearCache.bind(controller));

export default router;

