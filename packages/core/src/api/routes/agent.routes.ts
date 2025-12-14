import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';
import { apiKeyRateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new AgentController();

// Protect all agent routes with API key
router.use(requireAPIKey);
router.use(apiKeyRateLimit);

router.post('/execute', (req, res) => controller.execute(req, res));

export default router;
